import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import {
  LlmError,
  type LlmStreamEvent,
} from "@repo-edu/integrations-llm-contract"
import {
  type CodexSdkHostLaunch,
  type CodexSdkHostOutcome,
  type CodexSdkHostTargetResult,
  createCodexLlmTextClient,
} from "../sdk-host-client"
import { type CodexSdkHostRun, runCodexSdkHostServer } from "../sdk-host-server"
import { codexSpec, request } from "./codex-runner-test-helpers"

const usage = {
  inputTokens: 3,
  cachedInputTokens: 1,
  outputTokens: 2,
  reasoningOutputTokens: 1,
  wallMs: 25,
  authMode: "subscription" as const,
}

type ReportedFact =
  | { readonly kind: "proof-lost"; readonly error: unknown }
  | { readonly kind: "result"; readonly result: CodexSdkHostTargetResult }

function createServerHarness(run: CodexSdkHostRun): {
  readonly launch: CodexSdkHostLaunch
  readonly facts: readonly ReportedFact[]
  readonly launchCount: () => number
  readonly stopCount: () => number
} {
  let launches = 0
  let stops = 0
  const facts: ReportedFact[] = []
  return {
    launch: async () => {
      launches += 1
      const hostToSdkHost = new PassThrough()
      const sdkHostToHost = new PassThrough()
      const stderr = new PassThrough()
      const server = runCodexSdkHostServer(hostToSdkHost, sdkHostToHost, {
        run,
      })
      const outcome = Promise.withResolvers<CodexSdkHostOutcome>()
      let settled = false
      const finish = (reported: object): void => {
        if (settled) return
        settled = true
        stops += 1
        if (!hostToSdkHost.writableEnded) hostToSdkHost.end()
        void server.then(() => {
          stderr.end()
          outcome.resolve(reported as never)
        })
      }
      return {
        stdin: hostToSdkHost,
        stdout: sdkHostToHost,
        stderr,
        outcome: outcome.promise,
        requestCancellation() {
          finish({ outcome: "cancelled" })
        },
        reportFailure() {},
        reportProofLost(error) {
          facts.push({ error, kind: "proof-lost" })
          finish({ outcome: "unknown" })
        },
        reportResult(result) {
          facts.push({ kind: "result", result })
          finish({
            ...result,
            targetResult: { exitCode: 0, signal: null },
          })
        },
      }
    },
    facts,
    launchCount: () => launches,
    stopCount: () => stops,
  }
}

function createLostSdkHostLaunch(
  errorOutput = "",
  facts: ReportedFact[] = [],
): CodexSdkHostLaunch {
  return async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const outcome = Promise.withResolvers<
      { readonly outcome: "unknown" } | { readonly outcome: "cancelled" }
    >()
    setImmediate(() => {
      if (errorOutput.length > 0) stderr.write(errorOutput)
      stderr.end()
      stdout.end()
      outcome.resolve({ outcome: "unknown" })
    })
    return {
      stdin,
      stdout,
      stderr,
      outcome: outcome.promise,
      requestCancellation() {
        outcome.resolve({ outcome: "cancelled" })
      },
      reportFailure() {},
      reportProofLost(error) {
        facts.push({ error, kind: "proof-lost" })
        outcome.resolve({ outcome: "unknown" })
      },
      reportResult() {},
    }
  }
}

