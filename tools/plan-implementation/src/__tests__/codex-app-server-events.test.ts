import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createCodexAppServerEventMapper } from "../codex-app-server-events.js"
import type { CodingEvent } from "../contracts.js"

function createMapper(): {
  readonly events: CodingEvent[]
  readonly notify: (method: string, params: unknown) => void
} {
  const events: CodingEvent[] = []
  const mapper = createCodexAppServerEventMapper({
    threadId: "thread-1",
    emit: (event) => events.push(event),
  })
  return { events, notify: mapper.notification }
}

function itemNotification(item: unknown, threadId = "thread-1") {
  return { item, threadId, turnId: "turn-1" }
}

function usageBreakdown(totalTokens: number) {
  return {
    inputTokens: totalTokens - 100,
    cachedInputTokens: 50,
    cacheWriteInputTokens: 25,
    outputTokens: 100,
    reasoningOutputTokens: 40,
    totalTokens,
  }
}

describe("Codex app-server semantic event mapper", () => {
  it("maps stable item lifecycles and suppresses repeated narrative, todo, and web events", () => {
    const { events, notify } = createMapper()

    notify(
      "item/started",
      itemNotification({
        id: "reasoning-1",
        summary: ["not final"],
        type: "reasoning",
      }),
    )
    const completedReasoning = itemNotification({
      content: ["raw reasoning must stay private"],
      id: "reasoning-1",
      summary: ["  Inspect the event boundary.  ", "", "Map lifecycle."],
      type: "reasoning",
    })
    notify("item/completed", completedReasoning)
    notify("item/completed", completedReasoning)

    const plan = {
      threadId: "thread-1",
      turnId: "turn-1",
      plan: [
        { status: "completed", step: "Read contracts" },
        { status: "inProgress", step: "Map events" },
        { status: "pending", step: "Run tests" },
      ],
    }
    notify("turn/plan/updated", plan)
    notify("turn/plan/updated", plan)

    notify(
      "item/started",
      itemNotification({
        command: "pnpm --filter @repo-edu/plan-implementation test",
        id: "command-1",
        status: "inProgress",
        type: "commandExecution",
      }),
    )
    notify(
      "item/completed",
      itemNotification({
        aggregatedOutput: "all tests pass",
        command: "pnpm --filter @repo-edu/plan-implementation test",
        exitCode: 0,
        id: "command-1",
        status: "completed",
        type: "commandExecution",
      }),
    )
    notify(
      "item/completed",
      itemNotification({
        aggregatedOutput: "approval declined\n",
        command: "git push",
        exitCode: null,
        id: "command-2",
        status: "declined",
        type: "commandExecution",
      }),
    )

    notify(
      "item/completed",
      itemNotification({
        changes: [
          {
            diff: "ignored",
            kind: { type: "update" },
            path: "tools/plan-implementation/src/contracts.ts",
          },
        ],
        id: "change-1",
        status: "completed",
        type: "fileChange",
      }),
    )
    notify(
      "item/completed",
      itemNotification({
        changes: [
          {
            diff: "ignored",
            kind: { type: "delete" },
            path: "obsolete.ts",
          },
        ],
        id: "change-2",
        status: "declined",
        type: "fileChange",
      }),
    )

    notify(
      "item/started",
      itemNotification({
        id: "tool-1",
        server: "github",
        status: "inProgress",
        tool: "search",
        type: "mcpToolCall",
      }),
    )
    notify(
      "item/completed",
      itemNotification({
        id: "tool-1",
        server: "github",
        status: "failed",
        tool: "search",
        type: "mcpToolCall",
      }),
    )

    const webSearch = itemNotification({
      id: "search-1",
      query: "Codex app-server events",
      type: "webSearch",
    })
    notify("item/started", webSearch)
    notify("item/completed", webSearch)
    notify(
      "item/started",
      itemNotification({
        id: "image-1",
        path: "/tmp/image.png",
        type: "imageView",
      }),
    )
    notify(
      "item/started",
      itemNotification(
        {
          command: "must be ignored",
          id: "other-thread-command",
          status: "inProgress",
          type: "commandExecution",
        },
        "thread-2",
      ),
    )

    assert.deepEqual(events, [
      { kind: "thread-started", threadId: "thread-1" },
      { kind: "narrative", text: "Inspect the event boundary." },
      { kind: "narrative", text: "Map lifecycle." },
      { kind: "todo", text: "Map events" },
      {
        kind: "command",
        command: "pnpm --filter @repo-edu/plan-implementation test",
        status: "started",
        exitCode: null,
        output: "",
      },
      {
        kind: "command",
        command: "pnpm --filter @repo-edu/plan-implementation test",
        status: "succeeded",
        exitCode: 0,
        output: "",
      },
      {
        kind: "command",
        command: "git push",
        status: "failed",
        exitCode: null,
        output: "approval declined",
      },
      {
        kind: "file-change",
        status: "completed",
        changes: [
          {
            path: "tools/plan-implementation/src/contracts.ts",
            kind: "update",
          },
        ],
      },
      {
        kind: "file-change",
        status: "failed",
        changes: [{ path: "obsolete.ts", kind: "delete" }],
      },
      {
        kind: "tool-call",
        server: "github",
        tool: "search",
        status: "started",
      },
      {
        kind: "tool-call",
        server: "github",
        tool: "search",
        status: "failed",
      },
      { kind: "web-search", query: "Codex app-server events" },
    ])
    assert.equal(JSON.stringify(events).includes("raw reasoning"), false)
  })

  it("maps live usage, compaction, retry-aware errors, and both warning sources", () => {
    const { events, notify } = createMapper()

    notify("thread/tokenUsage/updated", {
      threadId: "thread-1",
      tokenUsage: {
        total: usageBreakdown(15_000),
        last: usageBreakdown(5_000),
        modelContextWindow: 200_000,
      },
      turnId: "turn-1",
    })
    notify(
      "item/started",
      itemNotification({ id: "compaction-1", type: "contextCompaction" }),
    )
    notify(
      "item/completed",
      itemNotification({ id: "compaction-1", type: "contextCompaction" }),
    )
    notify("error", {
      error: { message: "The stream disconnected." },
      threadId: "thread-1",
      turnId: "turn-1",
      willRetry: true,
    })
    notify("warning", { message: "Configuration was recovered." })
    notify("guardianWarning", {
      message: "Automatic review is unavailable.",
      threadId: "thread-1",
    })

    assert.deepEqual(events, [
      { kind: "thread-started", threadId: "thread-1" },
      {
        kind: "usage",
        usage: {
          cumulative: usageBreakdown(15_000),
          lastContext: usageBreakdown(5_000),
          modelContextWindowTokens: 200_000,
        },
      },
      { kind: "context-compaction", status: "started" },
      { kind: "context-compaction", status: "completed" },
      {
        kind: "error",
        message: "The stream disconnected.",
        willRetry: true,
      },
      {
        kind: "warning",
        source: "app-server",
        message: "Configuration was recovered.",
      },
      {
        kind: "warning",
        source: "guardian",
        message: "Automatic review is unavailable.",
      },
    ])
  })

  it("preserves automatic-review lifecycle and exposes only approved safe action summaries", () => {
    const { events, notify } = createMapper()
    const actions = [
      {
        action: {
          command: "pnpm --filter @repo-edu/plan-implementation check",
          cwd: "/repo-edu",
          source: "shell",
          type: "command",
        },
        summary: { kind: "command", summary: "Check repository" },
      },
      {
        action: {
          argv: ["script.js", "--token", "secret"],
          cwd: "/repo-edu",
          program: "node",
          source: "unifiedExec",
          type: "execve",
        },
        summary: { kind: "command", summary: "Run Node command" },
      },
      {
        action: {
          cwd: "/repo-edu",
          files: ["/repo-edu/a.ts", "/repo-edu/b.ts"],
          type: "applyPatch",
        },
        summary: {
          kind: "patch",
          summary: "Edit files: /repo-edu/a.ts, /repo-edu/b.ts",
        },
      },
      {
        action: {
          authentication: "secret",
          host: "api.example.com",
          port: 443,
          protocol: "https",
          target: "api.example.com",
          type: "networkAccess",
        },
        summary: {
          kind: "network",
          summary: "Access api.example.com over https",
        },
      },
      {
        action: {
          arguments: { token: "secret" },
          server: "github",
          toolName: "search",
          type: "mcpToolCall",
        },
        summary: { kind: "mcp", summary: "Use tool: github.search" },
      },
      {
        action: {
          permissions: { fileSystem: {}, network: {} },
          reason: "secret detail",
          type: "requestPermissions",
        },
        summary: {
          kind: "permissions",
          summary: "Request permissions: file system, network",
        },
      },
    ] as const

    for (const [index, value] of actions.entries()) {
      notify("item/autoApprovalReview/started", {
        action: value.action,
        review: { rationale: "secret rationale", status: "inProgress" },
        reviewId: `review-${index}`,
        threadId: "thread-1",
        turnId: "turn-1",
      })
      notify("item/autoApprovalReview/completed", {
        action: value.action,
        decisionSource: "agent",
        review: { rationale: "secret rationale", status: "approved" },
        reviewId: `review-${index}`,
        threadId: "thread-1",
        turnId: "turn-1",
      })
    }
    for (const [index, status] of ["denied", "timedOut", "aborted"].entries()) {
      notify("item/autoApprovalReview/completed", {
        action: actions[0]?.action,
        review: { status },
        reviewId: `terminal-review-${index}`,
        threadId: "thread-1",
        turnId: "turn-1",
      })
    }

    const reviewEvents = events.filter(
      (event) => event.kind === "approval-review",
    )
    assert.deepEqual(
      reviewEvents.slice(0, 12).map((event) => ({
        status: event.status,
        action: event.action,
      })),
      actions.flatMap((value) => [
        { status: "inProgress", action: value.summary },
        { status: "approved", action: value.summary },
      ]),
    )
    assert.deepEqual(
      reviewEvents.slice(12).map((event) => event.status),
      ["denied", "timedOut", "aborted"],
    )
    const serialized = JSON.stringify(reviewEvents)
    assert.equal(serialized.includes("secret rationale"), false)
    assert.equal(serialized.includes("secret detail"), false)
    assert.equal(serialized.includes('"authentication"'), false)
    assert.equal(serialized.includes('"arguments"'), false)
  })

  it("rejects malformed lifecycle data and declares attended and refused semantic contracts", () => {
    const { notify } = createMapper()
    assert.throws(
      () =>
        notify(
          "item/completed",
          itemNotification({
            command: "pnpm test",
            id: "command-1",
            status: "inProgress",
            type: "commandExecution",
          }),
        ),
      /still in progress/,
    )

    const semanticEvents = [
      {
        kind: "human-review",
        requestId: "request-1",
        category: "command",
        status: "requested",
        summary: "Run tests",
      },
      {
        kind: "human-review",
        requestId: "request-1",
        category: "command",
        status: "completed",
        summary: "Run tests",
        decision: "accepted",
      },
      {
        kind: "request-refused",
        requestId: "request-2",
        summary: "MCP elicitation",
        response: "unsupported",
      },
    ] as const satisfies readonly CodingEvent[]
    assert.equal(JSON.stringify(semanticEvents).includes("answer"), false)
  })
})
