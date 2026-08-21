import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ErrorCodes, ResponseError } from "vscode-jsonrpc/node"
import {
  type CodexAppServerConnection,
  startCodexAppServerConnection,
} from "../codex-app-server-connection.js"
import { createCodexAppServerReviewOwner } from "../codex-app-server-review.js"
import type { CodingEvent } from "../contracts.js"
import type {
  HumanReviewPort,
  HumanReviewRequest,
  HumanReviewResponse,
} from "../human-review.js"
import {
  type CodexAppServerTestPeer,
  createCodexAppServerTestPeer,
} from "./codex-app-server-test-peer.js"

class RecordingHumanReviewPort implements HumanReviewPort {
  readonly requests: HumanReviewRequest[] = []
  readonly cleared: string[] = []

  constructor(private readonly responses: HumanReviewResponse[]) {}

  review(request: HumanReviewRequest): Promise<HumanReviewResponse> {
    this.requests.push(request)
    const response = this.responses.shift()
    assert.notEqual(response, undefined)
    return Promise.resolve(response ?? { decision: "cancelled" })
  }

  clear(requestId: string): boolean {
    this.cleared.push(requestId)
    return false
  }

  dispose() {}
}

class PendingHumanReviewPort implements HumanReviewPort {
  readonly requests: HumanReviewRequest[] = []
  readonly completions = new Map<
    string,
    PromiseWithResolvers<HumanReviewResponse>
  >()

  review(request: HumanReviewRequest): Promise<HumanReviewResponse> {
    this.requests.push(request)
    const completion = Promise.withResolvers<HumanReviewResponse>()
    this.completions.set(request.requestId, completion)
    return completion.promise
  }

  clear(requestId: string): boolean {
    const completion = this.completions.get(requestId)
    if (completion === undefined) return false
    this.completions.delete(requestId)
    completion.resolve({ decision: "cleared" })
    return true
  }

  dispose() {}
}

async function nextTurn(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

async function waitForReview(port: PendingHumanReviewPort): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (port.requests.length > 0) return
    await nextTurn()
  }
  assert.fail("The test app-server did not deliver its review request.")
}

async function createHarness(humanReview: HumanReviewPort): Promise<{
  readonly peer: CodexAppServerTestPeer
  readonly connection: CodexAppServerConnection
  readonly events: CodingEvent[]
  readonly dispose: () => void
}> {
  const peer = createCodexAppServerTestPeer()
  const connection = await startCodexAppServerConnection(peer.streams, {
    repoEduRoot: "/repo-edu",
  })
  const events: CodingEvent[] = []
  const owner = createCodexAppServerReviewOwner(connection, humanReview, {
    emit: (event) => events.push(event),
  })
  return {
    peer,
    connection,
    events,
    dispose() {
      owner.dispose()
      connection.dispose()
      peer.dispose()
    },
  }
}

const threadFields = {
  itemId: "item-1",
  startedAtMs: 1,
  threadId: "thread-1",
  turnId: "turn-1",
} as const

