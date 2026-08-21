import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createTerminalHumanReviewPort,
  HumanReviewAdmissionError,
  type HumanReviewPromptDriver,
  type HumanReviewResponse,
} from "../human-review.js"

type PromptAnswers = {
  readonly selects?: string[]
  readonly checkboxes?: string[][]
  readonly texts?: string[]
}

function interactiveStreams() {
  return {
    input: { isTTY: true } as NodeJS.ReadableStream & { isTTY: boolean },
    output: { isTTY: true } as NodeJS.WritableStream & { isTTY: boolean },
  }
}

function promptDriver(
  answers: PromptAnswers,
  calls: string[] = [],
): HumanReviewPromptDriver {
  return {
    async select(options) {
      calls.push(`select:${options.message}`)
      const answer = answers.selects?.shift()
      assert.notEqual(answer, undefined)
      return answer ?? ""
    },
    async checkbox(options) {
      calls.push(`checkbox:${options.message}`)
      const answer = answers.checkboxes?.shift()
      assert.notEqual(answer, undefined)
      return answer ?? []
    },
    async text(options) {
      calls.push(`${options.secret ? "secret" : "text"}:${options.message}`)
      const answer = answers.texts?.shift()
      assert.notEqual(answer, undefined)
      return answer ?? ""
    },
  }
}

function createPort(prompts: HumanReviewPromptDriver, signal?: AbortSignal) {
  const terminalCalls: string[] = []
  const streams = interactiveStreams()
  return {
    terminalCalls,
    port: createTerminalHumanReviewPort({
      ...streams,
      prompts,
      signal,
      terminal: {
        async prompt(run) {
          terminalCalls.push("start")
          try {
            return await run()
          } finally {
            terminalCalls.push("finish")
          }
        },
      },
    }),
  }
}

