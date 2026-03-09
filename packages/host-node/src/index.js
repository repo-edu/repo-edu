import { spawn } from "node:child_process"
import { mkdir, rm, stat } from "node:fs/promises"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"
export const packageId = "@repo-edu/host-node"
export const workspaceDependencies = [hostRuntimePackageId]
function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error("Operation cancelled.")
  }
}
// ---------------------------------------------------------------------------
// NodeHttpPort — Node-side fetch implementation (architecture plan §3)
// ---------------------------------------------------------------------------
export function createNodeHttpPort() {
  return {
    async fetch(request) {
      const response = await globalThis.fetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: request.signal,
      })
      const headers = {}
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
export function createNodeProcessPort() {
  return {
    cancellation: "best-effort",
    async run(request) {
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
        const settle = (callback) => {
          if (settled) {
            return
          }
          settled = true
          cleanup()
          callback()
        }
        request.signal?.addEventListener("abort", onAbort, { once: true })
        child.stdout?.setEncoding("utf8")
        child.stdout?.on("data", (chunk) => {
          stdout += chunk
        })
        child.stderr?.setEncoding("utf8")
        child.stderr?.on("data", (chunk) => {
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
  processPort = createNodeProcessPort(),
) {
  return {
    cancellation: processPort.cancellation,
    async run(request) {
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
async function inspectPath(path) {
  try {
    const entry = await stat(path)
    if (entry.isDirectory()) {
      return { path, kind: "directory" }
    }
    return { path, kind: "file" }
  } catch (error) {
    if (error.code === "ENOENT") {
      return { path, kind: "missing" }
    }
    throw error
  }
}
async function applyFileSystemOperation(operation) {
  if (operation.kind === "ensure-directory") {
    await mkdir(operation.path, { recursive: true })
    return
  }
  await rm(operation.path, {
    force: true,
    recursive: true,
  })
}
// ---------------------------------------------------------------------------
// NodeFileSystemPort — explicit filesystem primitives for repo workflows (§3)
// ---------------------------------------------------------------------------
export function createNodeFileSystemPort() {
  return {
    async inspect(request) {
      throwIfAborted(request.signal)
      const statuses = []
      for (const path of request.paths) {
        throwIfAborted(request.signal)
        statuses.push(await inspectPath(path))
      }
      return statuses
    },
    async applyBatch(request) {
      throwIfAborted(request.signal)
      const completed = []
      for (const operation of request.operations) {
        throwIfAborted(request.signal)
        await applyFileSystemOperation(operation)
        completed.push(operation)
      }
      return { completed }
    },
  }
}
