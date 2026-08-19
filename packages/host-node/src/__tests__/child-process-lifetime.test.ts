import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  type ChildProcessLifetimePlatformAdapter,
  type ChildProcessLifetimeResult,
  type ChildProcessSecondaryFailureDiagnostic,
  ChildProcessTreeUnconfirmedError,
  childProcessForcedStopConfirmationPeriodMs,
  childProcessStopGracePeriodMs,
  createChildProcessLifetimeController,
} from "../child-process-lifetime.js"

type AdapterHarness = {
  readonly adapter: ChildProcessLifetimePlatformAdapter
  readonly confirmation: PromiseWithResolvers<void>
  readonly result: PromiseWithResolvers<ChildProcessLifetimeResult>
  readonly stopPolicies: Array<{
    readonly forcedStopConfirmationPeriodMs: number
    readonly gracefulStopPeriodMs: number
  }>
}

function createAdapterHarness(): AdapterHarness {
  const confirmation = Promise.withResolvers<void>()
  const result = Promise.withResolvers<ChildProcessLifetimeResult>()
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
          stopAndConfirm: async () => await confirmation.promise,
        }
      },
    },
  }
}

function createHarnessController(
  harness: AdapterHarness,
  diagnostics: ChildProcessSecondaryFailureDiagnostic[] = [],
) {
  return createChildProcessLifetimeController({
    diagnosticSink(diagnostic) {
      diagnostics.push(diagnostic)
    },
    onUnconfirmedTree(error): never {
      throw error
    },
    runtimePlatform: "win32",
    windowsAdapter: harness.adapter,
  })
}

async function launchReported(
  harness: AdapterHarness,
  diagnostics: ChildProcessSecondaryFailureDiagnostic[] = [],
) {
  const controller = createHarnessController(harness, diagnostics)
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
    tree.reportWorkStarted()
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
    tree.reportWorkStarted()
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
    tree.reportWorkStarted()
    tree.requestCancellation()
    harness.result.resolve({ exitCode: null, signal: "SIGTERM" })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "cancelled" })
  })

  it("returns unknown when the proving connection was lost", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const { tree } = await launchReported(harness, diagnostics)
    tree.reportWorkStarted()
    tree.reportProofLost(new Error("connection lost"))
    harness.result.resolve({ exitCode: 1, signal: null })
    harness.confirmation.resolve()

    assert.deepEqual(await tree.outcome, { outcome: "unknown" })
    assert.equal(diagnostics.length, 1)
    assert.match(String(diagnostics[0]?.failure), /connection lost/)
  })

  it("checks unknown before cancelled", async () => {
    const harness = createAdapterHarness()
    const diagnostics: ChildProcessSecondaryFailureDiagnostic[] = []
    const { tree } = await launchReported(harness, diagnostics)
    tree.reportWorkStarted()
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
    tree.reportWorkStarted()
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

  it("routes an unconfirmed tree to the terminal host without returning an outcome", async () => {
    const failure = new ChildProcessTreeUnconfirmedError("not gone")
    const adapter: ChildProcessLifetimePlatformAdapter = {
      async launch() {
        return {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          result: Promise.resolve({ exitCode: 0, signal: null }),
          async stopAndConfirm() {
            throw failure
          },
        }
      },
    }
    const terminalFailures: unknown[] = []
    const controller = createChildProcessLifetimeController({
      diagnosticSink() {},
      onUnconfirmedTree(error): never {
        terminalFailures.push(error)
        throw error
      },
      runtimePlatform: "win32",
      windowsAdapter: adapter,
    })
    const tree = await controller.launch({
      command: "unconfirmed-target",
      proof: "target-exit",
    })

    await assert.rejects(tree.outcome, failure)
    assert.deepEqual(terminalFailures, [failure])
  })
})
