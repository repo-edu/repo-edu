import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
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
import type { ClaudeCliLaunch, ClaudeCliOutcome } from "./cli-process"
import { claudeNativeEffort } from "./effort"
import { toClaudeLlmError } from "./errors"
import {
  createClaudeStreamJsonState,
  eventsFromClaudeStreamMessage,
  finalizeClaudeStreamJsonState,
  parseClaudeStreamJsonLine,
  type ResultMessage,
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function terminalResultMessage(
  result: ResultMessage,
  errorOutput: string,
): string {
  const targetMessage =
    typeof result.result === "string" ? result.result.trim() : ""
  if (targetMessage.length > 0) {
    return targetMessage
  }
  if (errorOutput.length > 0) {
    return errorOutput
  }
  return `Claude turn ended with subtype "${result.subtype}".`
}

function missingTerminalResultMessage(
  errorOutput: string,
  promptWriteFailure: unknown,
): string {
  if (errorOutput.length > 0) {
    return errorOutput
  }
  if (promptWriteFailure !== undefined) {
    return errorMessage(promptWriteFailure)
  }
  return "Claude stream ended without a terminal usage event."
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
  let stderr = ""
  child.stderr.setEncoding("utf8")
  let errorOutputAvailable = true
  const errorOutputSettled = collectStderr(child.stderr, (chunk) => {
    stderr += chunk
  }).catch((error: unknown) => {
    errorOutputAvailable = false
    child.reportFailure(error)
  })

  let resultReported = false
  let terminalEvent: LlmStreamEvent | undefined
  let outcome: ClaudeCliOutcome | undefined
  const promptWriteFailure = await writePromptToChild(
    child.stdin,
    options.prompt,
  ).then(
    () => {
      child.reportWorkStarted()
      return undefined
    },
    (error: unknown) => {
      child.reportFailure(error)
      return error
    },
  )
  try {
    yield { kind: "activity", label: "Contacting Claude." }
    const state = createClaudeStreamJsonState({
      authMode: "subscription",
      trace: options.trace,
    })
    let buffer = ""
    child.stdout.setEncoding("utf8")
    for await (const chunk of child.stdout) {
      if (options.signal?.aborted) {
        throw claudeAbortError(options.signal.reason)
      }
      buffer += String(chunk)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const message = parseClaudeStreamJsonLine(line)
        if (message === null) continue
        for (const event of eventsFromClaudeStreamMessage(message, state)) {
          yield event
          if (options.signal?.aborted) {
            throw claudeAbortError(options.signal.reason)
          }
        }
      }
    }
    if (options.signal?.aborted) {
      throw claudeAbortError(options.signal.reason)
    }
    const finalMessage = parseClaudeStreamJsonLine(buffer)
    if (finalMessage !== null) {
      for (const event of eventsFromClaudeStreamMessage(finalMessage, state)) {
        yield event
        if (options.signal?.aborted) {
          throw claudeAbortError(options.signal.reason)
        }
      }
    }
    await errorOutputSettled
    const errorOutput = stderr.trim()
    if (state.terminalResult?.subtype !== "success") {
      child.reportResult({
        outcome: "failed",
        message:
          state.terminalResult === null
            ? missingTerminalResultMessage(errorOutput, promptWriteFailure)
            : terminalResultMessage(state.terminalResult, errorOutput),
        value: {
          errorOutputAvailable,
          errorOutputPresent: errorOutput.length > 0,
          terminalResultPresent: state.terminalResult !== null,
        },
      })
    } else if (!state.done) {
      child.reportResult({
        outcome: "failed",
        message: terminalResultMessage(state.terminalResult, errorOutput),
        value: {
          errorOutputAvailable,
          errorOutputPresent: errorOutput.length > 0,
          terminalResultPresent: true,
        },
      })
    } else {
      terminalEvent = finalizeClaudeStreamJsonState(state)
      child.reportResult({ outcome: "completed", value: undefined })
    }
    resultReported = true
  } catch (cause) {
    if (options.signal?.aborted || isAbortLikeError(cause)) {
      child.requestCancellation()
    } else if (cause instanceof LlmError && cause.kind === "guardrail") {
      child.reportResult({
        outcome: "failed",
        message: cause.message,
        value: {
          errorOutputAvailable,
          errorOutputPresent: stderr.trim().length > 0,
          kind: cause.kind,
          terminalResultPresent: false,
        },
      })
    } else if (promptWriteFailure !== undefined) {
      await errorOutputSettled
      const errorOutput = stderr.trim()
      child.reportResult({
        outcome: "failed",
        message: errorOutput || errorMessage(cause),
        value: {
          errorOutputAvailable,
          errorOutputPresent: errorOutput.length > 0,
          terminalResultPresent: false,
        },
      })
    } else {
      child.reportProofLost(cause)
    }
    resultReported = true
  } finally {
    if (!resultReported) {
      child.requestCancellation()
    }
    await errorOutputSettled
    outcome = await child.outcome
    cleanupClaudeCliWorkingDirectory(workingDirectory)
  }

  if (outcome.outcome === "unknown") {
    throw new LlmError(
      "other",
      "The Claude result connection was lost; the outside outcome is unknown.",
      { context: { provider: "claude", authMode: "subscription" } },
    )
  }
  if (outcome.outcome === "cancelled") {
    throw claudeAbortError()
  }
  if (outcome.outcome === "failed") {
    throw cliOutcomeError(outcome)
  }
  if (terminalEvent !== undefined) {
    yield terminalEvent
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

function cliOutcomeError(
  outcome: Extract<ClaudeCliOutcome, { readonly outcome: "failed" }>,
): LlmError {
  const exitCode = outcome.targetResult?.exitCode ?? null
  const signal = outcome.targetResult?.signal ?? null
  if (outcome.value.kind !== undefined) {
    return new LlmError(outcome.value.kind, outcome.message, {
      context: { provider: "claude", authMode: "subscription" },
    })
  }
  if (
    !outcome.value.terminalResultPresent &&
    !outcome.value.errorOutputPresent &&
    exitCode === 1 &&
    signal === null
  ) {
    return new LlmError(
      "auth",
      outcome.value.errorOutputAvailable
        ? "Claude CLI exited with code 1 before reporting an error. For subscription mode, this usually means the Claude CLI is not logged in. Run `claude auth login` in a terminal, then verify the connection again."
        : "Claude CLI exited with code 1 and its error output could not be read. For subscription mode, this usually means the Claude CLI is not logged in. Run `claude auth login` in a terminal, then verify the connection again.",
      { context: { provider: "claude", authMode: "subscription" } },
    )
  }
  const detail = outcome.value.errorOutputAvailable
    ? outcome.message
    : `Claude CLI exited with code ${exitCode ?? "null"}${signal ? ` and signal ${signal}` : ""}, and its error output could not be read.`
  return new LlmError("other", detail, {
    context: { provider: "claude", authMode: "subscription" },
  })
}
