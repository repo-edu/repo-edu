import type { Readable, Writable } from "node:stream"
import type {
  GitCommandPort,
  GitCommandRequest,
  ProcessPort,
  ProcessRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type { ChildProcessLifetimeController } from "./child-process-lifetime.js"

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Operation cancelled.", "AbortError")
  }
}

function completeEnvironment(
  overrides: Readonly<Record<string, string>> | undefined,
): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides }
}

async function collectOutput(stream: Readable): Promise<string> {
  stream.setEncoding("utf8")
  let output = ""
  for await (const chunk of stream) {
    output += String(chunk)
  }
  return output
}

function writeInput(
  stream: Writable,
  input: string | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once("error", reject)
    stream.once("finish", resolve)
    stream.end(input)
  })
}

export function createNodeProcessPort(
  childProcessLifetimeController: ChildProcessLifetimeController,
): ProcessPort {
  return {
    cancellation: "best-effort",

    async run(request: ProcessRequest): Promise<ProcessResult> {
      throwIfAborted(request.signal)

      const child = await childProcessLifetimeController.launch({
        command: request.command,
        args: request.args,
        cwd: request.cwd,
        env: completeEnvironment(request.env),
        proof: "target-exit",
        signal: request.signal,
      })
      let streamFailure: unknown
      const failStream = (error: unknown): void => {
        streamFailure ??= error
        child.reportFailure(error)
        child.requestCancellation()
      }
      const stdout = collectOutput(child.stdout).catch((error: unknown) => {
        failStream(error)
        return ""
      })
      const stderr = collectOutput(child.stderr).catch((error: unknown) => {
        failStream(error)
        return ""
      })
      const input = writeInput(child.stdin, request.stdinText).catch(failStream)

      const [outcome, capturedStdout, capturedStderr] = await Promise.all([
        child.outcome,
        stdout,
        stderr,
        input,
      ])
      if (outcome.outcome === "unknown") {
        throw new Error("The command result could not be confirmed.")
      }
      if (outcome.outcome === "cancelled") {
        // A cancellation this port requested after its own stream failure
        // reports that failure, not a cancel the caller never asked for.
        if (request.signal?.aborted !== true && streamFailure !== undefined) {
          throw streamFailure instanceof Error
            ? streamFailure
            : new Error(String(streamFailure))
        }
        throw new DOMException("Operation cancelled.", "AbortError")
      }
      return {
        ...outcome.value,
        stdout: capturedStdout,
        stderr: capturedStderr,
      }
    },
  }
}

export function createNodeGitCommandPort(
  processPort: ProcessPort,
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
