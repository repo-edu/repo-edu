import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ErrorCodes, ResponseError } from "vscode-jsonrpc/node"
import {
  type CodexAppServerConnection,
  startCodexAppServerConnection,
} from "../codex-app-server-connection.js"
import {
  buildCodexAppServerTurnStartParams,
  type CodexAppServerTurnFailure,
  type CodexAppServerTurnProcess,
  type CodexAppServerTurnStartParams,
  startCodexAppServerTurn,
} from "../codex-app-server-turn.js"
import { codingResultJsonSchema } from "../coding-result.js"
import type { CodingResult } from "../contracts.js"
import {
  type CodexAppServerTestPeer,
  createCodexAppServerTestPeer,
} from "./codex-app-server-test-peer.js"

type ReportedFact =
  | { readonly kind: "cancelled" }
  | { readonly kind: "failure"; readonly error: unknown }
  | { readonly kind: "proof-lost"; readonly error: unknown }
  | {
      readonly kind: "result"
      readonly result:
        | { readonly outcome: "completed"; readonly value: CodingResult }
        | {
            readonly outcome: "failed"
            readonly message: string
            readonly value: CodexAppServerTurnFailure
          }
    }

function createProcessRecorder(onCancellation: () => void = () => {}): {
  readonly process: CodexAppServerTurnProcess
  readonly facts: ReportedFact[]
} {
  const facts: ReportedFact[] = []
  const process: CodexAppServerTurnProcess = {
    reportFailure(error) {
      facts.push({ kind: "failure", error })
    },
    reportProofLost(error) {
      facts.push({ kind: "proof-lost", error })
    },
    reportResult(result) {
      facts.push({ kind: "result", result })
    },
    requestCancellation() {
      onCancellation()
      facts.push({ kind: "cancelled" })
    },
  }
  return { process, facts }
}

function inProgressTurn(id = "turn-1") {
  return {
    turn: {
      error: null,
      id,
      items: [],
      status: "inProgress",
    },
  }
}

function completedTurn(
  items: readonly unknown[],
  options: {
    readonly status?: "completed" | "failed" | "interrupted" | "inProgress"
    readonly error?: unknown
    readonly threadId?: string
    readonly turnId?: string
  } = {},
) {
  const status = options.status ?? "completed"
  return {
    threadId: options.threadId ?? "thread-1",
    turn: {
      error:
        options.error ??
        (status === "failed"
          ? {
              additionalDetails: null,
              codexErrorInfo: null,
              message: "model failed",
            }
          : null),
      id: options.turnId ?? "turn-1",
      items,
      status,
    },
  }
}

function codingOutput(result: CodingResult): string {
  return JSON.stringify({ result })
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

async function waitForTurnStartResponse(
  peer: CodexAppServerTestPeer,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (peer.responseCount() >= 3) {
      await nextTurn()
      return
    }
    await nextTurn()
  }
  assert.fail("The test app-server did not write a turn/start response.")
}

async function createConnectedPeer(): Promise<{
  readonly peer: CodexAppServerTestPeer
  readonly connection: CodexAppServerConnection
}> {
  const peer = createCodexAppServerTestPeer()
  const connection = await startCodexAppServerConnection(peer.streams, {
    repoEduRoot: "/repo-edu",
  })
  return { peer, connection }
}

function dispose(
  peer: CodexAppServerTestPeer,
  connection: CodexAppServerConnection,
): void {
  connection.dispose()
  peer.dispose()
}

