import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  CodingEvent,
  PlanImplementationEvent,
  PlanSourceIdentity,
} from "../contracts.js"
import { createPlanImplementationEventStream } from "../progress-events.js"
import { createTerminalView } from "../terminal-view.js"

const source: PlanSourceIdentity = {
  planName: "app-server-runner",
  planPath: "/plan/plan-app-server-runner.md",
  commitOid: "a".repeat(40),
  blobOid: "b".repeat(40),
}

function tokenBreakdown(totalTokens: number) {
  return {
    inputTokens: totalTokens - 1_000,
    cachedInputTokens: 3_000,
    cacheWriteInputTokens: 0,
    outputTokens: 1_000,
    reasoningOutputTokens: 400,
    totalTokens,
  }
}

const codingEvents = [
  {
    kind: "thread-started",
    threadId: "thread-1",
    effectiveApprovalPolicy: "on-request",
    effectiveApprovalsReviewer: "auto_review",
  },
  {
    kind: "usage",
    usage: {
      cumulative: tokenBreakdown(15_000),
      lastContext: tokenBreakdown(5_000),
      modelContextWindowTokens: 200_000,
    },
  },
  { kind: "context-compaction", status: "started" },
  { kind: "context-compaction", status: "completed" },
  {
    kind: "error",
    message: "Temporary stream failure.",
    willRetry: true,
  },
  {
    kind: "error",
    message: "Terminal stream failure.",
    willRetry: false,
  },
  {
    kind: "warning",
    source: "app-server",
    message: "Configuration changed.",
  },
  {
    kind: "warning",
    source: "guardian",
    message: "Automatic review is unavailable.",
  },
  {
    kind: "approval-review",
    reviewId: "review-1",
    status: "inProgress",
    action: { kind: "network", summary: "Access api.example over https" },
  },
  {
    kind: "approval-review",
    reviewId: "review-1",
    status: "denied",
    action: { kind: "network", summary: "Access api.example over https" },
  },
  {
    kind: "human-review",
    requestId: "string:1",
    category: "command",
    status: "requested",
    summary: "Install dependencies",
  },
  {
    kind: "human-review",
    requestId: "string:1",
    category: "command",
    status: "completed",
    summary: "Install dependencies",
    decision: "declined",
  },
  {
    kind: "request-refused",
    requestId: "string:2",
    summary: "Unsupported MCP elicitation",
    response: "unsupported",
  },
] as const satisfies readonly CodingEvent[]

describe("terminal app-server observability", () => {
  it("renders each semantic fact while the transcript preserves its exact payload", () => {
    const overview: string[] = []
    const detail: string[] = []
    const stored: PlanImplementationEvent[] = []
    const stream = createPlanImplementationEventStream({
      transcript: {
        invocationId: "invocation-1",
        path: "/transcript.jsonl",
        write(event) {
          stored.push(event)
        },
        close() {},
      },
      presentation: createTerminalView({
        overview(line) {
          overview.push(line)
        },
        progress() {},
        detail(render) {
          detail.push(render())
        },
        close() {},
      }),
      now: () => new Date("2026-08-21T10:00:00.000Z"),
    })
    stream.emit({
      kind: "run-started",
      invocationId: "invocation-1",
      source,
      request: { mode: "count", count: 1 },
      resolvedCeiling: 6,
      totalSteps: 6,
    })
    for (const event of codingEvents) {
      stream.emit({ kind: "coding", step: 6, event })
    }
    stream.close()

    assert.deepEqual(
      stored
        .filter((event) => event.kind === "coding")
        .map((event) => event.event),
      codingEvents,
    )
    const displayed = overview.join("\n")
    assert.match(
      displayed,
      /Codex thread thread-1: effective reviewer auto_review; approval policy on-request\./,
    )
    assert.match(
      displayed,
      /Context: 5000\/200000 tokens \(2\.5%\); cumulative: .*15000 total tokens\./,
    )
    assert.match(displayed, /Context compaction completed\./)
    assert.match(
      displayed,
      /Codex error \(retrying\): Temporary stream failure\./,
    )
    assert.match(
      displayed,
      /Codex error \(no retry\): Terminal stream failure\./,
    )
    assert.match(displayed, /App-server warning: Configuration changed\./)
    assert.match(
      displayed,
      /Guardian warning: Automatic review is unavailable\./,
    )
    assert.match(
      displayed,
      /Automatic review denied: Access api\.example over https/,
    )
    assert.match(
      displayed,
      /Human review requested \(command\): Install dependencies/,
    )
    assert.match(
      displayed,
      /Human review declined \(command\): Install dependencies/,
    )
    assert.match(
      displayed,
      /Request refused \(unsupported\): Unsupported MCP elicitation/,
    )
    assert.deepEqual(
      detail.filter(
        (line) =>
          line.includes("Compacting context") ||
          line.includes("Automatic review:"),
      ),
      [
        "[0:00] Compacting context",
        "[0:00] Automatic review: Access api.example over https",
      ],
    )
  })
})
