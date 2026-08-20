import assert from "node:assert/strict"
import { PassThrough, type Readable } from "node:stream"
import { describe, it } from "node:test"
import {
  type ChildProcessLifetimePlatformAdapter,
  type ChildProcessSecondaryFailureDiagnostic,
  ChildProcessTreeUnconfirmedError,
  childProcessForcedStopConfirmationPeriodMs,
  childProcessStopGracePeriodMs,
  createChildProcessLifetimeController,
} from "../child-process-lifetime.js"
import type { PlatformChildProcessTerminal } from "../child-process-lifetime-contract.js"

type AdapterHarness = {
  readonly adapter: ChildProcessLifetimePlatformAdapter
  readonly confirmation: PromiseWithResolvers<void>
  readonly result: PromiseWithResolvers<PlatformChildProcessTerminal>
  readonly stopPolicies: Array<{
    readonly forcedStopConfirmationPeriodMs: number
    readonly gracefulStopPeriodMs: number
  }>
}

function createAdapterHarness(): AdapterHarness {
  const confirmation = Promise.withResolvers<void>()
  const result = Promise.withResolvers<PlatformChildProcessTerminal>()
  const stopPolicies: AdapterHarness["stopPolicies"] = []
  return {
    confirmation,
    result,
    stopPolicies,
    adapter: {
      async launch(_request, _pendingStopSignal, stopPolicy) {
        stopPolicies.push(stopPolicy)
        return {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          result: result.promise,
          async stopAndConfirm() {
            await confirmation.promise
            return { outcome: "confirmed" }
          },
        }
      },
    },
  }
}

function createHarnessController(
  harness: AdapterHarness,
  diagnostics: ChildProcessSecondaryFailureDiagnostic[] = [],
  warnings: ChildProcessTreeUnconfirmedError[] = [],
) {
  return createChildProcessLifetimeController({
    diagnosticSink(diagnostic) {
      diagnostics.push(diagnostic)
    },
    warnUnconfirmedTree(error) {
      warnings.push(error)
    },
    runtimePlatform: "win32",
    windowsAdapter: harness.adapter,
  })
}

async function launchReported(
  harness: AdapterHarness,
  diagnostics: ChildProcessSecondaryFailureDiagnostic[] = [],
  warnings: ChildProcessTreeUnconfirmedError[] = [],
) {
  const controller = createHarnessController(harness, diagnostics, warnings)
  const tree = await controller.launch<string, string>({
    command: "outside-target",
    proof: "reported",
  })
  return { controller, tree }
}

