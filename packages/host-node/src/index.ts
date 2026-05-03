import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import type {
  FileSystemBatchOperation,
  FileSystemBatchRequest,
  FileSystemBatchResult,
  FileSystemDirectoryEntry,
  FileSystemEntryStatus,
  FileSystemInspectRequest,
  FileSystemListDirectoryRequest,
  FileSystemPort,
  GitCommandPort,
  GitCommandRequest,
  HttpPort,
  HttpRequest,
  HttpResponse,
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
  ProcessPort,
  ProcessRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"
import { createLlmTextClient } from "@repo-edu/integrations-llm"
import type { LlmRuntimeConfig } from "@repo-edu/integrations-llm-contract"

export const packageId = "@repo-edu/host-node"
export const workspaceDependencies = [hostRuntimePackageId] as const

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}

export function createWriteQueue() {
  let chain: Promise<void> = Promise.resolve()

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task)
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function resolveAtomicTempPath(path: string): string {
  return join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  )
}

export async function cleanupAtomicTempFiles(directory: string): Promise<void> {
  const entries = await readdir(directory).catch(() => [])
  const removals = entries
    .filter((name) => name.startsWith(".") && name.endsWith(".tmp"))
    .map((name) => rm(join(directory, name), { force: true }).catch(() => {}))
  await Promise.all(removals)
}

export async function writeTextFileAtomic(
  path: string,
  content: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  const parentDirectory = dirname(path)
  await mkdir(parentDirectory, { recursive: true })
  throwIfAborted(signal)
  const temporaryPath = resolveAtomicTempPath(path)
  const existing = await stat(path).catch(() => null)

  try {
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode: existing?.mode,
    })
    throwIfAborted(signal)
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

// ---------------------------------------------------------------------------
// NodeHttpPort — Node-side fetch implementation (architecture plan §3)
// ---------------------------------------------------------------------------

export function createNodeHttpPort(): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      const response = await globalThis.fetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: request.signal,
      })

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: await response.text(),
      }
    },
  }
}

// ---------------------------------------------------------------------------
// NodeProcessPort — explicit child_process.spawn wrapper (architecture plan §3)
// ---------------------------------------------------------------------------

export function createNodeProcessPort(): ProcessPort {
  return {
    cancellation: "best-effort",

    async run(request: ProcessRequest): Promise<ProcessResult> {
      throwIfAborted(request.signal)

      return await new Promise((resolve, reject) => {
        const child = spawn(request.command, request.args ?? [], {
          cwd: request.cwd,
          env: request.env ? { ...process.env, ...request.env } : process.env,
          stdio: "pipe",
        })

        let settled = false
        let stdout = ""
        let stderr = ""

        const onAbort = () => {
          if (settled) {
            return
          }

          child.stdin?.destroy()
          child.kill("SIGTERM")
        }

        const cleanup = () => {
          request.signal?.removeEventListener("abort", onAbort)
        }

        const settle = (callback: () => void) => {
          if (settled) {
            return
          }

          settled = true
          cleanup()
          callback()
        }

        request.signal?.addEventListener("abort", onAbort, { once: true })

        child.stdout?.setEncoding("utf8")
        child.stdout?.on("data", (chunk: string) => {
          stdout += chunk
        })

        child.stderr?.setEncoding("utf8")
        child.stderr?.on("data", (chunk: string) => {
          stderr += chunk
        })

        child.on("error", (error) => {
          settle(() => {
            reject(error)
          })
        })

        child.on("close", (exitCode, signal) => {
          settle(() => {
            resolve({
              exitCode,
              signal,
              stdout,
              stderr,
            })
          })
        })

        child.stdin?.end(request.stdinText)
      })
    },
  }
}

// ---------------------------------------------------------------------------
// NodeGitCommandPort — thin explicit system git wrapper for repo workflows (§3)
// ---------------------------------------------------------------------------

export function createNodeGitCommandPort(
  processPort: ProcessPort = createNodeProcessPort(),
): GitCommandPort {
  return {
    cancellation: processPort.cancellation,

    async run(request: GitCommandRequest): Promise<ProcessResult> {
      return await processPort.run({
        command: "git",
        args: request.args,
        cwd: request.cwd,
        env: request.env,
        stdinText: request.stdinText,
        signal: request.signal,
      })
    },
  }
}

async function inspectPath(path: string): Promise<FileSystemEntryStatus> {
  try {
    const entry = await stat(path)

    if (entry.isDirectory()) {
      return { path, kind: "directory" }
    }

    return { path, kind: "file" }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, kind: "missing" }
    }

    throw error
  }
}

async function applyFileSystemOperation(operation: FileSystemBatchOperation) {
  if (operation.kind === "ensure-directory") {
    await mkdir(operation.path, { recursive: true })
    return
  }

  if (operation.kind === "copy-directory") {
    await cp(operation.sourcePath, operation.destinationPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
    })
    return
  }

  await rm(operation.path, { force: true, recursive: true })
}

// ---------------------------------------------------------------------------
// NodeFileSystemPort — explicit filesystem primitives for repo workflows (§3)
// ---------------------------------------------------------------------------

function resolveUserHomeSystemDirectories(): readonly string[] {
  const home = homedir()
  switch (process.platform) {
    case "darwin":
      return [join(home, "Library"), join(home, "Applications")]
    case "win32":
      return [join(home, "AppData")]
    default:
      return []
  }
}

export function createNodeFileSystemPort(): FileSystemPort {
  return {
    userHomeSystemDirectories: resolveUserHomeSystemDirectories(),

    async inspect(
      request: FileSystemInspectRequest,
    ): Promise<FileSystemEntryStatus[]> {
      throwIfAborted(request.signal)

      const statuses: FileSystemEntryStatus[] = []

      for (const path of request.paths) {
        throwIfAborted(request.signal)
        statuses.push(await inspectPath(path))
      }

      return statuses
    },

    async applyBatch(
      request: FileSystemBatchRequest,
    ): Promise<FileSystemBatchResult> {
      throwIfAborted(request.signal)

      const completed: FileSystemBatchOperation[] = []

      for (const operation of request.operations) {
        throwIfAborted(request.signal)
        await applyFileSystemOperation(operation)
        completed.push(operation)
      }

      return { completed }
    },

    async createTempDirectory(prefix: string): Promise<string> {
      return mkdtemp(join(tmpdir(), prefix))
    },

    async listDirectory(
      request: FileSystemListDirectoryRequest,
    ): Promise<FileSystemDirectoryEntry[]> {
      throwIfAborted(request.signal)
      const entries = await readdir(request.path, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory()
            ? ("directory" as const)
            : ("file" as const),
        }))
    },
  }
}

// ---------------------------------------------------------------------------
// NodeLlmPort — thin adapter over the multi-provider LlmTextClient dispatcher
// from @repo-edu/integrations-llm. Routes by `spec.provider` to either the
// Claude or Codex prompt/reply adapter.
// ---------------------------------------------------------------------------

export function createNodeLlmPort(config?: LlmRuntimeConfig): LlmPort {
  const client = createLlmTextClient(config)
  return {
    async run(request: LlmRunRequest): Promise<LlmRunResult> {
      throwIfAborted(request.signal)
      const result = await client.generateText({
        spec: request.spec,
        prompt: request.prompt,
        signal: request.signal,
      })
      return {
        reply: result.reply,
        usage: result.usage,
      }
    },
  }
}
