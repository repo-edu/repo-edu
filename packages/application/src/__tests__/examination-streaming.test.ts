import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  ExaminationGenerateOutput,
  ExaminationGenerateQuestionsInput,
  ExaminationLookupQuestionsInput,
} from "@repo-edu/application-contract"
import type {
  FileSystemPort,
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
  LlmStreamEvent,
  TokenizerPort,
} from "@repo-edu/host-runtime-contract"
import { LlmError } from "@repo-edu/integrations-llm-contract"
import { createInMemoryExaminationArchive } from "../examination-workflows/archive-port.js"
import { createExaminationWorkflowHandlers } from "../examination-workflows/examination-workflows.js"

const usage = {
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 5,
  reasoningOutputTokens: 0,
  wallMs: 25,
  authMode: "subscription" as const,
}

const tokenizer: TokenizerPort = {
  async loadTokenizerLanguage() {
    throw new Error("Tokenizer not available in this test.")
  },
}

const stubFileSystem: FileSystemPort = {
  userHomeSystemDirectories: [],
  inspect: async () => [],
  stat: async () => ({ kind: "directory", size: null }),
  applyBatch: async () => ({ completed: [] }),
  createTempDirectory: async () => "/tmp/repo-edu-test",
  listDirectory: async () => [],
  listFiles: async () => [],
  readFileInsideRoot: async () => ({
    relativePath: "main.ts",
    bytes: new TextEncoder().encode("const answer = 42\n"),
  }),
}

function questionJson(index: number): string {
  return JSON.stringify({
    question: `Q${index}?`,
    answer: `A${index}.`,
    anchor: { sourceId: "E1", lineRange: { start: 1, end: 2 } },
  })
}

function replyJson(questionCount: number): string {
  return `{"questions":[${Array.from({ length: questionCount }, (_, index) =>
    questionJson(index + 1),
  ).join(",")}]}`
}

function replyJsonFromIndexes(indexes: readonly number[]): string {
  return `{"questions":[${indexes.map((index) => questionJson(index)).join(",")}]}`
}

function baseInput(
  overrides: Partial<ExaminationGenerateQuestionsInput> = {},
): ExaminationGenerateQuestionsInput {
  return {
    personId: "p_1",
    contentScopeId: "a".repeat(40),
    localIdentityContext: {
      names: ["Ada Lovelace"],
      emails: ["ada@example.test"],
      opaqueIdentifiers: ["student-abc"],
      gitUsernames: ["adal"],
    },
    excerpts: [
      { filePath: "src/a.unknown", startLine: 1, lines: ["alpha", "beta"] },
    ],
    excerptFileSources: { "src/a.unknown": "alpha\nbeta" },
    questionCount: 2,
    generationControlId: "stream-test",
    llmSettings: {
      llmConnections: [
        {
          id: "llm-1",
          name: "Test Claude",
          provider: "claude",
          authMode: "subscription",
          apiKey: "",
        },
      ],
      activeLlmConnectionId: "llm-1",
      examinationModelsByProvider: { claude: "22" },
    },
    ...overrides,
  }
}

function lookupInput(
  input: ExaminationGenerateQuestionsInput,
): ExaminationLookupQuestionsInput {
  const copy = { ...input }
  delete (copy as { generationControlId?: string }).generationControlId
  delete (copy as { regenerate?: boolean }).regenerate
  delete (copy as { seedQuestions?: unknown }).seedQuestions
  return copy
}

function streamLlm(events: readonly LlmStreamEvent[]): LlmPort {
  return {
    async run(_request: LlmRunRequest): Promise<LlmRunResult> {
      throw new Error("run is not used by streamed examination generation.")
    },
    async *stream(_request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
      yield* events
    },
  }
}

function failingStreamLlm(error: unknown): LlmPort {
  return {
    async run(_request: LlmRunRequest): Promise<LlmRunResult> {
      throw new Error("run is not used by streamed examination generation.")
    },
    stream(_request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<LlmStreamEvent>> {
              throw error
            },
          }
        },
      }
    },
  }
}