describe("Codex SDK host process", () => {
  it("runs one request and preserves streamed events, traces, and known success", async () => {
    const requests: string[] = []
    const traces: string[] = []
    const harness = createServerHarness(async function* ({
      request: sdkHostRequest,
      trace,
    }) {
      requests.push(sdkHostRequest.prompt)
      assert.deepEqual(sdkHostRequest.spec, codexSpec)
      trace("trace-one")
      yield { kind: "activity", label: "Contacting Codex." }
      yield { kind: "text-delta", text: "pong" }
      yield { kind: "done", usage }
    })
    const client = createCodexLlmTextClient(undefined, {
      launch: harness.launch,
      trace: (text) => traces.push(text),
    })

    const events: LlmStreamEvent[] = []
    for await (const event of client.streamText(request(codexSpec))) {
      events.push(event)
    }

    assert.deepEqual(requests, ["ping"])
    assert.equal(harness.launchCount(), 1)
    assert.equal(harness.stopCount(), 1)
    assert.deepEqual(harness.facts, [
      {
        kind: "result",
        result: { outcome: "completed", value: { status: "completed" } },
      },
    ])
    assert.deepEqual(traces, ["trace-one"])
    assert.deepEqual(events, [
      { kind: "activity", label: "Contacting Codex." },
      { kind: "text-delta", text: "pong" },
      { kind: "done", usage },
    ])
  })

  it("reconstructs a known Codex SDK host process failure", async () => {
    const harness = createServerHarness(async function* () {
      yield await Promise.reject(
        new LlmError("rate_limit", "429 retry-after 5s", {
          context: {
            provider: "codex",
            authMode: "subscription",
            retryAfterMs: 5_000,
          },
        }),
      )
    })
    const client = createCodexLlmTextClient(undefined, {
      launch: harness.launch,
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "rate_limit" &&
        error.context.retryAfterMs === 5_000,
    )
    assert.equal(harness.stopCount(), 1)
    assert.deepEqual(harness.facts, [
      {
        kind: "result",
        result: {
          message: "429 retry-after 5s",
          outcome: "failed",
          value: {
            context: {
              authMode: "subscription",
              provider: "codex",
              retryAfterMs: 5_000,
            },
            kind: "rate_limit",
            message: "429 retry-after 5s",
            type: "llm-error",
          },
        },
      },
    ])
  })

  it("cancels the Codex SDK host process request and confirms its tree", async () => {
    const started = Promise.withResolvers<void>()
    let sdkHostObservedCancellation = false
    const harness = createServerHarness(async function* ({ signal }) {
      started.resolve()
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            sdkHostObservedCancellation = true
            resolve()
          },
          { once: true },
        )
      })
      throw new DOMException("Operation cancelled.", "AbortError")
    })
    const controller = new AbortController()
    const client = createCodexLlmTextClient(undefined, {
      launch: harness.launch,
    })
    const result = client.generateText({
      ...request(codexSpec),
      signal: controller.signal,
    })

    await started.promise
    controller.abort()

    await assert.rejects(
      () => result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(sdkHostObservedCancellation, true)
    assert.equal(harness.stopCount(), 1)
  })

  it("settles cancellation once when the Codex SDK host process does not answer", async () => {
    let stops = 0
    const controller = new AbortController()
    const client = createCodexLlmTextClient(undefined, {
      launch: async () => {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        const outcome = Promise.withResolvers<{
          readonly outcome: "cancelled"
        }>()
        let cancellationRequested = false
        return {
          stdin,
          stdout,
          stderr,
          outcome: outcome.promise,
          requestCancellation() {
            if (cancellationRequested) return
            cancellationRequested = true
            stops += 1
            stdout.end()
            stderr.end()
            outcome.resolve({ outcome: "cancelled" })
          },
          reportFailure() {},
          reportProofLost() {},
          reportResult() {},
        }
      },
    })
    const result = client.generateText({
      ...request(codexSpec),
      signal: controller.signal,
    })

    await new Promise<void>((resolve) => setImmediate(resolve))
    controller.abort()

    await assert.rejects(
      result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.equal(stops, 1)
  })

  it("cancels pending Codex SDK host process startup through its launch signal", async () => {
    const launchStarted = Promise.withResolvers<void>()
    let startupSignal: AbortSignal | undefined
    const controller = new AbortController()
    const client = createCodexLlmTextClient(undefined, {
      launch: async (signal) => {
        startupSignal = signal
        launchStarted.resolve()
        return await new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("Codex SDK host process startup stopped")),
            { once: true },
          )
        })
      },
    })
    const result = client.generateText({
      ...request(codexSpec),
      signal: controller.signal,
    })

    await launchStarted.promise
    controller.abort()

    await assert.rejects(
      () => result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.notEqual(startupSignal, controller.signal)
    assert.equal(startupSignal?.aborted, true)
  })

  it("reports Codex SDK host process loss as an unknown outside outcome", async () => {
    const facts: ReportedFact[] = []
    const client = createCodexLlmTextClient(undefined, {
      launch: createLostSdkHostLaunch("", facts),
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError &&
        error.kind === "other" &&
        error.context.provider === "codex" &&
        /outside outcome is unknown/.test(error.message),
    )
    assert.equal(facts[0]?.kind, "proof-lost")
  })

  it("keeps the lost Codex SDK host process output in the reported failure", async () => {
    const client = createCodexLlmTextClient(undefined, {
      launch: createLostSdkHostLaunch(
        "[codex-sdk-host] Error: cannot find module\n",
      ),
    })

    await assert.rejects(
      () => client.generateText(request(codexSpec)),
      (error: unknown) =>
        error instanceof LlmError && /cannot find module/.test(error.message),
    )
  })
})