describe("child-process completion outcomes", () => {
  it("returns completed only after the owned tree is confirmed gone", async () => {
    const harness = createAdapterHarness()
    const { tree } = await launchReported(harness)
    tree.reportResult({ outcome: "completed", value: "reply" })

    const early = await Promise.race([
      tree.outcome.then(() => "settled" as const),
      Promise.resolve("pending" as const),
    ])
    assert.equal(early, "pending")

    harness.result.resolve({ exitCode: 0, signal: null })
    harness.confirmation.resolve()
    assert.deepEqual(await tree.outcome, {
      outcome: "completed",
      targetResult: { exitCode: 0, signal: null },
      value: "reply",
    })
  })

  it("returns the target's failed result", async () => {
    const harness = createAdapterHarness()
    const { tree } = await launchReported(harness)
    tree.reportResult({
      outcome: "failed",
      message: "target said no",
      value: "target-record",
    })
    harness.result.resolve({ exitCode: 2, signal: null })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, {
      outcome: "failed",
      message: "target said no",
      targetResult: { exitCode: 2, signal: null },
      value: "target-record",
    })
  })

  it("returns cancelled when cancellation was requested", async () => {
    const harness = createAdapterHarness()
    const { tree } = await launchReported(harness)
    tree.requestCancellation()
    harness.result.resolve({ exitCode: null, signal: "SIGTERM" })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "cancelled" })
  })

  it("returns unknown when the proving connection was lost", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const { tree } = await launchReported(harness, diagnostics)
    tree.reportProofLost(new Error("connection lost"))
    harness.result.resolve({ exitCode: 1, signal: null })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    assert.equal(diagnostics.length, 1)
    assert.match(String(diagnostics[0]?.failure), /connection lost/)
  })

  it("returns unknown when the platform loses target-start proof", async () => {
    const failure = new Error("target start proof lost")
    const adapter: ChildProcessLifetimePlatformAdapter = {
      async launch() {
        return {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          result: Promise.resolve({
            outcome: "proof-lost",
            failure,
          }),
          async stopAndConfirm() {
            return { outcome: "confirmed" }
          },
        }
      },
    }
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const controller = createChildProcessLifetimeController({
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic)
      },
      warnUnconfirmedTree(error): never {
        throw error
      },
      runtimePlatform: "win32",
      windowsAdapter: adapter,
    })
    const tree = await controller.launch({
      command: "possibly-started-target",
      proof: "target-exit",
    })

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0]?.failure, failure)
  })

  it("returns unknown without warning when completion proof is lost after stop", async () => {
    const failure = new Error("stream completion proof lost")
    const adapter: ChildProcessLifetimePlatformAdapter = {
      async launch() {
        return {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          result: Promise.resolve({ exitCode: 0, signal: null }),
          async stopAndConfirm() {
            return { outcome: "proof-lost", failure }
          },
        }
      },
    }
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const warnings: ChildProcessTreeUnconfirmedError[] = []
    const controller = createChildProcessLifetimeController({
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic)
      },
      warnUnconfirmedTree(error) {
        warnings.push(error)
      },
      runtimePlatform: "win32",
      windowsAdapter: adapter,
    })
    const tree = await controller.launch({
      command: "completion-proof-target",
      proof: "target-exit",
    })

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    assert.deepEqual(warnings, [])
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0]?.failure, failure)
  })

  it("returns unknown when cancellation loses target-exit proof", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const controller = createHarnessController(harness, diagnostics)
    const tree = await controller.launch({
      command: "cancelled-target",
      proof: "target-exit",
    })
    const failure = new Error("target exit proof lost during cancellation")

    tree.requestCancellation()
    harness.result.resolve({ outcome: "proof-lost", failure })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0]?.failure, failure)
  })

  it("accepts a reported result while target-exit completion confirms the tree", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const { tree } = await launchReported(harness, diagnostics)
    harness.result.resolve({ exitCode: 0, signal: null })
    await new Promise((resolve) => setImmediate(resolve))

    const early = await Promise.race([
      tree.outcome.then(() => "settled" as const),
      Promise.resolve("pending" as const),
    ])
    assert.equal(early, "pending")

    tree.reportResult({ outcome: "completed", value: "reply" })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, {
      outcome: "completed",
      targetResult: { exitCode: 0, signal: null },
      value: "reply",
    })
    assert.deepEqual(diagnostics, [])
  })

  it("returns unknown when tree confirmation closes without a reported result", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const { tree } = await launchReported(harness, diagnostics)
    harness.result.resolve({ exitCode: 0, signal: null })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    assert.equal(diagnostics.length, 1)
    assert.match(
      String(diagnostics[0]?.failure),
      /ended before its reported result/,
    )
  })

  it("checks unknown before cancelled", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const { tree } = await launchReported(harness, diagnostics)
    tree.reportProofLost(new Error("proof lost"))
    tree.requestCancellation()
    tree.reportResult({
      outcome: "failed",
      message: "forced exit",
      value: "failure",
    })
    harness.result.resolve({ exitCode: 1, signal: null })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    assert.equal(diagnostics.length, 2)
    assert.match(String(diagnostics[0]?.failure), /proof lost/)
    assert.match(String(diagnostics[1]?.failure), /forced exit/)
  })

  it("checks cancelled before failed", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const { tree } = await launchReported(harness, diagnostics)
    tree.requestCancellation()
    tree.reportResult({
      outcome: "failed",
      message: "forced exit",
      value: "failure",
    })
    harness.result.resolve({ exitCode: 1, signal: null })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "cancelled" })
    assert.equal(diagnostics.length, 1)
    assert.match(String(diagnostics[0]?.failure), /forced exit/)
  })

  it("maps a direct target exit without exposing raw completion parts", async () => {
    const harness = createAdapterHarness()
    const controller = createHarnessController(harness)
    const tree = await controller.launch({
      command: "direct-target",
      proof: "target-exit",
    })
    harness.result.resolve({ exitCode: 7, signal: null })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, {
      outcome: "failed",
      message: "The target exited with 7.",
      targetResult: { exitCode: 7, signal: null },
      value: { exitCode: 7, signal: null },
    })
  })
})

