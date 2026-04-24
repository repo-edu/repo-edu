import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
} from "@repo-edu/host-runtime-contract"
import {
  buildExaminationExcerptsFingerprint,
  canonicalizeExaminationExcerpts,
} from "../examination-workflows/archive-key.js"
import { createInMemoryExaminationArchive } from "../examination-workflows/archive-port.js"
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
  const baseKey = {
    groupSetId: "gs_1",
    memberId: "m_1",
    commitOid: "oid-1",
    questionCount: 1,
    excerptsFingerprint: "fp-1",
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
      memberName: "Alice",
      memberEmail: "alice@example.com",
      repoGitDir: "/repos/alice",
      assignmentContext: "A1",
      model: "claude-sonnet-4-6",
      effort: "medium",
      questionCount: 1,
      usage: { inputTokens: 100, outputTokens: 50, wallMs: 500 },
      createdAtMs: 1_700_000_000_000,
      excerpts: [
        { filePath: "src/a.ts", startLine: 1, lines: ["alpha", "beta"] },
      ],
    },
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
    assert.deepEqual(summary, {
      totalInBundle: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      rejected: 0,
      rejections: [],
    })
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
        { key: { groupSetId: "x" }, questions: [], provenance: {} },
      ],
    })
    assert.equal(summary.totalInBundle, 3)
    assert.equal(summary.inserted, 1)
    assert.equal(summary.rejected, 2)
    assert.equal(summary.rejections.length, 2)
    assert.match(summary.rejections[0], /record failed validation/)
    assert.match(summary.rejections[1], /missing or malformed key/)
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
        usage: { inputTokens: 10, outputTokens: 5, wallMs: 50 },
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
    groupSetId: "gs_1",
    memberId: "m_1",
    commitOid: "oid-abc",
    repoGitDir: "/repos/alice",
    memberName: "Alice",
    memberEmail: "alice@example.com",
    excerpts: [
      { filePath: "src/a.ts", startLine: 1, lines: ["alpha", "beta"] },
    ],
    questionCount: 2,
    assignmentContext: "A1",
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
    assert.equal(result.archivedProvenance.memberName, "Alice")
    assert.equal(result.archivedProvenance.questionCount, 2)

    // Second call with identical inputs hits the archive.
    const second = await handlers["examination.generateQuestions"](baseInput())
    assert.equal(llm.calls, 1, "LLM should not be called again")
    assert.equal(second.fromArchive, true)
    assert.equal(second.provenanceDrift, null)
    assert.equal(second.questions.length, 2)
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
      memberName: "Alice Renamed",
      memberEmail: "renamed@example.com",
      repoGitDir: "/repos/alice-moved",
      assignmentContext: "A1 (updated)",
    })
    assert.equal(llm.calls, 1)
    assert.equal(result.fromArchive, true)
    const drift = result.provenanceDrift
    assert.ok(drift, "drift should be populated")
    assert.deepEqual(drift?.memberNameChanged, {
      from: "Alice",
      to: "Alice Renamed",
    })
    assert.deepEqual(drift?.memberEmailChanged, {
      from: "alice@example.com",
      to: "renamed@example.com",
    })
    assert.deepEqual(drift?.repoGitDirChanged, {
      from: "/repos/alice",
      to: "/repos/alice-moved",
    })
    assert.deepEqual(drift?.assignmentContextChanged, {
      from: "A1",
      to: "A1 (updated)",
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

  it("rejects input missing required identity fields", async () => {
    const archive = createInMemoryExaminationArchive()
    const llm = createRecordingLlm(sampleLlmReply(2))
    const handlers = createExaminationWorkflowHandlers({ llm, archive })

    await assert.rejects(
      () =>
        handlers["examination.generateQuestions"]({
          ...baseInput(),
          groupSetId: "",
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
})
