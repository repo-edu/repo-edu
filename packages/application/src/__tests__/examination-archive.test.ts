import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildExaminationExcerptsFingerprint,
  buildExaminationGenerationContextFingerprint,
  canonicalizeExaminationExcerpts,
  type ExaminationArchiveKey,
  normalizeExaminationRepositoryKey,
  serializeExaminationArchiveStorageKey,
} from "@repo-edu/application-contract"
import type {
  ExaminationArchiveStoragePort,
  ExaminationArchiveStoredEntry,
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
} from "@repo-edu/host-runtime-contract"
import {
  createExaminationArchive,
  createInMemoryExaminationArchive,
} from "../examination-workflows/archive-port.js"
import { createExaminationWorkflowHandlers } from "../examination-workflows/examination-workflows.js"

// ---------------------------------------------------------------------------
// Excerpt fingerprint stability
// ---------------------------------------------------------------------------

describe("examination archive fingerprint", () => {
  it("fingerprint is stable across excerpt permutations", () => {
    const a = {
      filePath: "src/a.ts",
      startLine: 10,
      lines: ["alpha", "beta"],
    }
    const b = {
      filePath: "src/b.ts",
      startLine: 5,
      lines: ["gamma"],
    }
    const c = {
      filePath: "src/a.ts",
      startLine: 40,
      lines: ["delta"],
    }

    const ordered = buildExaminationExcerptsFingerprint([a, c, b])
    const permuted = buildExaminationExcerptsFingerprint([b, a, c])
    const reversed = buildExaminationExcerptsFingerprint([c, b, a])

    assert.equal(ordered, permuted)
    assert.equal(ordered, reversed)
  })

  it("fingerprint changes when line content changes", () => {
    const base = buildExaminationExcerptsFingerprint([
      { filePath: "src/a.ts", startLine: 1, lines: ["alpha"] },
    ])
    const mutated = buildExaminationExcerptsFingerprint([
      { filePath: "src/a.ts", startLine: 1, lines: ["alpha2"] },
    ])
    assert.notEqual(base, mutated)
  })

  it("fingerprint changes when startLine changes", () => {
    const base = buildExaminationExcerptsFingerprint([
      { filePath: "src/a.ts", startLine: 1, lines: ["alpha"] },
    ])
    const shifted = buildExaminationExcerptsFingerprint([
      { filePath: "src/a.ts", startLine: 2, lines: ["alpha"] },
    ])
    assert.notEqual(base, shifted)
  })

  it("canonicalization sorts by filePath then startLine", () => {
    const canonical = canonicalizeExaminationExcerpts([
      { filePath: "src/b.ts", startLine: 1, lines: ["x"] },
      { filePath: "src/a.ts", startLine: 10, lines: ["y"] },
      { filePath: "src/a.ts", startLine: 2, lines: ["z"] },
    ])
    assert.deepEqual(
      canonical.map((e) => [e.filePath, e.startLine]),
      [
        ["src/a.ts", 2],
        ["src/a.ts", 10],
        ["src/b.ts", 1],
      ],
    )
  })
})

// ---------------------------------------------------------------------------
// Archive adapter bundle round-trip
// ---------------------------------------------------------------------------

