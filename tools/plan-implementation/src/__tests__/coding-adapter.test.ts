import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeLaunch,
  ChildProcessOutcome,
  OwnedChildProcessTree,
} from "@repo-edu/host-node/child-process-lifetime"
import { resolveCodexAppServerCommand } from "../codex-app-server-command.js"
import type { CodexAppServerTurnStartParams } from "../codex-app-server-turn.js"
import {
  type CodexAppServerProcess,
  createCodingAdapter,
} from "../coding-adapter.js"
import { codingResultJsonSchema } from "../coding-result.js"
import type { CodingEvent, CodingResult } from "../contracts.js"
import type {
  HumanReviewPort,
  HumanReviewRequest,
  HumanReviewResponse,
} from "../human-review.js"
import {
  type CodexAppServerTestPeer,
  createCodexAppServerTestPeer,
} from "./codex-app-server-test-peer.js"
import { testCodingRequest } from "./coding-test-plan.js"

type AppServerFailure = {
  readonly kind: "invalid-result" | "server-error" | "turn-interrupted"
  readonly message: string
}

type ReportedFact =
  | { readonly kind: "cancelled"; readonly interruptWasWritten: boolean }
  | { readonly kind: "failure"; readonly error: unknown }
  | { readonly kind: "proof-lost"; readonly error: unknown }
  | {
      readonly kind: "result"
      readonly result:
        | { readonly outcome: "completed"; readonly value: CodingResult }
        | {
            readonly outcome: "failed"
            readonly message: string
            readonly value: AppServerFailure
          }
    }

class RecordingHumanReviewPort implements HumanReviewPort {
  readonly requests: HumanReviewRequest[] = []

  constructor(private readonly responses: HumanReviewResponse[] = []) {}

  review(request: HumanReviewRequest): Promise<HumanReviewResponse> {
    this.requests.push(request)
    return Promise.resolve(this.responses.shift() ?? { decision: "cancelled" })
  }

  clear(): boolean {
    return false
  }

  dispose() {}
}

type ControllerHarness = {
  readonly controller: ChildProcessLifetimeController
  readonly facts: ReportedFact[]
  readonly launches: ChildProcessLifetimeLaunch[]
  readonly peers: CodexAppServerTestPeer[]
  readonly turnRequests: CodexAppServerTurnStartParams[]
  dispose(): void
}

function createControllerHarness(
  options: { readonly failThreadStart?: boolean } = {},
): ControllerHarness {
  const facts: ReportedFact[] = []
  const launches: ChildProcessLifetimeLaunch[] = []
  const peers: CodexAppServerTestPeer[] = []
  const turnRequests: CodexAppServerTurnStartParams[] = []
  const controller: ChildProcessLifetimeController = {
    async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
      launches.push(request)
      const index = peers.length + 1
      const peer = createCodexAppServerTestPeer({
        failThreadStart: options.failThreadStart,
        threadStartResult: {
          approvalPolicy: "on-request",
          approvalsReviewer: "auto_review",
          thread: { id: `thread-${index}` },
        },
      })
      peers.push(peer)
      peer.rpc.onRequest(
        "turn/start",
        (params: CodexAppServerTurnStartParams) => {
          turnRequests.push(params)
          return {
            turn: {
              error: null,
              id: `turn-${index}`,
              items: [],
              status: "inProgress",
            },
          }
        },
      )
      peer.rpc.onRequest("turn/interrupt", () => new Promise<never>(() => {}))

      const completion =
        Promise.withResolvers<
          ChildProcessOutcome<CodingResult, AppServerFailure>
        >()
      let settled = false
      const settle = (
        outcome: ChildProcessOutcome<CodingResult, AppServerFailure>,
      ): void => {
        if (settled) return
        settled = true
        completion.resolve(outcome)
      }
      const process: CodexAppServerProcess = {
        ...peer.streams,
        outcome: completion.promise,
        requestCancellation() {
          facts.push({
            kind: "cancelled",
            interruptWasWritten: peer.wireMethods.includes("turn/interrupt"),
          })
          settle({ outcome: "cancelled" })
        },
        reportFailure(error) {
          facts.push({ kind: "failure", error })
        },
        reportProofLost(error) {
          facts.push({ kind: "proof-lost", error })
          settle({ outcome: "unknown" })
        },
        reportResult(result) {
          facts.push({ kind: "result", result })
          settle(
            result.outcome === "completed"
              ? { ...result, targetResult: { exitCode: 0, signal: null } }
              : { ...result, targetResult: { exitCode: 1, signal: null } },
          )
        },
      }
      return process as unknown as OwnedChildProcessTree<TCompleted, TFailed>
    },
    async stopAndConfirm() {},
  }
  return {
    controller,
    facts,
    launches,
    peers,
    turnRequests,
    dispose() {
      for (const peer of peers) peer.dispose()
    },
  }
}

function codingOutput(result: CodingResult): string {
  return JSON.stringify({ result })
}

function completedTurn(
  result: CodingResult,
  index = 1,
): Record<string, unknown> {
  return {
    threadId: `thread-${index}`,
    turn: {
      error: null,
      id: `turn-${index}`,
      items: [
        {
          id: `message-${index}`,
          phase: "final_answer",
          text: codingOutput(result),
          type: "agentMessage",
        },
      ],
      status: "completed",
    },
  }
}

async function nextTurn(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

async function waitForTurn(peer: CodexAppServerTestPeer): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (peer.responseCount() >= 3) {
      await nextTurn()
      return
    }
    await nextTurn()
  }
  assert.fail("The test app-server did not start its turn.")
}