describe("child-process completion policy", () => {
  it("passes both controller-owned stop periods to the platform adapter", async () => {
    const harness = createAdapterHarness()
    const controller = createHarnessController(harness)
    const tree = await controller.launch({
      command: "policy-target",
      proof: "target-exit",
    })
    assert.deepEqual(harness.stopPolicies, [
      {
        forcedStopConfirmationPeriodMs:
          childProcessForcedStopConfirmationPeriodMs,
        gracefulStopPeriodMs: childProcessStopGracePeriodMs,
      },
    ])
    harness.result.resolve({ exitCode: 0, signal: null })
    harness.confirmation.resolve()
    await tree.outcome
  })

  it("reports one unconfirmed-tree failure, returns unknown and keeps the session alive", async () => {
    const failure = new ChildProcessTreeUnconfirmedError("not gone")
    let launchCount = 0
    let unconfirmedStreams:
      | {
          readonly stdin: PassThrough
          readonly stdout: PassThrough
          readonly stderr: PassThrough
        }
      | undefined
    const adapter: ChildProcessLifetimePlatformAdapter = {
      async launch() {
        launchCount += 1
        const streams = {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
        }
        if (launchCount === 1) {
          unconfirmedStreams = streams
        }
        return {
          ...streams,
          result: Promise.resolve({ exitCode: 0, signal: null }),
          async stopAndConfirm() {
            if (launchCount === 1) {
              throw failure
            }
            return { outcome: "confirmed" }
          },
        }
      },
    }
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const warnings: ChildProcessTreeUnconfirmedError[] = []
    const controller = createChildProcessLifetimeController({
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic)
      },
      warnUnconfirmedTree(error) {
        warnings.push(error)
      },
      runtimePlatform: "win32",
      windowsAdapter: adapter,
    })
    const tree = await controller.launch({
      command: "unconfirmed-target",
      proof: "target-exit",
    })
    const echoStreamFailure = async (
      stream: Readable,
      report: (error: unknown) => void,
    ): Promise<void> => {
      try {
        for await (const _chunk of stream) {
          // Drain the caller-facing stream.
        }
      } catch (error) {
        report(error)
      }
    }
    const echoedStreamFailures = Promise.all([
      echoStreamFailure(tree.stdout, (error) => tree.reportProofLost(error)),
      echoStreamFailure(tree.stderr, (error) => tree.reportFailure(error)),
    ])

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    await echoedStreamFailures
    assert.equal(unconfirmedStreams?.stdin.destroyed, true)
    assert.equal(unconfirmedStreams?.stdout.destroyed, true)
    assert.equal(unconfirmedStreams?.stderr.destroyed, true)

    const laterTree = await controller.launch({
      command: "later-target",
      proof: "target-exit",
    })
    assert.equal((await laterTree.outcome).outcome, "completed")
    await controller.stopAndConfirm()

    assert.deepEqual(warnings, [failure])
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0]?.failure, failure)
  })

  it("warns once and rejects a pre-admission launch whose cleanup is unconfirmed", async () => {
    const failure = new ChildProcessTreeUnconfirmedError("launch not gone")
    let launchCount = 0
    const adapter: ChildProcessLifetimePlatformAdapter = {
      async launch() {
        launchCount += 1
        if (launchCount === 1) {
          throw failure
        }
        return {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          result: Promise.resolve({ exitCode: 0, signal: null }),
          async stopAndConfirm() {
            return { outcome: "confirmed" }
          },
        }
      },
    }
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const warnings: ChildProcessTreeUnconfirmedError[] = []
    const controller = createChildProcessLifetimeController({
      diagnosticSink(diagnostic) {
        diagnostics.push(diagnostic)
      },
      warnUnconfirmedTree(error) {
        warnings.push(error)
      },
      runtimePlatform: "win32",
      windowsAdapter: adapter,
    })

    await assert.rejects(
      controller.launch({
        command: "failed-launch",
        proof: "target-exit",
      }),
      failure,
    )
    const laterTree = await controller.launch({
      command: "later-launch",
      proof: "target-exit",
    })
    assert.equal((await laterTree.outcome).outcome, "completed")

    assert.deepEqual(warnings, [failure])
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0]?.failure, failure)
  })
})
