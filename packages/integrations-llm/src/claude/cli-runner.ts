import {
  spawn as nodeSpawn,
  type SpawnOptionsWithoutStdio,
} from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import {
  LlmError,
  type LlmModelSpec,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import {
  claudeAbortError,
  isAbortLikeError,
  throwIfClaudeAborted,
} from "./abort"
import type { ResolvedClaudeSubscriptionAuth } from "./auth"
import { claudeNativeEffort } from "./effort"
import { toClaudeLlmError } from "./errors"
import {
  createClaudeStreamJsonState,
  eventsFromClaudeStreamMessage,
  finalizeClaudeStreamJsonState,
  parseClaudeStreamJsonLine,
} from "./stream-json"
import type { TraceSink } from "./trace"

type ClaudeCliChild = {
  stdin: NodeJS.WritableStream
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  kill(signal?: NodeJS.Signals): boolean
  once(
    event: "exit",
    listener: (code: number | null, signal: string | null) => void,
  ): unknown
  once(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): unknown
  once(event: "error", listener: (error: Error) => void): unknown
}

export type ClaudeCliSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ClaudeCliChild

export type ClaudeCliRunOptions = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
  trace?: TraceSink
  spawn?: ClaudeCliSpawn
  executable?: string
}

export function buildClaudeCliArgs(spec: LlmModelSpec): string[] {
  const nativeEffort = claudeNativeEffort(spec.effort, "subscription")
  const args = [
    "-p",
    "--verbose",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--model",
    spec.modelId,
    "--tools",
    "",
    "--strict-mcp-config",
  ]
  if (nativeEffort !== null) {
    args.push("--effort", nativeEffort)
  }
  return args
}

export function buildClaudeCliSpawnOptions(
  executable: string,
  childEnv: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): SpawnOptionsWithoutStdio {
  return {
    env: childEnv,
    stdio: "pipe",
    shell: platform === "win32" && executable.toLowerCase().endsWith(".cmd"),
  }
}

export async function* runClaudeCliStream(
  options: ClaudeCliRunOptions,
  resolved: ResolvedClaudeSubscriptionAuth,
): AsyncIterable<LlmStreamEvent> {
  if (options.spec.provider !== "claude") {
    throw new Error(
      `Claude adapter received non-claude spec.provider="${options.spec.provider}"`,
    )
  }
  throwIfClaudeAborted(options.signal)
  const executable = options.executable ?? findClaudeCliExecutable()
  if (executable === null) {
    throw new LlmError(
      "auth",
      "Claude subscription mode requires the Claude CLI to be installed and available on PATH.",
      { context: { provider: "claude", authMode: "subscription" } },
    )
  }

  let abortRequested = false
  let completed = false
  let childTerminated = false
  const child = (options.spawn ?? nodeSpawn)(
    executable,
    buildClaudeCliArgs(options.spec),
    buildClaudeCliSpawnOptions(executable, resolved.childEnv),
  )
  const close = waitForClose(child)
  void close.catch(() => {
    // The promise is still awaited on the normal path. This prevents an
    // unhandled rejection if the consumer stops the async iterator early.
  })
  let stderr = ""
  const terminateChild = () => {
    if (childTerminated) return
    childTerminated = true
    child.kill("SIGTERM")
    destroyStream(child.stdin)
    destroyStream(child.stdout)
    destroyStream(child.stderr)
  }
  const abort = () => {
    abortRequested = true
    terminateChild()
  }
  options.signal?.addEventListener("abort", abort, { once: true })

  try {
    child.stderr.setEncoding("utf8")
    const stderrDone = collectStderr(child.stderr, (chunk) => {
      stderr += chunk
    }).catch((error: unknown) => {
      if (!abortRequested) {
        throw error
      }
    })
    child.stdin.end(options.prompt)

    yield { kind: "activity", label: "Contacting Claude." }
    const state = createClaudeStreamJsonState({
      authMode: "subscription",
      trace: options.trace,
    })
    let buffer = ""
    child.stdout.setEncoding("utf8")
    for await (const chunk of child.stdout) {
      if (abortRequested || options.signal?.aborted) {
        throw claudeAbortError(options.signal?.reason)
      }
      buffer += String(chunk)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const message = parseClaudeStreamJsonLine(line)
        if (message === null) continue
        for (const event of eventsFromClaudeStreamMessage(message, state)) {
          yield event
          if (abortRequested || options.signal?.aborted) {
            throw claudeAbortError(options.signal?.reason)
          }
        }
      }
    }
    if (abortRequested || options.signal?.aborted) {
      throw claudeAbortError(options.signal?.reason)
    }
    const finalMessage = parseClaudeStreamJsonLine(buffer)
    if (finalMessage !== null) {
      for (const event of eventsFromClaudeStreamMessage(finalMessage, state)) {
        yield event
        if (abortRequested || options.signal?.aborted) {
          throw claudeAbortError(options.signal?.reason)
        }
      }
    }

    const exitStatus = await close
    await stderrDone
    if (exitStatus.code !== 0) {
      throw cliExitError(exitStatus.code, exitStatus.signal, stderr)
    }
    if (state.resultSubtype !== null && state.resultSubtype !== "success") {
      throw new LlmError(
        "other",
        `Claude turn ended with subtype "${state.resultSubtype}"`,
        { context: { provider: "claude", authMode: "subscription" } },
      )
    }
    if (!state.done) {
      throw new LlmError(
        "other",
        "Claude stream ended without a terminal usage event.",
        { context: { provider: "claude", authMode: "subscription" } },
      )
    }
    completed = true
    yield finalizeClaudeStreamJsonState(state)
  } catch (cause) {
    terminateChild()
    if (abortRequested || options.signal?.aborted || isAbortLikeError(cause)) {
      throw claudeAbortError(cause)
    }
    throw toClaudeLlmError(cause, "subscription")
  } finally {
    options.signal?.removeEventListener("abort", abort)
    if (!completed) {
      terminateChild()
    } else {
      destroyStream(child.stdin)
      destroyStream(child.stdout)
      destroyStream(child.stderr)
    }
  }
}

