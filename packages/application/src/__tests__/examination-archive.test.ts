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

function createRecordingLlm(
  replyOrReplies: string | readonly string[],
): LlmPort & { calls: number; requests: LlmRunRequest[] } {
  const replies =
    typeof replyOrReplies === "string" ? [replyOrReplies] : replyOrReplies
  const state = { calls: 0, requests: [] as LlmRunRequest[] }
  const port: LlmPort & { calls: number; requests: LlmRunRequest[] } = {
    get calls() {
      return state.calls
    },
    get requests() {
      return state.requests
    },
    async run(_request: LlmRunRequest): Promise<LlmRunResult> {
      const reply =
        replies[Math.min(state.calls, replies.length - 1)] ?? replies[0] ?? ""
      state.calls += 1
      state.requests.push(_request)
      return {
        reply,
        usage: baseRecord.provenance.usage,
      }
    },
  }
  return port
}

function sampleLlmReply(questionCount: number, sourceId = "E1"): string {
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    question: `Q${i + 1}?`,
    answer: `A${i + 1}.`,
    anchor: { sourceId, lineRange: { start: 1, end: 2 } },
  }))
  return JSON.stringify({ questions })
}

function sampleLlmReplyWithAnchors(
  anchors: {
    sourceId: string | null
    lineRange: { start: number; end: number } | null
  }[],
): string {
  return JSON.stringify({
    questions: anchors.map((anchor, index) => ({
      question: `Q${index + 1}?`,
      answer: `A${index + 1}.`,
      anchor,
    })),
  })
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

function inputWithPathMappedContent(mapping: Record<string, string>) {
  return {
    ...baseInput(),
    excerpts: Object.entries(mapping).map(([filePath, content]) => ({
      filePath,
      startLine: 1,
      lines: [content],
    })),
    excerptFileSources: mapping,
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

    const inconsistentCountSummary = archive.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: EXAMINATION_ARCHIVE_BUNDLE_VERSION,
      exportedAt: "2026-05-25T00:00:00.000Z",
      records: [
        {
          ...baseRecord,
          provenance: {
            ...baseRecord.provenance,
            questionCount: baseRecord.provenance.questionCount + 1,
          },
        },
      ],
    })
    assert.equal(inconsistentCountSummary.rejected, 1)

    const leadingZeroSourceIdSummary = archive.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: EXAMINATION_ARCHIVE_BUNDLE_VERSION,
      exportedAt: "2026-05-25T00:00:00.000Z",
      records: [
        {
          ...baseRecord,
          questions: [
            {
              ...baseRecord.questions[0],
              anchor: { sourceId: "E01", lineRange: { start: 1, end: 2 } },
            },
          ],
        },
      ],
    })
    assert.equal(leadingZeroSourceIdSummary.rejected, 1)

    const leadingZeroSrcAttemptSummary = archive.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: EXAMINATION_ARCHIVE_BUNDLE_VERSION,
      exportedAt: "2026-05-25T00:00:00.000Z",
      records: [
        {
          ...baseRecord,
          questions: [
            {
              ...baseRecord.questions[0],
              anchor: { sourceId: "SRC07_03", lineRange: { start: 1, end: 2 } },
            },
          ],
        },
      ],
    })
    assert.equal(leadingZeroSrcAttemptSummary.rejected, 1)

    const mismatchedGenerationContextSummary = archive.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: EXAMINATION_ARCHIVE_BUNDLE_VERSION,
      exportedAt: "2026-05-25T00:00:00.000Z",
      records: [
        {
          ...baseRecord,
          provenance: {
            ...baseRecord.provenance,
            model: "33",
          },
        },
      ],
    })
    assert.equal(mismatchedGenerationContextSummary.rejected, 1)
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

  it("aligns cache identity with canonical provider prompt excerpts", async () => {
    const firstLlm = createRecordingLlm(sampleLlmReply(2))
    const firstHandlers = createExaminationWorkflowHandlers({
      llm: firstLlm,
      archive: createInMemoryExaminationArchive(),
      tokenizer,
    })
    const secondLlm = createRecordingLlm(sampleLlmReply(2))
    const secondHandlers = createExaminationWorkflowHandlers({
      llm: secondLlm,
      archive: createInMemoryExaminationArchive(),
      tokenizer,
    })

    const first = await firstHandlers["examination.generateQuestions"](
      inputWithPathMappedContent({
        "a.unknown": "beta()",
        "z.unknown": "alpha()",
      }),
    )
    const second = await secondHandlers["examination.generateQuestions"](
      inputWithPathMappedContent({
        "a.unknown": "alpha()",
        "z.unknown": "beta()",
      }),
    )

    assert.equal(
      first.key.providerPayloadFingerprint,
      second.key.providerPayloadFingerprint,
    )
    assert.equal(firstLlm.requests[0]?.prompt, secondLlm.requests[0]?.prompt)
    assert.match(firstLlm.requests[0]?.prompt ?? "", /Excerpt 1 \(E1/)
    assert.match(firstLlm.requests[0]?.prompt ?? "", /Excerpt 2 \(E2/)
  })

  it("deduplicates identical provider excerpts before prompting", async () => {
    const llm = createRecordingLlm(sampleLlmReply(1))
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive: createInMemoryExaminationArchive(),
      tokenizer,
    })

    await handlers["examination.generateQuestions"]({
      ...inputWithPathMappedContent({
        "a.unknown": "same()",
        "z.unknown": "same()",
      }),
      questionCount: 1,
    })

    const prompt = llm.requests[0]?.prompt ?? ""
    assert.equal(prompt.match(/^Excerpt /gm)?.length, 1)
  })

  it("uses source ids that do not collide with local identifiers", async () => {
    const llm = createRecordingLlm(sampleLlmReply(1))
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive: createInMemoryExaminationArchive(),
      tokenizer,
    })

    await handlers["examination.generateQuestions"]({
      ...baseInput(),
      localIdentityContext: {
        names: [],
        emails: [],
        opaqueIdentifiers: [],
        gitUsernames: ["e1"],
      },
      excerpts: [
        {
          filePath: "src/a.unknown",
          startLine: 1,
          lines: ["const e1 = 1"],
        },
      ],
      excerptFileSources: { "src/a.unknown": "const e1 = 1" },
      questionCount: 1,
    })

    const prompt = llm.requests[0]?.prompt ?? ""
    assert.match(prompt, /Excerpt 1 \(SRC1/)
    assert.doesNotMatch(prompt, /\bE1\b/)
    assert.doesNotMatch(prompt, /\be1\b/)
  })

  it("misses the archive when source id assignment changes", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm([
      sampleLlmReply(1, "SRC1"),
      sampleLlmReply(1, "E1"),
    ])
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
    })
    const input = {
      ...baseInput(),
      excerpts: [
        {
          filePath: "src/a.unknown",
          startLine: 1,
          lines: ["const value = 1"],
        },
      ],
      excerptFileSources: { "src/a.unknown": "const value = 1" },
      questionCount: 1,
    }

    const first = await handlers["examination.generateQuestions"]({
      ...input,
      localIdentityContext: {
        names: [],
        emails: [],
        opaqueIdentifiers: [],
        gitUsernames: ["e1"],
      },
    })
    const second = await handlers["examination.generateQuestions"]({
      ...input,
      localIdentityContext: {
        names: [],
        emails: [],
        opaqueIdentifiers: [],
        gitUsernames: [],
      },
    })

    assert.equal(llm.calls, 2)
    assert.notEqual(
      first.key.providerPayloadFingerprint,
      second.key.providerPayloadFingerprint,
    )
    assert.equal(first.questions[0]?.anchor.sourceId, "SRC1")
    assert.equal(second.questions[0]?.anchor.sourceId, "E1")
  })

  it("stores partial provider output under the accepted question count", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(1))
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
    })
    const warnings: string[] = []

    const result = await handlers["examination.generateQuestions"](
      baseInput(),
      {
        onOutput(output) {
          if (output.channel === "warn") warnings.push(output.message)
        },
      },
    )
    const lookup = await handlers["examination.lookupQuestions"](baseInput())

    assert.equal(result.questions.length, 1)
    assert.equal(result.requestedQuestionCount, 2)
    assert.equal(result.key.questionCount, 1)
    assert.equal(result.archivedProvenance.questionCount, 1)
    assert.match(warnings[0] ?? "", /Provider returned 1 of 2 requested/)
    assert.equal(lookup.exact, null)
    assert.equal(lookup.availableSets[0]?.key.questionCount, 1)
  })

  it("warns when provider output has extra questions", async () => {
    const llm = createRecordingLlm(sampleLlmReply(3))
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive: createInMemoryExaminationArchive(),
      tokenizer,
    })
    const warnings: string[] = []

    const result = await handlers["examination.generateQuestions"](
      baseInput(),
      {
        onOutput(output) {
          if (output.channel === "warn") warnings.push(output.message)
        },
      },
    )

    assert.equal(result.questions.length, 2)
    assert.match(warnings[0] ?? "", /Provider returned 3 of 2 requested/)
  })

  it("drops anchor line ranges outside the prompted excerpt", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(
      sampleLlmReplyWithAnchors([
        { sourceId: "E1", lineRange: { start: 1, end: 2 } },
        { sourceId: "E1", lineRange: { start: 10, end: 11 } },
        { sourceId: "E1", lineRange: { start: 10, end: 12 } },
      ]),
    )
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
    })
    const input = {
      ...baseInput(),
      excerpts: [
        {
          filePath: "src/a.unknown",
          startLine: 10,
          lines: ["alpha", "beta"],
        },
      ],
      excerptFileSources: { "src/a.unknown": "alpha\nbeta" },
      questionCount: 3,
    }

    const result = await handlers["examination.generateQuestions"](input)

    assert.deepEqual(
      result.questions.map((question) => question.anchor),
      [
        { sourceId: "E1", lineRange: null },
        { sourceId: "E1", lineRange: { start: 10, end: 11 } },
        { sourceId: "E1", lineRange: null },
      ],
    )
  })

  it("normalizes stale archived anchor line ranges before returning them", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
    })
    const input = baseInput()
    const generated = await handlers["examination.generateQuestions"](input)
    archive.put({
      key: generated.key,
      provenance: generated.archivedProvenance,
      questions: generated.questions.map((question, index) => ({
        ...question,
        anchor:
          index === 0
            ? { sourceId: "E1", lineRange: { start: 99, end: 100 } }
            : question.anchor,
      })),
    })

    const cached = await handlers["examination.generateQuestions"](input)

    assert.equal(cached.fromArchive, true)
    assert.deepEqual(cached.questions[0]?.anchor, {
      sourceId: "E1",
      lineRange: null,
    })
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
