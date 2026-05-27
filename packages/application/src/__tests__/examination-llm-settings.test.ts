import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  ExaminationGenerateQuestionsInput,
  ExaminationLlmSettings,
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
import { createInMemoryExaminationArchive } from "../examination-workflows/archive-port.js"
import { createExaminationWorkflowHandlers } from "../examination-workflows/examination-workflows.js"

function recordingLlm(reply: string) {
  const requests: LlmRunRequest[] = []
  const usage = {
    inputTokens: 10,
    cachedInputTokens: 0,
    outputTokens: 5,
    reasoningOutputTokens: 0,
    wallMs: 5,
    authMode: "subscription" as const,
  }
  const port: LlmPort = {
    async run(request: LlmRunRequest): Promise<LlmRunResult> {
      requests.push(request)
      return {
        reply,
        usage,
      }
    },
    async *stream(request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
      requests.push(request)
      yield { kind: "text-delta", text: reply }
      yield { kind: "done", usage }
    },
  }
  return { port, requests }
}

const sampleReply = JSON.stringify({
  questions: [
    {
      question: "Q1?",
      answer: "A1.",
      anchor: { sourceId: "E1", lineRange: null },
    },
  ],
})

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

function baseInput(
  llmSettings: ExaminationLlmSettings,
): ExaminationGenerateQuestionsInput {
  return {
    personId: "p_1",
    contentScopeId: "a".repeat(40),
    localIdentityContext: {
      names: [],
      emails: [],
      opaqueIdentifiers: [],
      gitUsernames: [],
    },
    excerpts: [{ filePath: "src/a.unknown", startLine: 1, lines: ["line"] }],
    excerptFileSources: { "src/a.unknown": "line" },
    questionCount: 1,
    generationControlId: "test-generation",
    llmSettings,
  }
}

function baseLookupInput(
  llmSettings: ExaminationLlmSettings,
): ExaminationLookupQuestionsInput {
  const input = baseInput(llmSettings)
  return {
    personId: input.personId,
    contentScopeId: input.contentScopeId,
    localIdentityContext: input.localIdentityContext,
    excerpts: input.excerpts,
    excerptFileSources: input.excerptFileSources,
    questionCount: input.questionCount,
    llmSettings: input.llmSettings,
  }
}

describe("examination workflow — LLM settings resolution", () => {
  it("rejects when no LLM connection is configured", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({
      llm: port,
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    await assert.rejects(
      () =>
        handlers["examination.generateQuestions"](
          baseInput({
            llmConnections: [],
            activeLlmConnectionId: null,
            examinationModelsByProvider: {},
          }),
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "validation",
    )
  })

  it("uses the per-provider default when settings entry is missing", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port, requests } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({
      llm: port,
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["examination.generateQuestions"](
      baseInput({
        llmConnections: [
          {
            id: "claude-1",
            name: "Claude",
            provider: "claude",
            authMode: "subscription",
            apiKey: "",
          },
        ],
        activeLlmConnectionId: "claude-1",
        examinationModelsByProvider: {},
      }),
    )

    assert.equal(requests[0]?.spec.provider, "claude")
    // Claude examination default (sonnet, medium) → catalog code "22"
    assert.equal(result.archivedProvenance.model, "22")
  })

  it("uses the explicit model code when set for the active provider", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port, requests } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({
      llm: port,
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["examination.generateQuestions"](
      baseInput({
        llmConnections: [
          {
            id: "claude-1",
            name: "Claude",
            provider: "claude",
            authMode: "subscription",
            apiKey: "",
          },
        ],
        activeLlmConnectionId: "claude-1",
        examinationModelsByProvider: { claude: "33" },
      }),
    )

    assert.equal(requests[0]?.spec.modelId, "claude-opus-4-7")
    assert.equal(requests[0]?.spec.effort, "high")
    assert.equal(result.archivedProvenance.model, "33")
  })

  it("rejects when the explicit model code targets a different provider", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({
      llm: port,
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    await assert.rejects(
      () =>
        handlers["examination.generateQuestions"](
          baseInput({
            llmConnections: [
              {
                id: "claude-1",
                name: "Claude",
                provider: "claude",
                authMode: "subscription",
                apiKey: "",
              },
            ],
            activeLlmConnectionId: "claude-1",
            examinationModelsByProvider: { claude: "c542" },
          }),
        ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "validation" &&
        /does not match the active LLM connection/.test(
          (error as { message: string }).message,
        ),
    )
  })

  it("misses the archive when the active model code or effort differs", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({
      llm: port,
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    const baseSettings: ExaminationLlmSettings = {
      llmConnections: [
        {
          id: "claude-1",
          name: "Claude",
          provider: "claude",
          authMode: "subscription",
          apiKey: "",
        },
      ],
      activeLlmConnectionId: "claude-1",
      examinationModelsByProvider: { claude: "22" },
    }

    await handlers["examination.generateQuestions"](baseInput(baseSettings))
    const second = await handlers["examination.generateQuestions"](
      baseInput({
        ...baseSettings,
        examinationModelsByProvider: { claude: "33" },
      }),
    )

    assert.equal(second.fromArchive, false)
  })

  it("lists archived sets for the same excerpts when the active model differs", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({
      llm: port,
      archive,
      tokenizer,
      fileSystem: stubFileSystem,
    })

    const baseSettings: ExaminationLlmSettings = {
      llmConnections: [
        {
          id: "claude-1",
          name: "Claude",
          provider: "claude",
          authMode: "subscription",
          apiKey: "",
        },
      ],
      activeLlmConnectionId: "claude-1",
      examinationModelsByProvider: { claude: "22" },
    }

    await handlers["examination.generateQuestions"](baseInput(baseSettings))
    const lookup = await handlers["examination.lookupQuestions"](
      baseLookupInput({
        ...baseSettings,
        examinationModelsByProvider: { claude: "33" },
      }),
    )

    assert.equal(lookup.exact, null)
    assert.equal(lookup.availableSets.length, 1)
    assert.equal(lookup.availableSets[0]?.archivedProvenance.model, "22")
  })
})
