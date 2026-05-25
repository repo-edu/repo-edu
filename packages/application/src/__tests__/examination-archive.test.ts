import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildExaminationGenerationContextFingerprint,
  EXAMINATION_ARCHIVE_BUNDLE_VERSION,
  EXAMINATION_PROMPT_TEMPLATE_VERSION,
  EXAMINATION_REDACTION_POLICY_VERSION,
  type ExaminationArchiveKey,
  type ExaminationArchiveRecord,
} from "@repo-edu/application-contract"
import type {
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
  TokenizerPort,
} from "@repo-edu/host-runtime-contract"
import { createInMemoryExaminationArchive } from "../examination-workflows/archive-port.js"
import { createExaminationWorkflowHandlers } from "../examination-workflows/examination-workflows.js"

const contentScopeId = "a".repeat(40)

const tokenizer: TokenizerPort = {
  async loadTokenizerLanguage() {
    throw new Error("Tokenizer not available in this test.")
  },
}

const baseKey: ExaminationArchiveKey = {
  personId: "p_1",
  contentScopeId,
  questionCount: 1,
  providerPayloadFingerprint: "payload-1",
  generationContextFingerprint: buildExaminationGenerationContextFingerprint({
    model: "22",
    effort: "medium",
  }),
}

const baseRecord: ExaminationArchiveRecord = {
  key: baseKey,
  questions: [
    {
      question: "Why is this branch needed?",
      answer: "It handles the empty input case.",
      anchor: { sourceId: "E1", lineRange: { start: 1, end: 2 } },
    },
  ],
  provenance: {
    model: "22",
    effort: "medium",
    questionCount: 1,
    usage: {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningOutputTokens: 0,
      wallMs: 500,
      authMode: "subscription",
    },
    createdAtMs: 1_700_000_000_000,
    redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
    promptTemplateVersion: EXAMINATION_PROMPT_TEMPLATE_VERSION,
  },
}

function createRecordingLlm(reply: string): LlmPort & { calls: number } {
  const state = { calls: 0 }
  const port: LlmPort & { calls: number } = {
    get calls() {
      return state.calls
    },
    async run(_request: LlmRunRequest): Promise<LlmRunResult> {
      state.calls += 1
      return {
        reply,
        usage: baseRecord.provenance.usage,
      }
    },
  }
  return port
}

function sampleLlmReply(questionCount: number): string {
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    question: `Q${i + 1}?`,
    answer: `A${i + 1}.`,
    anchor: { sourceId: "E1", lineRange: { start: 1, end: 2 } },
  }))
  return JSON.stringify({ questions })
}

function baseInput() {
  return {
    personId: "p_1",
    contentScopeId,
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
    llmSettings: {
      llmConnections: [
        {
          id: "llm-1",
          name: "Test Claude",
          provider: "claude" as const,
          authMode: "subscription" as const,
          apiKey: "" as const,
        },
      ],
      activeLlmConnectionId: "llm-1",
      examinationModelsByProvider: { claude: "22" },
    },
  }
}

describe("examination archive adapter", () => {
  it("put/get preserves v2 pathless records", () => {
    const archive = createInMemoryExaminationArchive()
    archive.put(baseRecord)

    const hit = archive.get(baseKey)
    assert.deepEqual(hit, baseRecord)
    assert.equal("repositoryKey" in baseRecord.key, false)
    assert.equal("authorName" in baseRecord.provenance, false)
  })

  it("exports and imports only current bundle version records", () => {
    const source = createInMemoryExaminationArchive()
    source.put(baseRecord)
    const bundle = source.exportBundle()

    assert.equal(bundle.bundleVersion, EXAMINATION_ARCHIVE_BUNDLE_VERSION)
    assert.equal(JSON.stringify(bundle).includes("ada@example.test"), false)
    assert.equal(JSON.stringify(bundle).includes("/repos/"), false)

    const target = createInMemoryExaminationArchive()
    const summary = target.importBundle(bundle)
    assert.equal(summary.inserted, 1)
    assert.deepEqual(target.get(baseKey), baseRecord)
  })

  it("rejects old bundle versions and email-shaped archived output", () => {
    const archive = createInMemoryExaminationArchive()
    const oldSummary = archive.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: 1,
      records: [baseRecord],
    })
    assert.equal(oldSummary.rejected, 1)

    const emailSummary = archive.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: EXAMINATION_ARCHIVE_BUNDLE_VERSION,
      exportedAt: "2026-05-25T00:00:00.000Z",
      records: [
        {
          ...baseRecord,
          questions: [
            {
              ...baseRecord.questions[0],
              answer: "Contact leaked@example.test.",
            },
          ],
        },
      ],
    })
    assert.equal(emailSummary.rejected, 1)
  })
})

describe("examination.generateQuestions archive behavior", () => {
  it("persists clean output and returns cache hits with source references", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
    })

    const first = await handlers["examination.generateQuestions"](baseInput())
    const second = await handlers["examination.generateQuestions"](baseInput())

    assert.equal(llm.calls, 1)
    assert.equal(first.fromArchive, false)
    assert.equal(second.fromArchive, true)
    assert.equal(second.sourceReferences[0]?.sourceId, "E1")
    assert.equal(
      second.sourceReferences[0]?.occurrences[0]?.filePath,
      "src/a.unknown",
    )
  })

  it("filters cache candidates that now echo a known identifier", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
    })

    await handlers["examination.generateQuestions"](baseInput())
    const staleLookup = await handlers["examination.lookupQuestions"]({
      ...baseInput(),
      localIdentityContext: {
        ...baseInput().localIdentityContext,
        opaqueIdentifiers: ["A1"],
      },
    })

    assert.equal(staleLookup.exact, null)
    assert.equal(staleLookup.availableSets.length, 0)
  })

  it("blocks provider output containing emails or known identifiers", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(
      JSON.stringify({
        questions: [
          {
            question: "Why?",
            answer: "Ask ada@example.test.",
            anchor: { sourceId: "E1", lineRange: null },
          },
        ],
      }),
    )
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
    })

    await assert.rejects(
      () => handlers["examination.generateQuestions"](baseInput()),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "validation",
    )
  })
})