describe("Codex app-server turn protocol", () => {
  it("writes the prompt and structured output schema and admits the latest final message", async () => {
    const { peer, connection } = await createConnectedPeer()
    let request: CodexAppServerTurnStartParams | undefined
    peer.rpc.onRequest(
      "turn/start",
      (params: CodexAppServerTurnStartParams) => {
        request = params
        return inProgressTurn()
      },
    )
    const recorder = createProcessRecorder()
    const run = startCodexAppServerTurn(connection, recorder.process, {
      prompt: "Implement the active step.",
    })
    await waitForTurnStartResponse(peer)

    assert.deepEqual(
      request,
      buildCodexAppServerTurnStartParams(
        "thread-1",
        "Implement the active step.",
      ),
    )
    assert.deepEqual(request?.outputSchema, codingResultJsonSchema)

    const admitted: CodingResult = {
      status: "blocked",
      reason: "A user decision is required.",
    }
    await peer.rpc.sendNotification(
      "turn/completed",
      completedTurn([
        {
          id: "message-1",
          phase: "commentary",
          text: codingOutput({
            status: "blocked",
            reason: "Interim text must not be admitted.",
          }),
          type: "agentMessage",
        },
        {
          id: "message-2",
          phase: "final_answer",
          text: codingOutput({
            status: "blocked",
            reason: "An older final answer must not win.",
          }),
          type: "agentMessage",
        },
        {
          id: "message-3",
          text: codingOutput(admitted),
          type: "agentMessage",
        },
      ]),
    )
    await run.completion

    assert.deepEqual(recorder.facts, [
      { kind: "result", result: { outcome: "completed", value: admitted } },
    ])
    dispose(peer, connection)
  })

  it("ignores completed notifications for a different turn", async () => {
    const { peer, connection } = await createConnectedPeer()
    peer.rpc.onRequest("turn/start", () => inProgressTurn())
    const recorder = createProcessRecorder()
    const run = startCodexAppServerTurn(connection, recorder.process, {
      prompt: "Implement the active step.",
    })
    await waitForTurnStartResponse(peer)

    await peer.rpc.sendNotification(
      "turn/completed",
      completedTurn([], { turnId: "turn-other" }),
    )
    await nextTurn()
    assert.deepEqual(recorder.facts, [])

    await peer.rpc.sendNotification(
      "turn/completed",
      completedTurn([
        {
          id: "message-1",
          phase: "final_answer",
          text: codingOutput({
            status: "blocked",
            reason: "Matched.",
          }),
          type: "agentMessage",
        },
      ]),
    )
    await run.completion
    assert.equal(recorder.facts.length, 1)
    dispose(peer, connection)
  })

  it("reports missing or invalid structured output as a known failure", async (context) => {
    for (const [name, items] of [
      ["missing", []],
      [
        "invalid",
        [
          {
            id: "message-1",
            phase: "final_answer",
            text: "not-json",
            type: "agentMessage",
          },
        ],
      ],
    ] as const) {
      await context.test(name, async () => {
        const { peer, connection } = await createConnectedPeer()
        peer.rpc.onRequest("turn/start", () => inProgressTurn())
        const recorder = createProcessRecorder()
        const run = startCodexAppServerTurn(connection, recorder.process, {
          prompt: "Implement the active step.",
        })
        await waitForTurnStartResponse(peer)
        await peer.rpc.sendNotification("turn/completed", completedTurn(items))
        await run.completion

        const fact = recorder.facts[0]
        assert.equal(fact?.kind, "result")
        if (fact?.kind === "result") {
          assert.equal(fact.result.outcome, "failed")
          if (fact.result.outcome === "failed") {
            assert.equal(fact.result.value.kind, "invalid-result")
          }
        }
        dispose(peer, connection)
      })
    }
  })

  it("reports rejected, failed, and interrupted turns as known failures", async (context) => {
    await context.test("rejected start", async () => {
      const { peer, connection } = await createConnectedPeer()
      peer.rpc.onRequest("turn/start", () => {
        throw new ResponseError(ErrorCodes.InvalidParams, "turn rejected")
      })
      const recorder = createProcessRecorder()
      const run = startCodexAppServerTurn(connection, recorder.process, {
        prompt: "Implement the active step.",
      })
      await run.completion

      const fact = recorder.facts[0]
      assert.equal(fact?.kind, "result")
      if (fact?.kind === "result" && fact.result.outcome === "failed") {
        assert.equal(fact.result.value.kind, "server-error")
        assert.match(fact.result.message, /turn rejected/)
      }
      dispose(peer, connection)
    })

    for (const status of ["failed", "interrupted"] as const) {
      await context.test(status, async () => {
        const { peer, connection } = await createConnectedPeer()
        peer.rpc.onRequest("turn/start", () => inProgressTurn())
        const recorder = createProcessRecorder()
        const run = startCodexAppServerTurn(connection, recorder.process, {
          prompt: "Implement the active step.",
        })
        await waitForTurnStartResponse(peer)
        await peer.rpc.sendNotification(
          "turn/completed",
          completedTurn([], { status }),
        )
        await run.completion

        const fact = recorder.facts[0]
        assert.equal(fact?.kind, "result")
        if (fact?.kind === "result" && fact.result.outcome === "failed") {
          assert.equal(
            fact.result.value.kind,
            status === "failed" ? "server-error" : "turn-interrupted",
          )
        }
        dispose(peer, connection)
      })
    }
  })

  it("reports connection failure before the turn write as a known failure", async () => {
    const { peer, connection } = await createConnectedPeer()
    connection.rpc.dispose()
    const recorder = createProcessRecorder()
    const run = startCodexAppServerTurn(connection, recorder.process, {
      prompt: "Implement the active step.",
    })
    await run.completion

    const fact = recorder.facts[0]
    assert.equal(fact?.kind, "result")
    if (fact?.kind === "result" && fact.result.outcome === "failed") {
      assert.equal(fact.result.value.kind, "server-error")
    }
    dispose(peer, connection)
  })

  it("reports malformed known turn messages as lost result proof", async (context) => {
    await context.test("turn start reply", async () => {
      const { peer, connection } = await createConnectedPeer()
      peer.rpc.onRequest("turn/start", () => inProgressTurn(""))
      const recorder = createProcessRecorder()
      const run = startCodexAppServerTurn(connection, recorder.process, {
        prompt: "Implement the active step.",
      })
      await run.completion

      assert.equal(recorder.facts[0]?.kind, "proof-lost")
      dispose(peer, connection)
    })

    await context.test("turn completion notification", async () => {
      const { peer, connection } = await createConnectedPeer()
      peer.rpc.onRequest("turn/start", () => inProgressTurn())
      const recorder = createProcessRecorder()
      const run = startCodexAppServerTurn(connection, recorder.process, {
        prompt: "Implement the active step.",
      })
      await waitForTurnStartResponse(peer)
      await peer.rpc.sendNotification(
        "turn/completed",
        completedTurn([
          {
            id: "message-1",
            phase: "final_answer",
            type: "agentMessage",
          },
        ]),
      )
      await run.completion

      assert.equal(recorder.facts[0]?.kind, "proof-lost")
      dispose(peer, connection)
    })
  })

  it("reports early exit and connection failure as lost result proof", async (context) => {
    for (const failure of ["close", "error"] as const) {
      await context.test(failure, async () => {
        const { peer, connection } = await createConnectedPeer()
        peer.rpc.onRequest("turn/start", () => inProgressTurn())
        const recorder = createProcessRecorder()
        const run = startCodexAppServerTurn(connection, recorder.process, {
          prompt: "Implement the active step.",
        })
        await waitForTurnStartResponse(peer)
        if (failure === "close") peer.closeOutput()
        else connection.rpc.dispose()
        await run.completion

        assert.equal(recorder.facts[0]?.kind, "proof-lost")
        dispose(peer, connection)
      })
    }
  })

  it("writes turn/interrupt before reporting cancellation and does not await its response", async () => {
    const { peer, connection } = await createConnectedPeer()
    const interrupt = Promise.withResolvers<never>()
    peer.rpc.onRequest("turn/start", () => inProgressTurn())
    peer.rpc.onRequest("turn/interrupt", () => interrupt.promise)
    let interruptWasWritten = false
    const recorder = createProcessRecorder(() => {
      interruptWasWritten = peer.wireMethods.includes("turn/interrupt")
    })
    const run = startCodexAppServerTurn(connection, recorder.process, {
      prompt: "Implement the active step.",
    })
    await waitForTurnStartResponse(peer)

    run.abort()
    await run.completion

    assert.equal(interruptWasWritten, true)
    assert.deepEqual(recorder.facts, [{ kind: "cancelled" }])
    dispose(peer, connection)
  })

  it("reports cancellation immediately before the turn ID is known", async () => {
    const { peer, connection } = await createConnectedPeer()
    const turnRequested = Promise.withResolvers<void>()
    const turnResponse =
      Promise.withResolvers<ReturnType<typeof inProgressTurn>>()
    peer.rpc.onRequest("turn/start", () => {
      turnRequested.resolve()
      return turnResponse.promise
    })
    const recorder = createProcessRecorder()
    const run = startCodexAppServerTurn(connection, recorder.process, {
      prompt: "Implement the active step.",
    })
    await turnRequested.promise

    run.abort()
    await run.completion

    assert.deepEqual(recorder.facts, [{ kind: "cancelled" }])
    assert.equal(peer.wireMethods.includes("turn/interrupt"), false)
    dispose(peer, connection)
  })
})