describe("Codex app-server attended review protocol", () => {
  it("converts every supported request and decision into exact protocol replies", async () => {
    const humanReview = new RecordingHumanReviewPort([
      { decision: "accepted" },
      { decision: "accepted-for-session" },
      { decision: "declined" },
      { decision: "cancelled" },
      { decision: "accepted" },
      { decision: "accepted-for-session" },
      { decision: "accepted-for-session" },
      {
        decision: "permissions",
        permissions: ["network"],
        scope: "session",
      },
      {
        decision: "answered",
        answers: { account: ["secret answer"] },
      },
      { decision: "declined" },
      { decision: "accepted" },
    ])
    const harness = await createHarness(humanReview)

    assert.deepEqual(
      await harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, command: "pnpm test" },
      ),
      { decision: "accept" },
    )
    assert.deepEqual(
      await harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, itemId: "item-2", command: "pnpm check" },
      ),
      { decision: "acceptForSession" },
    )
    assert.deepEqual(
      await harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, itemId: "item-3", command: "git status" },
      ),
      { decision: "decline" },
    )
    assert.deepEqual(
      await harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, itemId: "item-4", command: "git commit" },
      ),
      { decision: "cancel" },
    )
    assert.deepEqual(
      await harness.peer.rpc.sendRequest("execCommandApproval", {
        callId: "legacy-command",
        command: ["pnpm", "test"],
        conversationId: "thread-1",
        cwd: "/repo-edu",
        parsedCmd: [],
      }),
      { decision: "approved" },
    )

    await harness.peer.rpc.sendNotification("item/started", {
      item: {
        changes: [
          { kind: { type: "update" }, path: "/repo-edu/a.ts" },
          { kind: { type: "add" }, path: "/repo-edu/b.ts" },
        ],
        id: "file-item",
        status: "inProgress",
        type: "fileChange",
      },
      threadId: "thread-1",
      turnId: "turn-1",
    })
    assert.deepEqual(
      await harness.peer.rpc.sendRequest("item/fileChange/requestApproval", {
        ...threadFields,
        grantRoot: "/repo-edu",
        itemId: "file-item",
      }),
      { decision: "acceptForSession" },
    )
    assert.deepEqual(
      await harness.peer.rpc.sendRequest("applyPatchApproval", {
        callId: "legacy-patch",
        conversationId: "thread-1",
        fileChanges: {
          "/repo-edu/a.ts": { type: "update", unified_diff: "secret diff" },
        },
      }),
      { decision: "approved_for_session" },
    )

    const requestedPermissions = {
      fileSystem: {
        entries: [
          {
            access: "write",
            path: { path: "/repo-edu", type: "path" },
          },
        ],
      },
      network: { enabled: true },
    }
    assert.deepEqual(
      await harness.peer.rpc.sendRequest("item/permissions/requestApproval", {
        ...threadFields,
        cwd: "/repo-edu",
        itemId: "permissions",
        permissions: requestedPermissions,
      }),
      {
        permissions: { network: requestedPermissions.network },
        scope: "session",
      },
    )

    assert.deepEqual(
      await harness.peer.rpc.sendRequest("item/tool/requestUserInput", {
        ...threadFields,
        isBlocking: true,
        itemId: "input",
        questions: [
          {
            header: "Account",
            id: "account",
            isSecret: true,
            question: "Enter the account token",
          },
        ],
      }),
      { answers: { account: ["secret answer"] } },
    )

    assert.deepEqual(
      await harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, itemId: "declined", command: "pnpm fix" },
      ),
      { decision: "decline" },
    )
    assert.deepEqual(
      await harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, itemId: "continued", command: "pnpm check" },
      ),
      { decision: "accept" },
    )

    assert.deepEqual(
      humanReview.requests.map((request) => request.category),
      [
        "command",
        "command",
        "command",
        "command",
        "command",
        "file-change",
        "file-change",
        "permission",
        "user-input",
        "command",
        "command",
      ],
    )
    assert.equal(
      humanReview.requests.some(
        (request) =>
          request.category === "file-change" &&
          request.summary.includes("/repo-edu/a.ts"),
      ),
      true,
    )
    const serializedEvents = JSON.stringify(harness.events)
    assert.equal(serializedEvents.includes("secret answer"), false)
    assert.equal(serializedEvents.includes("secret diff"), false)
    assert.equal(
      harness.events.filter((event) => event.kind === "human-review").length,
      22,
    )
    harness.dispose()
  })

  it("clears matching queued or active prompts without sending stale replies", async () => {
    for (const cause of ["turn start", "completion", "interruption"]) {
      const humanReview = new PendingHumanReviewPort()
      const harness = await createHarness(humanReview)
      const response = harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, command: `command for ${cause}` },
      )
      void response.catch(() => {})
      await waitForReview(humanReview)
      const requestId = humanReview.requests[0]?.requestId
      assert.notEqual(requestId, undefined)
      const [type, rawId] = requestId?.split(":") ?? []
      assert.equal(type, "number")

      await harness.peer.rpc.sendNotification("serverRequest/resolved", {
        requestId: Number(rawId),
        threadId: "thread-1",
      })
      await nextTurn()
      assert.equal(humanReview.completions.size, 0, cause)
      assert.equal(
        harness.events.some(
          (event) =>
            event.kind === "human-review" &&
            event.status === "completed" &&
            event.decision === "cleared",
        ),
        true,
        cause,
      )
      const settled = await Promise.race([
        response.then(
          () => true,
          () => true,
        ),
        nextTurn().then(() => false),
      ])
      assert.equal(settled, false, `${cause} sent a stale reply`)
      harness.dispose()
    }
  })

  it("refuses unadvertised and unknown requests safely and keeps reading", async () => {
    const humanReview = new RecordingHumanReviewPort([{ decision: "accepted" }])
    const harness = await createHarness(humanReview)
    const unsupported = [
      ["item/tool/call", { arguments: { token: "tool-secret" } }],
      ["attestation/generate", { challenge: "attestation-secret" }],
      [
        "account/chatgptAuthTokens/refresh",
        { previousAccountId: "account-secret", reason: "unauthorized" },
      ],
      ["future/unknown", { credential: "unknown-secret" }],
    ] as const

    assert.deepEqual(
      await harness.peer.rpc.sendRequest("mcpServer/elicitation/request", {
        secret: "mcp-secret",
      }),
      { action: "decline" },
    )

    for (const [method, params] of unsupported) {
      await assert.rejects(
        harness.peer.rpc.sendRequest(method, params),
        (error) =>
          error instanceof ResponseError &&
          error.code === ErrorCodes.MethodNotFound,
      )
    }
    assert.deepEqual(
      await harness.peer.rpc.sendRequest(
        "item/commandExecution/requestApproval",
        { ...threadFields, command: "pnpm check" },
      ),
      { decision: "accept" },
    )

    const refused = harness.events.filter(
      (event) => event.kind === "request-refused",
    )
    assert.equal(refused.length, unsupported.length + 1)
    assert.equal(JSON.stringify(refused).includes("secret"), false)
    assert.equal(
      refused.some((event) => event.summary.includes("unauthorized")),
      true,
    )
    harness.dispose()
  })

  it("returns invalid-params errors for malformed or cross-thread review data", async () => {
    const humanReview = new RecordingHumanReviewPort([])
    const harness = await createHarness(humanReview)
    for (const params of [
      { command: "pnpm test" },
      { ...threadFields, command: "pnpm test", threadId: "other-thread" },
    ]) {
      await assert.rejects(
        harness.peer.rpc.sendRequest(
          "item/commandExecution/requestApproval",
          params,
        ),
        (error) =>
          error instanceof ResponseError &&
          error.code === ErrorCodes.InvalidParams,
      )
    }
    assert.equal(humanReview.requests.length, 0)
    harness.dispose()
  })
})