describe("examination archive adapter", () => {
  const baseKey: ExaminationArchiveKey = {
    repositoryKey: normalizeExaminationRepositoryKey("/repos/alice"),
    personId: "p_1",
    commitOid: "oid-1",
    questionCount: 1,
    excerptsFingerprint: "fp-1",
    generationContextFingerprint: buildExaminationGenerationContextFingerprint({
      assignmentContext: "A1",
      model: "22",
      effort: "medium",
    }),
  }

  const baseRecord = {
    key: baseKey,
    questions: [
      {
        question: "Why did you write it this way?",
        answer: "Because of reasons.",
        filePath: "src/a.ts",
        lineRange: { start: 1, end: 3 },
      },
    ],
    provenance: {
      authorName: "Alice",
      authorEmail: "alice@example.com",
      rosterMemberId: "m_1",
      repositoryPath: "/repos/alice",
      assignmentContext: "A1",
      model: "22",
      effort: "medium" as const,
      questionCount: 1,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 50,
        reasoningOutputTokens: 0,
        wallMs: 500,
        authMode: "subscription" as const,
      },
      createdAtMs: 1_700_000_000_000,
      excerpts: [
        { filePath: "src/a.ts", startLine: 1, lines: ["alpha", "beta"] },
      ],
    },
  }

  function createStorageWithEntries(
    entries: readonly ExaminationArchiveStoredEntry[],
  ): ExaminationArchiveStoragePort {
    const byStorageKey = new Map(
      entries.map((entry) => [entry.storageKey, entry]),
    )
    return {
      get(storageKey) {
        return byStorageKey.get(storageKey)
      },
      put(entry) {
        byStorageKey.set(entry.storageKey, entry)
      },
      exportAll() {
        return [...byStorageKey.values()]
      },
      importAll(incoming) {
        for (const entry of incoming) {
          byStorageKey.set(entry.storageKey, entry)
        }
        return {
          totalInBundle: incoming.length,
          inserted: incoming.length,
          updated: 0,
          skipped: 0,
          rejected: 0,
          rejections: [],
        }
      },
    }
  }

  it("put/get preserves the typed record", () => {
    const archive = createInMemoryExaminationArchive()
    archive.put(baseRecord)

    const hit = archive.get(baseKey)
    assert.deepEqual(hit, baseRecord)
  })

  it("exportBundle → importBundle preserves records across a fresh store", () => {
    const source = createInMemoryExaminationArchive()
    source.put(baseRecord)

    const bundle = source.exportBundle()
    assert.equal(bundle.records.length, 1)

    const target = createInMemoryExaminationArchive()
    const summary = target.importBundle(bundle)

    assert.equal(summary.totalInBundle, 1)
    assert.equal(summary.inserted, 1)
    assert.equal(summary.updated, 0)
    assert.equal(summary.skipped, 0)
    assert.equal(summary.rejected, 0)

    assert.deepEqual(target.get(baseKey), baseRecord)
  })

  it("importBundle resolves conflicts by createdAtMs (newer wins)", () => {
    const target = createInMemoryExaminationArchive()
    target.put({
      ...baseRecord,
      provenance: { ...baseRecord.provenance, createdAtMs: 1_000 },
    })

    const newerBundle = {
      format: "repo-edu-examination-archive" as const,
      bundleVersion: 1 as const,
      exportedAt: "2026-04-24T00:00:00.000Z",
      records: [
        {
          ...baseRecord,
          questions: [
            {
              ...baseRecord.questions[0],
              question: "Newer question?",
            },
          ],
          provenance: { ...baseRecord.provenance, createdAtMs: 2_000 },
        },
      ],
    }

    const summary = target.importBundle(newerBundle)
    assert.equal(summary.updated, 1)
    assert.equal(target.get(baseKey)?.questions[0].question, "Newer question?")

    const olderBundle = {
      ...newerBundle,
      records: [
        {
          ...baseRecord,
          questions: [
            {
              ...baseRecord.questions[0],
              question: "Older question?",
            },
          ],
          provenance: { ...baseRecord.provenance, createdAtMs: 500 },
        },
      ],
    }
    const olderSummary = target.importBundle(olderBundle)
    assert.equal(olderSummary.skipped, 1)
    assert.equal(target.get(baseKey)?.questions[0].question, "Newer question?")
  })

  it("importBundle rejects bundles with wrong format or version", () => {
    const target = createInMemoryExaminationArchive()
    const summary = target.importBundle({
      format: "not-an-archive",
      bundleVersion: 1,
      records: [baseRecord],
    })
    assert.equal(summary.totalInBundle, 0)
    assert.equal(summary.inserted, 0)
    assert.equal(summary.updated, 0)
    assert.equal(summary.skipped, 0)
    assert.equal(summary.rejected, 1)
    assert.match(summary.rejections[0], /Bundle header/)
  })

  it("importBundle counts malformed records as rejected", () => {
    const target = createInMemoryExaminationArchive()
    const summary = target.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: 1,
      exportedAt: "x",
      records: [
        baseRecord,
        { key: baseKey, questions: "not-an-array", provenance: {} },
        {
          key: { ...baseKey, excerptsFingerprint: undefined },
          questions: [],
          provenance: {},
        },
      ],
    })
    assert.equal(summary.totalInBundle, 3)
    assert.equal(summary.inserted, 1)
    assert.equal(summary.rejected, 2)
    assert.equal(summary.rejections.length, 2)
    assert.match(summary.rejections[0], /record failed validation/)
    assert.match(summary.rejections[1], /missing or malformed key/)
  })

  it("rejects old group-set scoped bundle keys instead of migrating them", () => {
    const target = createInMemoryExaminationArchive()
    const summary = target.importBundle({
      format: "repo-edu-examination-archive",
      bundleVersion: 1,
      exportedAt: "x",
      records: [
        {
          ...baseRecord,
          key: {
            groupSetId: "gs_1",
            personId: "p_1",
            commitOid: "oid-1",
            questionCount: 1,
            excerptsFingerprint: "fp-1",
          },
        },
      ],
    })

    assert.equal(summary.totalInBundle, 1)
    assert.equal(summary.inserted, 0)
    assert.equal(summary.rejected, 1)
    assert.match(summary.rejections[0], /old group-set scoped/)
  })

  it("rejects stored payloads whose embedded key does not match the storage key", () => {
    const corruptStorage = createStorageWithEntries([
      {
        storageKey: serializeExaminationArchiveStorageKey(baseKey),
        createdAtMs: baseRecord.provenance.createdAtMs,
        payloadJson: JSON.stringify({
          ...baseRecord,
          key: { ...baseKey, personId: "different-person" },
        }),
      },
    ])
    const corruptArchive = createExaminationArchive(corruptStorage)

    assert.equal(corruptArchive.get(baseKey), undefined)
  })
})

