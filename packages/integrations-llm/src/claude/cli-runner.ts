import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import {
  LlmError,
  type LlmModelSpec,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import { addCleanupCause } from "../error-cause"
import {
  claudeAbortError,
  isAbortLikeError,
  throwIfClaudeAborted,
} from "./abort"
import type { ResolvedClaudeSubscriptionAuth } from "./auth"
import type { ClaudeCliLaunch } from "./cli-process"
import { claudeNativeEffort } from "./effort"
import { toClaudeLlmError } from "./errors"
import {
  createClaudeStreamJsonState,
  eventsFromClaudeStreamMessage,
  finalizeClaudeStreamJsonState,
  parseClaudeStreamJsonLine,
} from "./stream-json"
import type { TraceSink } from "./trace"

export type ClaudeCliRunOptions = {
  spec: LlmModelSpec
  prompt: string
  signal?: AbortSignal
  trace?: TraceSink
  launch?: ClaudeCliLaunch
  executable?: string
}

export function buildClaudeCliArgs(spec: LlmModelSpec): string[] {
  const nativeEffort = claudeNativeEffort(spec.effort, "subscription")
  const args = [
    "-p",
    "--no-session-persistence",
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

export function buildClaudeCliLaunchOptions(
  executable: string,
  childEnv: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  cwd?: string,
): {
  readonly cwd?: string
  readonly env: NodeJS.ProcessEnv
  readonly shell: boolean | string
} {
  return {
    ...(cwd === undefined ? {} : { cwd }),
    env: childEnv,
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
  if (options.launch === undefined) {
    throw new Error("Claude subscription mode requires a host CLI launcher.")
  }

  let abortRequested = false
  let completed = false
  let childStreamsDestroyed = false
  let reportedFailure: Error | null = null
  let cleanupFailure: { readonly error: unknown } | null = null
  // A failed error-output read is reported exactly once. Taking it clears it,
  // so the error that carried it out is never also attached to itself.
  const errorOutputState: { failure: { readonly error: unknown } | null } = {
    failure: null,
  }
  const takeErrorOutputFailure = (): { readonly error: unknown } | null => {
    const failure = errorOutputState.failure
    errorOutputState.failure = null
    return failure
  }
  const workingDirectory = createClaudeCliWorkingDirectory()
  const launchOptions = buildClaudeCliLaunchOptions(
    executable,
    resolved.childEnv,
    process.platform,
    workingDirectory,
  )
  let child: Awaited<ReturnType<ClaudeCliLaunch>>
  try {
    child = await options.launch({
      command: executable,
      args: buildClaudeCliArgs(options.spec),
      cwd: launchOptions.cwd ?? workingDirectory,
      env: launchOptions.env,
      shell: launchOptions.shell,
      signal: options.signal,
    })
  } catch (error) {
    cleanupClaudeCliWorkingDirectory(workingDirectory)
    if (options.signal?.aborted || isAbortLikeError(error)) {
      throw claudeAbortError(error)
    }
    throw toClaudeLlmError(error, "subscription")
  }
  void child.result.catch(() => {
    // The promise is still awaited on the normal path. This prevents an
    // unhandled rejection if the consumer stops the async iterator early.
  })
  let stderr = ""
  const destroyChildStreams = () => {
    if (childStreamsDestroyed) return
    childStreamsDestroyed = true
    destroyStream(child.stdin)
    destroyStream(child.stdout)
    destroyStream(child.stderr)
  }
  const terminateChild = () => {
    void child.stopAndConfirm().catch(() => {
      // The final awaited call keeps the cleanup failure observable.
    })
    destroyChildStreams()
  }
  const abort = () => {
    abortRequested = true
    terminateChild()
  }
  options.signal?.addEventListener("abort", abort, { once: true })

  child.stderr.setEncoding("utf8")
  // The reader is started and awaited outside the turn's own try block, so its
  // failure can never escape as an unhandled rejection when another error ends
  // the turn first. A close this run asked for is expected; any other failure
  // is a real read failure and is kept for reporting.
  const errorOutputSettled = collectStderr(child.stderr, (chunk) => {
    stderr += chunk
  }).catch((error: unknown) => {
    if (!abortRequested && !childStreamsDestroyed) {
      errorOutputState.failure = { error }
    }
  })

  try {
    let promptWriteError: unknown = null
    const promptWritten = writePromptToChild(child.stdin, options.prompt).catch(
      (error: unknown) => {
        if (abortRequested) return
        promptWriteError = error
        void child.stopAndConfirm().catch(() => {
          // The final awaited call keeps the cleanup failure observable.
        })
      },
    )

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

    const exitStatus = await child.result
    await errorOutputSettled
    await promptWritten
    const errorOutputFailure = takeErrorOutputFailure()
    if (exitStatus.exitCode !== 0) {
      // The classified exit error carries the guidance, such as the login
      // message, so it stays the error the application receives. A failed
      // error-output read rides along as its cause.
      const exitError = cliExitError(
        exitStatus.exitCode,
        exitStatus.signal,
        stderr,
      )
      if (errorOutputFailure !== null) {
        addCleanupCause(exitError, errorOutputFailure.error)
      }
      throw exitError
    }
    if (errorOutputFailure !== null) {
      throw errorOutputFailure.error
    }
    if (promptWriteError !== null) {
      throw promptWriteError
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
    // The failure is classified here but thrown after cleanup, so a cleanup
    // failure can be added to it instead of taking its place.
    terminateChild()
    reportedFailure =
      abortRequested || options.signal?.aborted || isAbortLikeError(cause)
        ? claudeAbortError(cause)
        : toClaudeLlmError(cause, "subscription")
  } finally {
    options.signal?.removeEventListener("abort", abort)
    if (!completed) {
      terminateChild()
    } else {
      destroyChildStreams()
    }
    await errorOutputSettled
    try {
      await child.stopAndConfirm()
    } catch (error) {
      cleanupFailure = { error }
    } finally {
      cleanupClaudeCliWorkingDirectory(workingDirectory)
    }
  }

  const remainingErrorOutputFailure = takeErrorOutputFailure()
  if (reportedFailure !== null) {
    // The classified failure stays the error the application receives, so its
    // guidance survives. A cleanup or error-output failure rides along as the
    // cause.
    if (cleanupFailure !== null) {
      addCleanupCause(reportedFailure, cleanupFailure.error)
    }
    if (remainingErrorOutputFailure !== null) {
      addCleanupCause(reportedFailure, remainingErrorOutputFailure.error)
    }
    throw reportedFailure
  }
  if (cleanupFailure !== null) {
    // A result may not be reported while the owned tree cannot be confirmed
    // gone.
    throw cleanupFailure.error
  }
  if (remainingErrorOutputFailure !== null) {
    // Nothing else failed, so the failed error-output read is the only account
    // of what went wrong and may not be dropped.
    throw remainingErrorOutputFailure.error
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

function createClaudeCliWorkingDirectory(): string {
  return mkdtempSync(join(tmpdir(), "repo-edu-claude-"))
}

function cleanupClaudeCliWorkingDirectory(path: string): void {
  try {
    rmSync(path, { force: true, recursive: true })
  } catch {
    // Best-effort cleanup: Windows can refuse to delete a just-terminated
    // process cwd until handles are fully released.
  }
}

function destroyStream(
  stream: NodeJS.ReadableStream | NodeJS.WritableStream,
): void {
  ;(stream as { destroy?: () => void }).destroy?.()
}

function removeWritableListener(
  stream: NodeJS.WritableStream,
  event: "error" | "finish",
  listener: (...args: unknown[]) => void,
): void {
  const writable = stream as unknown as {
    off?: (event: string, listener: (...args: unknown[]) => void) => void
    removeListener?: (
      event: string,
      listener: (...args: unknown[]) => void,
    ) => void
  }
  if (writable.off) {
    writable.off(event, listener)
    return
  }
  writable.removeListener?.(event, listener)
}

function writePromptToChild(
  stream: NodeJS.WritableStream,
  prompt: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (finish: () => void): void => {
      if (settled) return
      settled = true
      removeWritableListener(stream, "error", onError)
      removeWritableListener(stream, "finish", onFinish)
      finish()
    }
    const onError = (error: unknown): void => settle(() => reject(error))
    const onFinish = (): void => settle(resolve)
    stream.once("error", onError)
    stream.once("finish", onFinish)
    try {
      stream.end(prompt)
    } catch (error) {
      settle(() => reject(error))
    }
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
  if (message.length === 0 && code === 1 && signal === null) {
    return new LlmError(
      "auth",
      "Claude CLI exited with code 1 before reporting an error. For subscription mode, this usually means the Claude CLI is not logged in. Run `claude auth login` in a terminal, then verify the connection again.",
      { context: { provider: "claude", authMode: "subscription" } },
    )
  }
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
