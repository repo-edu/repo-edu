import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ThreadEvent, ThreadOptions, TurnOptions } from "@openai/codex-sdk"
import { parseCodingResult } from "../coding-result.js"
import {
  buildCodingThreadOptions,
  type CodingSdkFactory,
  runCodexCodingStep,
} from "../coding-sdk.js"
import type { CodingEvent } from "../contracts.js"
import { testCodingRequest } from "./coding-test-plan.js"

const usage = {
  input_tokens: 4,
  cached_input_tokens: 1,
  cache_write_input_tokens: 0,
  output_tokens: 3,
  reasoning_output_tokens: 2,
}

function codingEvents(result: unknown, threadId: string): ThreadEvent[] {
  return [
    { type: "thread.started", thread_id: threadId },
    { type: "turn.started" },
    {
      type: "item.completed",
      item: {
        id: "reasoning-1",
        type: "reasoning",
        text: "I'll add the coding boundary and its test first.",
      },
    },
    {
      type: "item.started",
      item: {
        id: "command-1",
        type: "command_execution",
        command: "pnpm --filter @repo-edu/plan-implementation test",
        aggregated_output: "",
        status: "in_progress",
      },
    },
    {
      type: "item.updated",
      item: {
        id: "command-1",
        type: "command_execution",
        command: "pnpm --filter @repo-edu/plan-implementation test",
        aggregated_output: "running",
        status: "in_progress",
      },
    },
    {
      type: "item.completed",
      item: {
        id: "command-1",
        type: "command_execution",
        command: "pnpm --filter @repo-edu/plan-implementation test",
        aggregated_output: "all tests pass",
        exit_code: 0,
        status: "completed",
      },
    },
    {
      type: "item.completed",
      item: {
        id: "command-2",
        type: "command_execution",
        command: "pnpm --filter @repo-edu/plan-implementation typecheck",
        aggregated_output: "error TS2304: Cannot find name 'missing'.",
        exit_code: 2,
        status: "failed",
      },
    },
    {
      type: "item.completed",
      item: {
        id: "change-1",
        type: "file_change",
        changes: [
          { path: "tools/plan-implementation/src/coding.ts", kind: "add" },
        ],
        status: "completed",
      },
    },
    {
      type: "item.completed",
      item: {
        id: "message-1",
        type: "agent_message",
        text: JSON.stringify({ result }),
      },
    },
    { type: "turn.completed", usage },
  ]
}

describe("Codex coding SDK boundary", () => {
  it("starts a fresh workspace-writing thread for each step and returns structured results", async () => {
    const threadOptions: ThreadOptions[] = []
    const turnOptions: TurnOptions[] = []
    const prompts: string[] = []
    let threadCount = 0
    const results = [
      {
        status: "succeeded",
        commit: {
          subject:
            "A1 redesign(plan-implementation): own plan-step Codex SDK host process",
          decisionBullets: ["The runner owns one fresh coding context."],
        },
      },
      { status: "blocked", reason: "The required peer contract is absent." },
    ] as const
    const factory: CodingSdkFactory = () => ({
      startThread(options) {
        threadOptions.push(options)
        const index = threadCount
        threadCount += 1
        return {
          async runStreamed(prompt, options) {
            prompts.push(prompt)
            turnOptions.push(options)
            return {
              events: (async function* () {
                yield* codingEvents(results[index], `thread-${index + 1}`)
              })(),
            }
          },
        }
      },
    })
    const emitted: CodingEvent[] = []

    const first = await runCodexCodingStep(testCodingRequest(1), {
      signal: new AbortController().signal,
      emit: (event) => {
        emitted.push(event)
      },
      factory,
    })
    const second = await runCodexCodingStep(testCodingRequest(2), {
      signal: new AbortController().signal,
      emit: (event) => {
        emitted.push(event)
      },
      factory,
    })

    assert.equal(threadCount, 2)
    assert.deepEqual(threadOptions, [
      buildCodingThreadOptions("/repo-edu"),
      buildCodingThreadOptions("/repo-edu"),
    ])
    assert.match(prompts[0], /plan step 1: First step/)
    assert.match(prompts[1], /plan step 2: Second step/)
    assert.equal(turnOptions[0].signal instanceof AbortSignal, true)
    assert.equal(
      JSON.stringify(turnOptions[0].outputSchema).includes("proof"),
      false,
    )
    assert.equal(
      (turnOptions[0].outputSchema as { readonly type?: unknown }).type,
      "object",
    )
    assert.equal(first.status, "succeeded")
    assert.deepEqual(second, results[1])
    assert.deepEqual(
      emitted.filter((event) => event.kind === "thread-started"),
      [
        { kind: "thread-started", threadId: "thread-1" },
        { kind: "thread-started", threadId: "thread-2" },
      ],
    )
    const firstRunEvents = emitted.slice(
      0,
      emitted.findIndex(
        (event) =>
          event.kind === "thread-started" && event.threadId === "thread-2",
      ),
    )
    assert.deepEqual(
      firstRunEvents.filter((event) => event.kind === "narrative"),
      [
        {
          kind: "narrative",
          text: "I'll add the coding boundary and its test first.",
        },
      ],
    )
    assert.deepEqual(
      firstRunEvents.filter((event) => event.kind === "command"),
      [
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
          command: "pnpm --filter @repo-edu/plan-implementation typecheck",
          status: "started",
          exitCode: null,
          output: "",
        },
        {
          kind: "command",
          command: "pnpm --filter @repo-edu/plan-implementation typecheck",
          status: "failed",
          exitCode: 2,
          output: "error TS2304: Cannot find name 'missing'.",
        },
      ],
    )
    assert.deepEqual(
      firstRunEvents.filter((event) => event.kind === "file-change"),
      [
        {
          kind: "file-change",
          status: "completed",
          changes: [
            { path: "tools/plan-implementation/src/coding.ts", kind: "add" },
          ],
        },
      ],
    )
    assert.deepEqual(
      firstRunEvents.filter((event) => event.kind === "usage"),
      [
        {
          kind: "usage",
          tokens: {
            inputTokens: 4,
            cachedInputTokens: 1,
            cacheWriteInputTokens: 0,
            outputTokens: 3,
            reasoningOutputTokens: 2,
          },
        },
      ],
    )
  })

  it("passes abort to the active SDK turn", async () => {
    const started = Promise.withResolvers<void>()
    const factory: CodingSdkFactory = () => ({
      startThread() {
        return {
          async runStreamed(_prompt, options) {
            return {
              events: (async function* () {
                started.resolve()
                await new Promise<void>((resolve) => {
                  options.signal?.addEventListener("abort", () => resolve(), {
                    once: true,
                  })
                })
                throw new DOMException("cancelled", "AbortError")
              })(),
            }
          },
        }
      },
    })
    const controller = new AbortController()
    const run = runCodexCodingStep(testCodingRequest(), {
      signal: controller.signal,
      emit() {},
      factory,
    })

    await started.promise
    controller.abort()

    await assert.rejects(
      run,
      (error: unknown) =>
        error instanceof DOMException && error.name === "AbortError",
    )
  })

  it("rejects proof data in the exact coding result contract", () => {
    assert.throws(
      () =>
        parseCodingResult(
          JSON.stringify({
            status: "blocked",
            reason: "A proof was requested.",
            proofs: [],
          }),
        ),
      /invalid structured coding result/,
    )
  })
})
