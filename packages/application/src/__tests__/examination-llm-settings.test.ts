import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  ExaminationGenerateQuestionsInput,
  ExaminationLlmSettings,
} from "@repo-edu/application-contract"
import type {
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
} from "@repo-edu/host-runtime-contract"
import { createInMemoryExaminationArchive } from "../examination-workflows/archive-port.js"
import { createExaminationWorkflowHandlers } from "../examination-workflows/examination-workflows.js"

function recordingLlm(reply: string) {
  const requests: LlmRunRequest[] = []
  const port: LlmPort = {
    async run(request: LlmRunRequest): Promise<LlmRunResult> {
      requests.push(request)
      return {
        reply,
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 5,
          reasoningOutputTokens: 0,
          wallMs: 5,
          authMode: "subscription",
        },
      }
    },
  }
  return { port, requests }
}

const sampleReply = JSON.stringify({
  questions: [
    { question: "Q1?", answer: "A1.", filePath: "src/a.ts", lineRange: null },
  ],
})

function baseInput(
  llmSettings: ExaminationLlmSettings,
): ExaminationGenerateQuestionsInput {
  return {
    groupSetId: "gs_1",
    personId: "p_1",
    memberId: "m_1",
    commitOid: "oid-abc",
    repoGitDir: "/repos/alice",
    memberName: "Alice",
    memberEmail: "alice@example.com",
    excerpts: [{ filePath: "src/a.ts", startLine: 1, lines: ["line"] }],
    questionCount: 1,
    llmSettings,
  }
}

describe("examination workflow — LLM settings resolution", () => {
  it("rejects when no LLM connection is configured", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({ llm: port, archive })

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
    const handlers = createExaminationWorkflowHandlers({ llm: port, archive })

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
    const handlers = createExaminationWorkflowHandlers({ llm: port, archive })

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
    const handlers = createExaminationWorkflowHandlers({ llm: port, archive })

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
            examinationModelsByProvider: { claude: "c22" },
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

  it("computes modelChanged drift when the active code differs from the archived code", async () => {
    const archive = createInMemoryExaminationArchive()
    const { port } = recordingLlm(sampleReply)
    const handlers = createExaminationWorkflowHandlers({ llm: port, archive })

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

    assert.equal(second.fromArchive, true)
    assert.deepStrictEqual(second.provenanceDrift?.modelChanged, {
      from: "22",
      to: "33",
    })
    assert.deepStrictEqual(second.provenanceDrift?.effortChanged, {
      from: "medium",
      to: "high",
    })
  })
})