export function findClaudeCliExecutable(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const candidate of claudeExecutableCandidates(env)) {
    if (isExecutableFile(candidate)) return candidate
  }
  return null
}

function claudeExecutableCandidates(env: NodeJS.ProcessEnv): string[] {
  const names =
    process.platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"]
  const candidates: string[] = []
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir.length === 0) continue
    for (const name of names) candidates.push(join(dir, name))
  }

  const home = env.HOME ?? env.USERPROFILE ?? homedir()
  if (home) {
    for (const name of names) {
      candidates.push(join(home, ".local", "bin", name))
    }
    candidates.push(
      ...claudeVersionCandidates(
        join(home, ".local", "share", "claude", "versions"),
        names,
      ),
    )
  }

  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/claude", "/usr/local/bin/claude")
  }

  if (process.platform === "win32") {
    const localAppData = env.LOCALAPPDATA
    const userProfile = env.USERPROFILE
    if (localAppData) {
      for (const name of names)
        candidates.push(join(localAppData, "Claude", name))
    }
    if (userProfile) {
      for (const name of names)
        candidates.push(join(userProfile, "AppData", "Local", "Claude", name))
    }
  }

  return [...new Set(candidates)]
}

function claudeVersionCandidates(
  root: string,
  names: readonly string[],
): string[] {
  if (!existsSync(root)) return []
  try {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) return []
      return names.flatMap((name) => [
        join(root, entry.name, name),
        join(root, entry.name, "bin", name),
      ])
    })
  } catch {
    return []
  }
}

function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path)
    if (!stat.isFile()) return false
    if (process.platform === "win32") return true
    return (stat.mode & 0o111) !== 0
  } catch {
    return false
  }
}

function destroyStream(
  stream: NodeJS.ReadableStream | NodeJS.WritableStream,
): void {
  ;(stream as { destroy?: () => void }).destroy?.()
}

function waitForClose(child: ClaudeCliChild): Promise<{
  code: number | null
  signal: string | null
}> {
  return new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal }))
  })
}

async function collectStderr(
  stream: NodeJS.ReadableStream,
  onChunk: (chunk: string) => void,
): Promise<void> {
  for await (const chunk of stream) {
    onChunk(String(chunk))
  }
}

function cliExitError(
  code: number | null,
  signal: string | null,
  stderr: string,
): LlmError {
  const message = stderr.trim()
  const detail =
    message.length > 0
      ? message
      : `Claude CLI exited with code ${code ?? "null"}${signal ? ` and signal ${signal}` : ""}.`
  if (/login|log in|auth|authenticate|unauthorized/i.test(detail)) {
    return new LlmError("auth", detail, {
      context: { provider: "claude", authMode: "subscription" },
    })
  }
  return new LlmError("other", detail, {
    context: { provider: "claude", authMode: "subscription" },
  })
}