// ---------------------------------------------------------------------------
// Workflow integration — archive hit/miss/regenerate/drift
// ---------------------------------------------------------------------------

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
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 5,
          reasoningOutputTokens: 0,
          wallMs: 50,
          authMode: "subscription",
        },
      }
    },
  }
  return port
}

function sampleLlmReply(questionCount: number): string {
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    question: `Q${i + 1}?`,
    answer: `A${i + 1}.`,
    filePath: "src/a.ts",
    lineRange: { start: 1, end: 2 },
  }))
  return JSON.stringify({ questions })
}

function baseInput() {
  return {
    personId: "p_1",
    rosterMemberId: "m_1",
    commitOid: "oid-abc",
    repositoryPath: "/repos/alice",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    excerpts: [
      { filePath: "src/a.ts", startLine: 1, lines: ["alpha", "beta"] },
    ],
    questionCount: 2,
    assignmentContext: "A1",
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

describe("examination.generateQuestions archive behavior", () => {
  it("calls the LLM on archive miss and persists the result", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    const result = await handlers["examination.generateQuestions"](baseInput())
    assert.equal(llm.calls, 1)
    assert.equal(result.fromArchive, false)
    assert.equal(result.provenanceDrift, null)
    assert.equal(result.questions.length, 2)
    assert.equal(result.archivedProvenance.authorName, "Alice")
    assert.equal(result.archivedProvenance.questionCount, 2)

    // Second call with identical inputs hits the archive.
    const second = await handlers["examination.generateQuestions"](baseInput())
    assert.equal(llm.calls, 1, "LLM should not be called again")
    assert.equal(second.fromArchive, true)
    assert.equal(second.provenanceDrift, null)
    assert.equal(second.questions.length, 2)
  })

  it("lookupQuestions returns archived questions without calling the LLM", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())
    const result = await handlers["examination.lookupQuestions"](baseInput())

    assert.equal(llm.calls, 1)
    assert.ok(result.exact, "lookup should find the generated archive record")
    assert.equal(result.exact.fromArchive, true)
    assert.equal(result.exact.provenanceDrift, null)
    assert.equal(result.exact.questions.length, 2)
    assert.equal(result.availableSets.length, 1)
  })

  it("lookupQuestions returns an empty result on archive miss without calling the LLM", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    const result = await handlers["examination.lookupQuestions"](baseInput())

    assert.equal(result.exact, null)
    assert.deepEqual(result.availableSets, [])
    assert.equal(llm.calls, 0)
  })

  it("lookupQuestions lists archived sets when the requested count differs", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())
    const result = await handlers["examination.lookupQuestions"]({
      ...baseInput(),
      questionCount: 4,
    })

    assert.equal(llm.calls, 1)
    assert.equal(result.exact, null)
    assert.equal(result.availableSets.length, 1)
    assert.equal(result.availableSets[0].archivedProvenance.questionCount, 2)
    assert.equal(result.availableSets[0].questions.length, 2)
  })

  it("lookupQuestions reports provenance drift on archive hits", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())
    const result = await handlers["examination.lookupQuestions"]({
      ...baseInput(),
      authorName: "Alice Renamed",
      authorEmail: "renamed@example.com",
    })

    assert.equal(llm.calls, 1)
    assert.ok(result.exact, "lookup should find the generated archive record")
    assert.equal(result.exact.fromArchive, true)
    assert.deepEqual(result.exact.provenanceDrift?.authorNameChanged, {
      from: "Alice",
      to: "Alice Renamed",
    })
    assert.deepEqual(result.exact.provenanceDrift?.authorEmailChanged, {
      from: "alice@example.com",
      to: "renamed@example.com",
    })
  })

  it("regenerate bypasses the archive and overwrites the stored record", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())
    const regenerated = await handlers["examination.generateQuestions"]({
      ...baseInput(),
      regenerate: true,
    })
    assert.equal(llm.calls, 2)
    assert.equal(regenerated.fromArchive, false)
    assert.equal(regenerated.provenanceDrift, null)
  })

  it("reports drift when provenance fields changed since the archived record", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())

    const result = await handlers["examination.generateQuestions"]({
      ...baseInput(),
      authorName: "Alice Renamed",
      authorEmail: "renamed@example.com",
    })
    assert.equal(llm.calls, 1)
    assert.equal(result.fromArchive, true)
    const drift = result.provenanceDrift
    assert.ok(drift, "drift should be populated")
    assert.deepEqual(drift?.authorNameChanged, {
      from: "Alice",
      to: "Alice Renamed",
    })
    assert.deepEqual(drift?.authorEmailChanged, {
      from: "alice@example.com",
      to: "renamed@example.com",
    })
  })

  it("returns null drift when provenance fields match", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())
    const second = await handlers["examination.generateQuestions"](baseInput())
    assert.equal(second.fromArchive, true)
    assert.equal(second.provenanceDrift, null)
  })

  it("treats permuted excerpts as the same archive key", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    const first = {
      ...baseInput(),
      excerpts: [
        { filePath: "src/b.ts", startLine: 1, lines: ["b1"] },
        { filePath: "src/a.ts", startLine: 10, lines: ["a10"] },
      ],
    }
    await handlers["examination.generateQuestions"](first)

    const permuted = {
      ...first,
      excerpts: [first.excerpts[1], first.excerpts[0]],
    }
    const second = await handlers["examination.generateQuestions"](permuted)
    assert.equal(llm.calls, 1, "permuted excerpts should hit the archive")
    assert.equal(second.fromArchive, true)
  })

  it("treats a different question count as a different archive key", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())

    const changedCount = await handlers["examination.generateQuestions"]({
      ...baseInput(),
      questionCount: 3,
    })

    assert.equal(llm.calls, 2)
    assert.equal(changedCount.fromArchive, false)
  })

  it("keeps same person and commit inputs distinct across repositories", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())
    const movedRepository = await handlers["examination.generateQuestions"]({
      ...baseInput(),
      repositoryPath: "/repos/other",
    })

    assert.equal(llm.calls, 2)
    assert.equal(movedRepository.fromArchive, false)
  })

  it("keys archive reuse by assignment context, model code, effort and prompt version", async () => {
    const baseFingerprint = buildExaminationGenerationContextFingerprint({
      assignmentContext: "A1",
      model: "22",
      effort: "medium",
      promptTemplateVersion: 1,
    })
    assert.notEqual(
      baseFingerprint,
      buildExaminationGenerationContextFingerprint({
        assignmentContext: "A2",
        model: "22",
        effort: "medium",
        promptTemplateVersion: 1,
      }),
    )
    assert.notEqual(
      baseFingerprint,
      buildExaminationGenerationContextFingerprint({
        assignmentContext: "A1",
        model: "33",
        effort: "medium",
        promptTemplateVersion: 1,
      }),
    )
    assert.notEqual(
      baseFingerprint,
      buildExaminationGenerationContextFingerprint({
        assignmentContext: "A1",
        model: "22",
        effort: "high",
        promptTemplateVersion: 1,
      }),
    )
    assert.notEqual(
      baseFingerprint,
      buildExaminationGenerationContextFingerprint({
        assignmentContext: "A1",
        model: "22",
        effort: "medium",
        promptTemplateVersion: 2,
      }),
    )
  })

  it("misses the archive when assignment context or selected model changes", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"](baseInput())
    const changedAssignment = await handlers["examination.generateQuestions"]({
      ...baseInput(),
      assignmentContext: "A1 updated",
    })
    const changedModel = await handlers["examination.generateQuestions"]({
      ...baseInput(),
      llmSettings: {
        ...baseInput().llmSettings,
        examinationModelsByProvider: { claude: "33" },
      },
    })

    assert.equal(llm.calls, 3)
    assert.equal(changedAssignment.fromArchive, false)
    assert.equal(changedModel.fromArchive, false)
  })

  it("rejects input missing required identity fields", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await assert.rejects(
      () =>
        handlers["examination.generateQuestions"]({
          ...baseInput(),
          authorName: "",
        }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        (error as { type?: unknown }).type === "validation" &&
        typeof (error as { message?: unknown }).message === "string" &&
        /Examination input is invalid/.test(
          (error as { message: string }).message,
        ),
    )
    assert.equal(llm.calls, 0)
  })

  it("rejects empty rosterMemberId while accepting null", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await handlers["examination.generateQuestions"]({
      ...baseInput(),
      rosterMemberId: null,
    })

    await assert.rejects(() =>
      handlers["examination.generateQuestions"]({
        ...baseInput(),
        rosterMemberId: "",
      }),
    )
  })
})