async function collectEvents(
  events: AsyncIterable<CodingEvent>,
): Promise<CodingEvent[]> {
  const collected: CodingEvent[] = []
  for await (const event of events) collected.push(event)
  return collected
}

describe("direct Codex app-server coding adapter", () => {
  it("composes protocol events, attended review, and one admitted result under the controller", async (context) => {
    const harness = createControllerHarness()
    context.after(() => harness.dispose())
    const humanReview = new RecordingHumanReviewPort([{ decision: "accepted" }])
    const request = testCodingRequest()
    const run = await createCodingAdapter(harness.controller, {
      humanReview,
    }).start(request)
    const events = collectEvents(run.events)
    const peer = harness.peers[0]
    assert(peer)
    await waitForTurn(peer)

    await peer.rpc.sendNotification("item/completed", {
      item: {
        id: "reasoning-1",
        summary: ["The app-server owns this coding turn."],
        type: "reasoning",
      },
      threadId: "thread-1",
      turnId: "turn-1",
    })
    assert.deepEqual(
      await peer.rpc.sendRequest("item/commandExecution/requestApproval", {
        command: "pnpm --filter @repo-edu/plan-implementation check",
        itemId: "command-1",
        startedAtMs: 1,
        threadId: "thread-1",
        turnId: "turn-1",
      }),
      { decision: "accept" },
    )
    const admitted: CodingResult = {
      status: "succeeded",
      commit: {
        subject:
          "A1 redesign(plan-implementation): adopt direct app-server coding",
        decisionBullets: [
          "The controller owns the app-server process outcome.",
        ],
      },
    }
    await peer.rpc.sendNotification("turn/completed", completedTurn(admitted))

    assert.deepEqual(await run.result, admitted)
    assert.deepEqual(harness.facts, [
      {
        kind: "result",
        result: { outcome: "completed", value: admitted },
      },
    ])
    assert.equal(humanReview.requests.length, 1)
    assert.deepEqual(
      (await events).map((event) => event.kind),
      ["thread-started", "narrative", "human-review", "human-review"],
    )
    assert.equal(harness.launches.length, 1)
    assert.deepEqual(harness.launches[0], {
      command: process.execPath,
      args: resolveCodexAppServerCommand().arguments,
      cwd: request.repoEduRoot,
      env: { ...process.env },
      proof: "reported",
    })
    assert.equal(harness.turnRequests[0]?.threadId, "thread-1")
    assert.match(harness.turnRequests[0]?.input[0]?.text ?? "", /plan step 2/)
    assert.deepEqual(
      harness.turnRequests[0]?.outputSchema,
      codingResultJsonSchema,
    )
  })

  it("starts a fresh app-server, thread, and turn for each coding request", async (context) => {
    const harness = createControllerHarness()
    context.after(() => harness.dispose())
    const adapter = createCodingAdapter(harness.controller, {
      humanReview: new RecordingHumanReviewPort(),
    })

    for (const index of [1, 2]) {
      const run = await adapter.start(testCodingRequest(index))
      const peer = harness.peers[index - 1]
      assert(peer)
      await waitForTurn(peer)
      const result: CodingResult = {
        status: "blocked",
        reason: `Step ${index} fixture complete.`,
      }
      await peer.rpc.sendNotification(
        "turn/completed",
        completedTurn(result, index),
      )
      assert.deepEqual(await run.result, result)
    }

    assert.equal(harness.launches.length, 2)
    assert.deepEqual(
      harness.turnRequests.map((request) => request.threadId),
      ["thread-1", "thread-2"],
    )
    assert.match(harness.turnRequests[0]?.input[0]?.text ?? "", /plan step 1/)
    assert.match(harness.turnRequests[1]?.input[0]?.text ?? "", /plan step 2/)
  })

  it("writes the protocol interrupt before controller cancellation without passing launch abort", async (context) => {
    const harness = createControllerHarness()
    context.after(() => harness.dispose())
    const stop = new AbortController()
    const run = await createCodingAdapter(harness.controller, {
      humanReview: new RecordingHumanReviewPort(),
    }).start(testCodingRequest(), stop.signal)
    const peer = harness.peers[0]
    assert(peer)
    await waitForTurn(peer)

    stop.abort()

    await assert.rejects(
      run.result,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
    assert.deepEqual(harness.facts, [
      { kind: "cancelled", interruptWasWritten: true },
    ])
    assert.equal(harness.launches[0]?.signal, undefined)
  })

  it("reports startup rejection as a known controller fact", async (context) => {
    const harness = createControllerHarness({ failThreadStart: true })
    context.after(() => harness.dispose())
    const run = await createCodingAdapter(harness.controller, {
      humanReview: new RecordingHumanReviewPort(),
    }).start(testCodingRequest())

    await assert.rejects(run.result, /Codex app-server startup failed/)
    const fact = harness.facts[0]
    assert.equal(fact?.kind, "result")
    if (fact?.kind === "result") {
      assert.equal(fact.result.outcome, "failed")
      if (fact.result.outcome === "failed") {
        assert.equal(fact.result.value.kind, "server-error")
      }
    }
  })

  it("leaves proof-loss outcome selection to the controller", async (context) => {
    const harness = createControllerHarness()
    context.after(() => harness.dispose())
    const run = await createCodingAdapter(harness.controller, {
      humanReview: new RecordingHumanReviewPort(),
    }).start(testCodingRequest())
    const peer = harness.peers[0]
    assert(peer)
    await waitForTurn(peer)

    peer.closeOutput()

    await assert.rejects(run.result, /controller could not prove/)
    assert.equal(harness.facts[0]?.kind, "proof-lost")
  })
})