function sequentialStreamLlm(
  eventBatches: readonly (readonly LlmStreamEvent[])[],
): LlmPort {
  let callCount = 0
  return {
    async run(_request: LlmRunRequest): Promise<LlmRunResult> {
      throw new Error("run is not used by streamed examination generation.")
    },
    async *stream(_request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
      const events =
        eventBatches[Math.min(callCount, eventBatches.length - 1)] ?? []
      callCount += 1
      yield* events
    },
  }
}

function blockingStreamLlm(delta: string): LlmPort {
  return {
    async run(_request: LlmRunRequest): Promise<LlmRunResult> {
      throw new Error("run is not used by streamed examination generation.")
    },
    async *stream(request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
      yield { kind: "text-delta", text: delta }
      await new Promise<void>((resolve) => {
        request.signal?.addEventListener("abort", () => resolve(), {
          once: true,
        })
      })
    },
  }
}

describe("examination.generateQuestions streaming", () => {
  it("streams in-progress fields and only accepts a question once its anchor is complete", async () => {
    const handlers = createExaminationWorkflowHandlers({
      llm: streamLlm([
        {
          kind: "text-delta",
          text: '{"questions":[{"question":"Q1?","answer":"A1."',
        },
        {
          kind: "text-delta",
          text: ',"anchor":{"sourceId":"E1","lineRange":{"start":1,"end":2}}}]}',
        },
        { kind: "done", usage },
      ]),
      archive: createInMemoryExaminationArchive(),
      tokenizer,
      fileSystem: stubFileSystem,
    })
    const partials: ExaminationGenerateOutput[] = []

    const result = await handlers["examination.generateQuestions"](
      baseInput(),
      {
        onOutput(output) {
          partials.push(output)
        },
      },
    )

    const partialEvents = partials.filter(
      (output) => output.kind === "partial-questions",
    )
    const acceptedCounts = partialEvents.map((output) =>
      output.kind === "partial-questions" ? output.acceptedQuestionCount : -1,
    )
    assert.deepEqual([...new Set(acceptedCounts)].sort(), [0, 1])
    const inProgressBeforeAccept = partialEvents.find(
      (output) =>
        output.kind === "partial-questions" &&
        output.acceptedQuestionCount === 0,
    )
    assert.equal(
      inProgressBeforeAccept?.kind === "partial-questions" &&
        inProgressBeforeAccept.inProgressQuestion?.question,
      "Q1?",
    )
    assert.equal(
      inProgressBeforeAccept?.kind === "partial-questions" &&
        inProgressBeforeAccept.inProgressQuestion?.answer,
      "A1.",
    )
    assert.equal(result.questions.length, 1)
  })

  it("emits stream progress before partial JSON has a question shape", async () => {
    const handlers = createExaminationWorkflowHandlers({
      llm: streamLlm([
        { kind: "text-delta", text: "{" },
        { kind: "text-delta", text: '"questions":[' },
        { kind: "text-delta", text: `${questionJson(1)}]}` },
        { kind: "done", usage },
      ]),
      archive: createInMemoryExaminationArchive(),
      tokenizer,
      fileSystem: stubFileSystem,
    })
    const timeline: string[] = []
    const previews: string[] = []

    const result = await handlers["examination.generateQuestions"](
      baseInput({ questionCount: 1 }),
      {
        onOutput(output) {
          if (output.kind === "stream-progress") {
            timeline.push(`stream:${output.streamedCharacterCount}`)
            previews.push(output.streamedTextPreview)
            return
          }
          if (output.kind === "partial-questions") {
            timeline.push(`partial:${output.acceptedQuestionCount}`)
          }
        },
      },
    )

    const firstStreamProgress = timeline.indexOf("stream:1")
    const firstPartial = timeline.findIndex((entry) =>
      entry.startsWith("partial:"),
    )
    assert.equal(result.questions.length, 1)
    assert.ok(firstStreamProgress >= 0)
    assert.ok(firstPartial >= 0)
    assert.ok(firstStreamProgress < firstPartial)
    assert.deepEqual(timeline.slice(0, 2), ["stream:1", "stream:14"])
    assert.deepEqual(previews.slice(0, 2), ["{", '{"questions":['])
  })

  it("surfaces provider activity before response text starts", async () => {
    const handlers = createExaminationWorkflowHandlers({
      llm: streamLlm([
        { kind: "activity", label: "Codex is reasoning." },
        { kind: "text-delta", text: replyJson(1) },
        { kind: "done", usage },
      ]),
      archive: createInMemoryExaminationArchive(),
      tokenizer,
      fileSystem: stubFileSystem,
    })
    const progressLabels: (string | null)[] = []

    const result = await handlers["examination.generateQuestions"](
      baseInput({ questionCount: 1 }),
      {
        onOutput(output) {
          if (output.kind === "stream-progress") {
            progressLabels.push(output.activityLabel)
          }
        },
      },
    )

    assert.equal(result.questions.length, 1)
    assert.deepEqual(progressLabels.slice(0, 2), [
      "Codex is reasoning.",
      "Receiving model response.",
    ])
  })

  it("tolerates an opening JSON fence while streaming", async () => {
    const handlers = createExaminationWorkflowHandlers({
      llm: streamLlm([
        { kind: "text-delta", text: "```json\n" },
        { kind: "text-delta", text: replyJson(1) },
        { kind: "done", usage },
      ]),
      archive: createInMemoryExaminationArchive(),
      tokenizer,
      fileSystem: stubFileSystem,
    })
    const partials: ExaminationGenerateOutput[] = []

    const result = await handlers["examination.generateQuestions"](
      baseInput(),
      {
        onOutput(output) {
          partials.push(output)
        },
      },
    )

    assert.equal(result.questions.length, 1)
    assert.equal(
      partials.some((output) => output.kind === "partial-questions"),
      true,
    )
  })

  it("fails stream exhaustion without done and does not archive partial questions", async () => {
    const archive = createInMemoryExaminationArchive()
    const input = baseInput()
    const handlers = createExaminationWorkflowHandlers({
      llm: streamLlm([{ kind: "text-delta", text: replyJson(1) }]),
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    await assert.rejects(
      () => handlers["examination.generateQuestions"](input),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        /terminal usage event/.test(String(error.message)),
    )
    const lookup = await handlers["examination.lookupQuestions"](
      lookupInput(input),
    )
    assert.equal(lookup.exact, null)
    assert.equal(lookup.availableSets.length, 0)
  })

  it("normalizes LLM stream failures into app-level provider errors", async () => {
    const archive = createInMemoryExaminationArchive()
    const input = baseInput()
    const handlers = createExaminationWorkflowHandlers({
      llm: failingStreamLlm(
        new LlmError("auth", "Claude CLI is not logged in.", {
          context: { provider: "claude", authMode: "subscription" },
        }),
      ),
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    await assert.rejects(
      () => handlers["examination.generateQuestions"](input),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "provider" &&
        (error as { provider?: unknown }).provider === "llm" &&
        (error as { operation?: unknown }).operation ===
          "examination.generateQuestions" &&
        (error as { message?: unknown }).message ===
          "Claude CLI is not logged in." &&
        (error as { retryable?: unknown }).retryable === false,
    )
  })

  it("soft-stops and persists the accepted partial set with nullable usage", async () => {
    const archive = createInMemoryExaminationArchive()
    const input = baseInput()
    const handlers = createExaminationWorkflowHandlers({
      llm: blockingStreamLlm(`{"questions":[${questionJson(1)},`),
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })
    let resolveFirstPartial!: () => void
    const firstPartial = new Promise<void>((resolve) => {
      resolveFirstPartial = resolve
    })

    const generation = handlers["examination.generateQuestions"](input, {
      onOutput(output) {
        if (output.kind === "partial-questions") resolveFirstPartial()
      },
    })
    await firstPartial
    assert.deepEqual(
      await handlers["examination.stopGeneration"]({
        generationControlId: input.generationControlId,
      }),
      { stopped: true },
    )
    const result = await generation

    assert.equal(result.questions.length, 1)
    assert.equal(result.archivedProvenance.usage, null)
    const lookup = await handlers["examination.lookupQuestions"](
      lookupInput(input),
    )
    assert.equal(lookup.availableSets.length, 1)
    assert.equal(lookup.availableSets[0]?.archivedProvenance.usage, null)
  })

  it("extends seed questions by generating only the additional count", async () => {
    let capturedPrompt = ""
    const archive = createInMemoryExaminationArchive()
    const seedQuestions = [
      {
        question: "Seed Q1?",
        answer: "Seed A1.",
        anchor: { sourceId: "E1", lineRange: { start: 1, end: 2 } },
      },
      {
        question: "Seed Q2?",
        answer: "Seed A2.",
        anchor: { sourceId: "E1", lineRange: { start: 1, end: 2 } },
      },
    ]
    const input = baseInput({
      questionCount: 4,
      seedQuestions,
    })
    const handlers = createExaminationWorkflowHandlers({
      llm: {
        async run(_request: LlmRunRequest): Promise<LlmRunResult> {
          throw new Error("run is not used by streamed examination generation.")
        },
        async *stream(request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
          capturedPrompt = request.prompt
          yield { kind: "text-delta", text: replyJsonFromIndexes([3, 4]) }
          yield { kind: "done", usage }
        },
      },
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })
    const partialCounts: number[] = []

    const result = await handlers["examination.generateQuestions"](input, {
      onOutput(output) {
        if (output.kind === "partial-questions") {
          partialCounts.push(output.questions.length)
        }
      },
    })

    assert.match(capturedPrompt, /Generate exactly 2 additional questions\./)
    assert.match(capturedPrompt, /Already accepted questions:/)
    assert.deepEqual(
      result.questions.map((question) => question.question),
      ["Seed Q1?", "Seed Q2?", "Q3?", "Q4?"],
    )
    assert.deepEqual(partialCounts, [4])
    assert.equal(result.archivedProvenance.questionCount, 4)
  })

  it("supersedes the archived seed set after a successful extension", async () => {
    const archive = createInMemoryExaminationArchive()
    const handlers = createExaminationWorkflowHandlers({
      llm: sequentialStreamLlm([
        [
          { kind: "text-delta", text: replyJson(2) },
          { kind: "done", usage },
        ],
        [
          { kind: "text-delta", text: replyJsonFromIndexes([3]) },
          { kind: "done", usage },
        ],
      ]),
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    const seedResult = await handlers["examination.generateQuestions"](
      baseInput({ questionCount: 2 }),
    )
    const extendedResult = await handlers["examination.generateQuestions"](
      baseInput({
        questionCount: 3,
        seedQuestions: seedResult.questions,
      }),
    )
    const lookup = await handlers["examination.lookupQuestions"](
      lookupInput(baseInput({ questionCount: 3 })),
    )

    assert.equal(archive.get(seedResult.key), undefined)
    assert.deepEqual(
      extendedResult.questions.map((question) => question.question),
      ["Q1?", "Q2?", "Q3?"],
    )
    assert.equal(lookup.availableSets.length, 1)
    assert.equal(lookup.availableSets[0]?.key.questionCount, 3)
  })

  it("warns once and clamps streamed over-quota questions before soft-stop archive", async () => {
    const input = baseInput({ questionCount: 1 })
    const handlers = createExaminationWorkflowHandlers({
      llm: blockingStreamLlm(replyJson(2)),
      archive: createInMemoryExaminationArchive(),
      tokenizer,
      fileSystem: stubFileSystem,
    })
    const warnings: string[] = []
    const partialCounts: number[] = []
    let resolveFirstPartial!: () => void
    const firstPartial = new Promise<void>((resolve) => {
      resolveFirstPartial = resolve
    })

    const generation = handlers["examination.generateQuestions"](input, {
      onOutput(output) {
        if (output.kind === "warn") warnings.push(output.message)
        if (output.kind === "partial-questions") {
          partialCounts.push(output.questions.length)
          resolveFirstPartial()
        }
      },
    })
    await firstPartial
    await handlers["examination.stopGeneration"]({
      generationControlId: input.generationControlId,
    })
    const result = await generation

    assert.equal(warnings.length, 1)
    assert.deepEqual(partialCounts, [1])
    assert.equal(result.questions.length, 1)
    assert.equal(result.archivedProvenance.questionCount, 1)
  })
})
