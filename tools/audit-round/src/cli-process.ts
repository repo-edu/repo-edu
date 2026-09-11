import { execa } from "execa"
import type { Assistant, InteractiveSession } from "./phase.js"
import { interactiveArguments } from "./requests.js"

export type CliRuntime = {
  readonly cwd: string
  readonly executables?: Partial<
    Record<
      Assistant,
      { readonly file: string; readonly args: readonly string[] }
    >
  >
  readonly env?: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
}

function command(
  runtime: CliRuntime,
  assistant: Assistant,
  args: readonly string[],
) {
  const executable = runtime.executables?.[assistant]
  return {
    file: executable?.file ?? assistant,
    args: [...(executable?.args ?? []), ...args],
  }
}

function launch(
  runtime: CliRuntime,
  assistant: Assistant,
  args: readonly string[],
  input?: string,
) {
  const invocation = command(runtime, assistant, args)
  return execa(invocation.file, invocation.args, {
    cwd: runtime.cwd,
    env: runtime.env,
    input,
    buffer: false,
    reject: false,
    cancelSignal: runtime.signal,
    forceKillAfterDelay: 5000,
  })
}

export type CliProcess = ReturnType<typeof launch>

export async function readCliLines(
  child: CliProcess,
  from: "stdout" | "stderr",
  consume: (line: string) => Promise<void>,
): Promise<void> {
  for await (const line of child.iterable({ from })) {
    try {
      await consume(line)
    } catch (error) {
      // Execa's iterator return waits for the child. Stop it before unwinding.
      child.kill()
      throw error
    }
  }
}

/** Owns a child through stream consumption, cancellation and final settlement. */
export async function withCliProcess<T>(
  runtime: CliRuntime,
  assistant: Assistant,
  args: readonly string[],
  input: string | undefined,
  consume: (child: CliProcess) => Promise<T>,
  diagnostic: (text: string) => Promise<void>,
): Promise<T> {
  const interruption = new AbortController()
  const signal =
    runtime.signal === undefined
      ? interruption.signal
      : AbortSignal.any([interruption.signal, runtime.signal])
  const child = launch({ ...runtime, signal }, assistant, args, input)
  // The foreground CLI receives Ctrl-C too; cancellation prevents further work
  // even when that CLI handles the signal and exits with a successful code.
  const interrupt = () => interruption.abort()
  process.on("SIGINT", interrupt)
  const work = consume(child)
  const stderr = readCliLines(child, "stderr", diagnostic)
  try {
    const [value, , result] = await Promise.all([work, stderr, child])
    if (result.failed) throw result
    return value
  } finally {
    // A consumer failure must not leave the CLI running or readers unobserved.
    child.kill()
    await Promise.allSettled([work, stderr, child])
    process.off("SIGINT", interrupt)
  }
}

export async function openAssistantSession(
  session: InteractiveSession,
  runtime: CliRuntime,
): Promise<void> {
  const invocation = command(
    runtime,
    session.assistant,
    interactiveArguments(session),
  )
  await execa(invocation.file, invocation.args, {
    cwd: session.cwd,
    env: runtime.env,
    stdio: "inherit",
    cancelSignal: runtime.signal,
    forceKillAfterDelay: 5000,
  })
}
