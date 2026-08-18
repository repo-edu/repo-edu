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
        signal: request.signal,
      })
      const stdout = collectOutput(child.stdout)
      const stderr = collectOutput(child.stderr)
      const input = writeInput(child.stdin, request.stdinText)

      try {
        const [result, capturedStdout, capturedStderr] = await Promise.all([
          child.result,
          stdout,
          stderr,
          input,
        ])
        return {
          ...result,
          stdout: capturedStdout,
          stderr: capturedStderr,
        }
      } catch (error) {
        try {
          await child.stopAndConfirm()
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "The process port failed and its owned tree could not be confirmed stopped.",
          )
        }
        throw error
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
