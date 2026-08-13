import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type CommandLineLifetimeProcess,
  runWithCommandLineLifetime,
} from "../command-line-lifetime.js"

type SignalName = "SIGINT" | "SIGTERM"

type RuntimeProcessProbe = {
  runtimeProcess: CommandLineLifetimeProcess
  emittedExitCodes: number[]
  emit(signal: SignalName): void
  hasListener(signal: SignalName): boolean
  stderrWrites: string[]
}

function createRuntimeProcessProbe(events: string[]): RuntimeProcessProbe {
  const listeners = new Map<SignalName, () => void>()
  const emittedExitCodes: number[] = []
  const stderrWrites: string[] = []

  const runtimeProcess = {
    exitCode: undefined,
    stderr: {
      write(chunk: string | Uint8Array) {
        stderrWrites.push(
          typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
        )
        return true
      },
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      if (event === "SIGINT" || event === "SIGTERM") {
        listeners.set(event, listener as () => void)
      }
      return process
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      if (
        (event === "SIGINT" || event === "SIGTERM") &&
        listeners.get(event) === listener
      ) {
        listeners.delete(event)
      }
      return process
    },
    exit(code?: number) {
      const exitCode = code ?? 0
      emittedExitCodes.push(exitCode)
      events.push(`exit:${exitCode}`)
      return undefined as never
    },
  } as unknown as CommandLineLifetimeProcess

  return {
    runtimeProcess,
    emittedExitCodes,
    emit(signal) {
      listeners.get(signal)?.()
    },
    hasListener(signal) {
      return listeners.has(signal)
    },
    stderrWrites,
  }
}

async function flushTasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

describe("command-line lifetime", () => {
  it("stops owned process trees before releasing the program gate", async () => {
    const events: string[] = []
    const stop = Promise.withResolvers<void>()
    const probe = createRuntimeProcessProbe(events)

    const runPromise = runWithCommandLineLifetime(
      {
        childProcessLifetime: {
          async stopAndConfirm() {
            events.push("stop")
            await stop.promise
          },
        },
        releaseProgramGate() {
          events.push("release")
        },
        runtimeProcess: probe.runtimeProcess,
      },
      async () => {
        events.push("run")
      },
    )

    await flushTasks()
    assert.deepStrictEqual(events, ["run", "stop"])

    stop.resolve()
    await runPromise

    assert.deepStrictEqual(events, ["run", "stop", "release"])
    assert.equal(probe.hasListener("SIGINT"), false)
    assert.equal(probe.hasListener("SIGTERM"), false)
  })

  it("stops and releases before propagating command failure", async () => {
    const events: string[] = []
    const probe = createRuntimeProcessProbe(events)

    await assert.rejects(
      runWithCommandLineLifetime(
        {
          childProcessLifetime: {
            async stopAndConfirm() {
              events.push("stop")
            },
          },
          releaseProgramGate() {
            events.push("release")
          },
          runtimeProcess: probe.runtimeProcess,
        },
        async () => {
          events.push("run")
          throw new Error("command failed")
        },
      ),
      /command failed/,
    )

    assert.deepStrictEqual(events, ["run", "stop", "release"])
  })

  it("aborts on the first interrupt and stops before repeated-interrupt exit", async () => {
    const events: string[] = []
    const body = Promise.withResolvers<void>()
    const probe = createRuntimeProcessProbe(events)
    let hostSignal: AbortSignal | undefined

    const runPromise = runWithCommandLineLifetime(
      {
        childProcessLifetime: {
          async stopAndConfirm() {
            events.push("stop")
          },
        },
        releaseProgramGate() {
          events.push("release")
        },
        runtimeProcess: probe.runtimeProcess,
      },
      async (signal) => {
        hostSignal = signal
        await body.promise
      },
    )

    probe.emit("SIGINT")
    assert.equal(hostSignal?.aborted, true)
    assert.deepStrictEqual(events, [])
    assert.deepStrictEqual(probe.stderrWrites, ["\nAborting...\n"])

    probe.emit("SIGINT")
    await flushTasks()
    assert.deepStrictEqual(events, ["stop", "release", "exit:130"])
    assert.deepStrictEqual(probe.emittedExitCodes, [130])

    body.resolve()
    await runPromise
    assert.deepStrictEqual(events, ["stop", "release", "exit:130"])
  })

  it("stops and releases before termination exit", async () => {
    const events: string[] = []
    const body = Promise.withResolvers<void>()
    const probe = createRuntimeProcessProbe(events)
    let hostSignal: AbortSignal | undefined

    const runPromise = runWithCommandLineLifetime(
      {
        childProcessLifetime: {
          async stopAndConfirm() {
            events.push("stop")
          },
        },
        releaseProgramGate() {
          events.push("release")
        },
        runtimeProcess: probe.runtimeProcess,
      },
      async (signal) => {
        hostSignal = signal
        await body.promise
      },
    )

    probe.emit("SIGTERM")
    await flushTasks()

    assert.equal(hostSignal?.aborted, true)
    assert.deepStrictEqual(events, ["stop", "release", "exit:143"])
    assert.deepStrictEqual(probe.emittedExitCodes, [143])

    body.resolve()
    await runPromise
  })

  it("does not release the program gate when stop confirmation fails", async () => {
    const events: string[] = []
    const probe = createRuntimeProcessProbe(events)

    await assert.rejects(
      runWithCommandLineLifetime(
        {
          childProcessLifetime: {
            async stopAndConfirm() {
              events.push("stop")
              throw new Error("tree was not confirmed stopped")
            },
          },
          releaseProgramGate() {
            events.push("release")
          },
          runtimeProcess: probe.runtimeProcess,
        },
        async () => {},
      ),
      /tree was not confirmed stopped/,
    )

    assert.deepStrictEqual(events, ["stop"])
    assert.deepStrictEqual(probe.emittedExitCodes, [])
    assert.equal(probe.hasListener("SIGINT"), false)
    assert.equal(probe.hasListener("SIGTERM"), false)
  })
})