describe("attended human review", () => {
  it("rejects non-interactive input or output before review can start", () => {
    const streams = interactiveStreams()
    const options = {
      ...streams,
      prompts: promptDriver({}),
      terminal: { prompt: <T>(run: () => Promise<T>) => run() },
    }
    assert.throws(
      () =>
        createTerminalHumanReviewPort({
          ...options,
          input: { isTTY: false } as NodeJS.ReadableStream & {
            isTTY: boolean
          },
        }),
      HumanReviewAdmissionError,
    )
    assert.throws(
      () =>
        createTerminalHumanReviewPort({
          ...options,
          output: { isTTY: false } as NodeJS.WritableStream & {
            isTTY: boolean
          },
        }),
      /interactive terminal input and output/,
    )
  })

  it("offers every action decision and only session approval when supported", async () => {
    const calls: string[] = []
    const { port, terminalCalls } = createPort(
      promptDriver(
        {
          selects: [
            "accepted",
            "accepted-for-session",
            "declined",
            "cancelled",
          ],
        },
        calls,
      ),
    )
    const responses: HumanReviewResponse[] = []
    for (const [index, category] of [
      "command",
      "command",
      "file-change",
      "file-change",
    ].entries()) {
      responses.push(
        await port.review({
          requestId: `request-${index}`,
          category: category as "command" | "file-change",
          summary: `Review ${index}`,
          allowSession: index < 2,
        }),
      )
    }

    assert.deepEqual(
      responses.map((response) => response.decision),
      ["accepted", "accepted-for-session", "declined", "cancelled"],
    )
    assert.deepEqual(terminalCalls, [
      "start",
      "finish",
      "start",
      "finish",
      "start",
      "finish",
      "start",
      "finish",
    ])
    assert.equal(calls.length, 4)
    port.dispose()
  })

  it("limits permission grants to the requested subset and records their scope", async () => {
    const { port } = createPort(
      promptDriver({
        checkboxes: [["network", "unrequested"]],
        selects: ["session"],
      }),
    )

    assert.deepEqual(
      await port.review({
        requestId: "permissions-1",
        category: "permission",
        summary: "Request permissions: file system, network",
        permissions: ["file-system", "network"],
      }),
      {
        decision: "permissions",
        permissions: ["network"],
        scope: "session",
      },
    )
    port.dispose()
  })

  it("answers option, other, plain-text, and secret questions without logging answers", async () => {
    const calls: string[] = []
    const { port } = createPort(
      promptDriver(
        {
          selects: ["option:1", "other"],
          texts: ["custom answer", "plain answer", "secret answer"],
        },
        calls,
      ),
    )

    const response = await port.review({
      requestId: "questions-1",
      category: "user-input",
      summary: "Answer Codex questions",
      questions: [
        {
          id: "choice",
          header: "Choice",
          question: "Choose one",
          options: [
            { label: "First", description: "First choice" },
            { label: "Second", description: "Second choice" },
          ],
          allowOther: false,
          secret: false,
        },
        {
          id: "other",
          header: "Other",
          question: "Choose or enter",
          options: [{ label: "Known", description: "Known choice" }],
          allowOther: true,
          secret: false,
        },
        {
          id: "plain",
          header: "Plain",
          question: "Enter text",
          options: [],
          allowOther: false,
          secret: false,
        },
        {
          id: "secret",
          header: "Secret",
          question: "Enter secret",
          options: [],
          allowOther: false,
          secret: true,
        },
      ],
    })

    assert.deepEqual(response, {
      decision: "answered",
      answers: {
        choice: ["Second"],
        other: ["custom answer"],
        plain: ["plain answer"],
        secret: ["secret answer"],
      },
    })
    assert.equal(JSON.stringify(calls).includes("secret answer"), false)
    assert.equal(
      calls.some((call) => call.startsWith("secret:Secret:")),
      true,
    )
    port.dispose()
  })

  it("serializes prompts and clears queued and active requests", async () => {
    const started: string[] = []
    const controllers = new Map<string, AbortSignal>()
    const completions = new Map<string, PromiseWithResolvers<string>>()
    const prompts: HumanReviewPromptDriver = {
      select(options) {
        started.push(options.message)
        controllers.set(options.message, options.context.signal)
        const completion = Promise.withResolvers<string>()
        completions.set(options.message, completion)
        options.context.signal.addEventListener(
          "abort",
          () => completion.reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        )
        return completion.promise
      },
      checkbox() {
        throw new Error("Unexpected checkbox prompt.")
      },
      text() {
        throw new Error("Unexpected text prompt.")
      },
    }
    const { port } = createPort(prompts)
    const active = port.review({
      requestId: "active",
      category: "command",
      summary: "Active",
      allowSession: true,
    })
    const queued = port.review({
      requestId: "queued",
      category: "command",
      summary: "Queued",
      allowSession: true,
    })

    assert.deepEqual(started, ["Active"])
    assert.equal(port.clear("queued"), true)
    assert.deepEqual(await queued, { decision: "cleared" })
    assert.equal(port.clear("active"), true)
    assert.equal(controllers.get("Active")?.aborted, true)
    assert.deepEqual(await active, { decision: "cleared" })
    assert.deepEqual(started, ["Active"])
    port.dispose()
  })

  it("cancels the active prompt and queued reviews when the run stops", async () => {
    const stop = new AbortController()
    const prompts: HumanReviewPromptDriver = {
      select(options) {
        return new Promise((_resolve, reject) => {
          options.context.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      },
      checkbox() {
        throw new Error("Unexpected checkbox prompt.")
      },
      text() {
        throw new Error("Unexpected text prompt.")
      },
    }
    const { port } = createPort(prompts, stop.signal)
    const active = port.review({
      requestId: "active",
      category: "command",
      summary: "Active",
      allowSession: true,
    })
    const queued = port.review({
      requestId: "queued",
      category: "command",
      summary: "Queued",
      allowSession: true,
    })

    stop.abort()
    assert.deepEqual(await active, { decision: "cancelled" })
    assert.deepEqual(await queued, { decision: "cancelled" })
  })
})
