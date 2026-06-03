import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { serializeExaminationArchiveStorageKey } from "@repo-edu/application-contract"
import {
  analysisSourceKeyScopeId,
  buildArchiveKeyIdentityKey,
  buildSourceSessionKey,
  type SourceIdentity,
} from "../components/tabs/examination/source.js"
import type { AnalysisSourceKey } from "../session/session-reducer.js"
import { examinationRequestSidecar } from "../stores/examination-request-sidecar.js"
import { useExaminationStore } from "../stores/examination-store.js"
import type {
  AvailableArchiveEntry,
  ExaminationEntry,
} from "../stores/examination-store-types.js"

const repositoryCommitOid = "a".repeat(40)

const identity: SourceIdentity = {
  kind: "repository-analysis",
  repoPath: "/repo",
  commitOid: repositoryCommitOid,
  subjectId: "p_1",
  excerptScopeId: "scope-1",
  redactionIdentityScopeId: "redaction-1",
  questionCount: 4,
  model: "22",
  effort: "medium",
}

const submissionIdentity = {
  kind: "submission",
  folderPath: "/submission",
  contentScopeId: "submission-scope",
  subjectId: "submission",
  excerptScopeId: "submission-scope",
  redactionIdentityScopeId: "redaction-1",
  questionCount: 4,
  model: "22",
  effort: "medium",
} satisfies SourceIdentity

const sourceSessionKey = buildSourceSessionKey(identity)

beforeEach(() => {
  useExaminationStore.getState().reset()
})

function entry(status: ExaminationEntry["status"]): ExaminationEntry {
  return {
    status,
    questions: [],
    usage: null,
    errorMessage: null,
    generatedAt: null,
    fromArchive: false,
    sourceReferences: [],
    archivedQuestionCount: status === "loaded" ? 1 : null,
    archivedModel: null,
    archivedEffort: null,
    partialQuestionCount:
      status === "loading" ? { requested: 2, accepted: 0 } : null,
    generationProgressLabel: null,
    streamedResponseCharacterCount: 0,
    streamedResponsePreview: "",
    inProgressQuestion: null,
    generationControlId: status === "loading" ? "control-1" : null,
    stopRequested: false,
  }
}

function loadedEntry(
  questionCount: number,
  generatedAt: string,
): ExaminationEntry {
  return {
    ...entry("loaded"),
    questions: Array.from({ length: questionCount }, (_, index) => ({
      question: `Q${index + 1}?`,
      answer: `A${index + 1}.`,
      anchor: { sourceId: "E1", lineRange: { start: 1, end: 2 } },
    })),
    generatedAt,
    archivedQuestionCount: questionCount,
    archivedModel: identity.model,
    archivedEffort: identity.effort,
  }
}

function availableArchiveEntry(
  key: string,
  questionCount: number,
  generatedAt: string,
): AvailableArchiveEntry {
  return {
    key,
    questionCount,
    model: identity.model,
    effort: identity.effort,
    entry: loadedEntry(questionCount, generatedAt),
  }
}

function archiveStorageKey(
  questionCount: number,
  generationContextFingerprint = "generation-context-a",
): string {
  return serializeExaminationArchiveStorageKey({
    personId: identity.subjectId,
    contentScopeId: repositoryCommitOid,
    questionCount,
    providerPayloadFingerprint: "provider-payload-a",
    generationContextFingerprint,
  })
}

describe("examination store", () => {
  it("replaces partial questions and source references on loading entries", () => {
    const store = useExaminationStore.getState()
    store.setEntry("entry", entry("loading"))

    store.applyPartialQuestions("entry", {
      questions: [
        {
          question: "Q1?",
          answer: "A1.",
          anchor: { sourceId: "E1", lineRange: { start: 1, end: 2 } },
        },
      ],
      sourceReferences: [
        {
          sourceId: "E1",
          occurrences: [
            { filePath: "src/a.ts", lineRange: { start: 1, end: 2 } },
          ],
        },
      ],
      inProgressQuestion: { question: "Q2 in progress", answer: "" },
    })

    const updated = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(updated?.status, "loading")
    assert.equal(updated.questions.length, 1)
    assert.equal(
      updated.sourceReferences[0]?.occurrences[0]?.filePath,
      "src/a.ts",
    )
    assert.equal(updated.inProgressQuestion?.question, "Q2 in progress")
    assert.equal(updated.partialQuestionCount?.accepted, 1)
  })

  it("ignores partial question updates for loaded entries", () => {
    const store = useExaminationStore.getState()
    store.setEntry("entry", entry("loaded"))

    store.applyPartialQuestions("entry", {
      questions: [
        {
          question: "Q1?",
          answer: "A1.",
          anchor: { sourceId: null, lineRange: null },
        },
      ],
      sourceReferences: [],
      inProgressQuestion: null,
    })

    const updated = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(updated?.status, "loaded")
    assert.equal(updated.questions.length, 0)
  })

  it("keeps streamed response progress monotonic on loading entries", () => {
    const store = useExaminationStore.getState()
    store.setEntry("entry", entry("loading"))

    store.applyStreamProgress("entry", {
      streamedCharacterCount: 12,
      streamedTextPreview: "newer",
      activityLabel: "Receiving model response.",
    })
    store.applyStreamProgress("entry", {
      streamedCharacterCount: 8,
      streamedTextPreview: "older",
      activityLabel: "Older activity.",
    })

    const updated = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(updated?.streamedResponseCharacterCount, 12)
    assert.equal(updated?.streamedResponsePreview, "newer")
    assert.equal(updated?.generationProgressLabel, "Receiving model response.")
  })

  it("owns abort controllers in the request sidecar", () => {
    const store = activateSession()
    const controller = new AbortController()

    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    if (started === null) throw new Error("Generation did not start.")
    examinationRequestSidecar.registerGeneration(
      sourceSessionKey,
      started.requestId,
      controller,
      "control-1",
    )

    assert.equal(controller.signal.aborted, false)
    store.cancelGenerationSession(sourceSessionKey)
    assert.equal(controller.signal.aborted, true)
  })

  it("migrates any loading key to the result archive key on success", () => {
    const store = activateSession()
    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    if (started === null) throw new Error("Generation did not start.")

    store.applyLoadedArchiveResult({
      sourceSessionKey,
      requestId: started.requestId,
      loadingKey: "session-1",
      resultKey: "archive-1",
      entry: entry("loaded"),
    })

    const state = useExaminationStore.getState()
    assert.equal(state.entriesByKey.has("session-1"), false)
    assert.equal(state.entriesByKey.get("archive-1")?.status, "loaded")
  })

  it("removes superseded archive chips after extending a generated set", () => {
    const store = activateSession()
    const fourQuestionKey = archiveStorageKey(4)
    const alternateContextKey = archiveStorageKey(4, "generation-context-b")
    const eightQuestionKey = archiveStorageKey(8)
    const lookup = store.startLookup(sourceSessionKey)
    if (lookup === null) throw new Error("Lookup did not start.")

    store.applyLookupResult({
      sourceSessionKey,
      requestId: lookup.requestId,
      archiveRevision: lookup.archiveRevision,
      archiveKeyIdentityKey: buildArchiveKeyIdentityKey(identity),
      requestedIdentity: identity,
      resolvedIdentity: identity,
      entryKey: fourQuestionKey,
      exactEntry: loadedEntry(4, "2026-01-01T00:00:00.000Z"),
      archiveEntries: [
        availableArchiveEntry(fourQuestionKey, 4, "2026-01-01T00:00:00.000Z"),
        availableArchiveEntry(
          alternateContextKey,
          4,
          "2026-01-02T00:00:00.000Z",
        ),
      ],
    })

    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: loadedEntry(4, "2026-01-01T00:00:00.000Z").questions,
      sourceReferences: [],
      requestedQuestionCount: 8,
    })
    if (started === null) throw new Error("Generation did not start.")

    store.applyLoadedArchiveResult({
      sourceSummaryKey: "summary-1",
      sourceSessionKey,
      requestId: started.requestId,
      loadingKey: "session-1",
      resultKey: eightQuestionKey,
      entry: loadedEntry(8, "2026-01-03T00:00:00.000Z"),
      archiveEntry: availableArchiveEntry(
        eightQuestionKey,
        8,
        "2026-01-03T00:00:00.000Z",
      ),
    })

    const state = useExaminationStore.getState()
    const session = state.sourceSessions.get(sourceSessionKey)
    assert.deepEqual(
      session?.archiveEntries.map((archiveEntry) => archiveEntry.key),
      [eightQuestionKey, alternateContextKey],
    )
    assert.equal(state.entriesByKey.has(fourQuestionKey), false)
    assert.equal(state.entriesByKey.get(eightQuestionKey)?.status, "loaded")
  })

  it("updates the generation owner summary when another summary is active", () => {
    const store = activateSession()
    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    if (started === null) throw new Error("Generation did not start.")
    store.activateSourceSummary({
      sourceSummaryKey: "summary-other",
      subjectIds: ["p_2"],
      selectedSubjectId: "p_2",
    })

    store.applyLoadedArchiveResult({
      sourceSummaryKey: "summary-1",
      sourceSessionKey,
      requestId: started.requestId,
      loadingKey: "session-1",
      resultKey: "archive-1",
      entry: entry("loaded"),
    })

    const summaries = useExaminationStore.getState().sourceSummaries
    assert.equal(
      summaries.get("summary-1")?.generatedQuestionCountBySubjectId.get("p_1"),
      1,
    )
    assert.equal(
      summaries
        .get("summary-other")
        ?.generatedQuestionCountBySubjectId.has("p_2"),
      false,
    )
  })

  it("adopts the provider-compatible model during connection changes", () => {
    const store = activateSession()

    store.setSessionConnection(sourceSessionKey, "llm-2", "c33", "high")

    const session = useExaminationStore
      .getState()
      .sourceSessions.get(sourceSessionKey)
    assert.equal(session?.preferences.activeConnectionId, "llm-2")
    assert.equal(session?.preferences.modelCode, "c33")
    assert.equal(session?.preferences.effort, "high")
  })

  it("rejects stale lookup and summary results", () => {
    const store = activateSession()
    const staleLookup = store.startLookup(sourceSessionKey)
    const currentLookup = store.startLookup(sourceSessionKey)
    const staleSummary = store.startSourceSummaryLookup("summary-1")
    const currentSummary = store.startSourceSummaryLookup("summary-1")
    if (staleLookup === null) throw new Error("Lookup did not start.")
    if (currentLookup === null) throw new Error("Lookup did not restart.")
    if (staleSummary === null) throw new Error("Summary lookup did not start.")
    if (currentSummary === null) {
      throw new Error("Summary lookup did not restart.")
    }

    store.applyLookupResult({
      sourceSessionKey,
      requestId: staleLookup.requestId,
      archiveRevision: staleLookup.archiveRevision,
      archiveKeyIdentityKey: buildArchiveKeyIdentityKey(identity),
      requestedIdentity: identity,
      resolvedIdentity: identity,
      entryKey: "archive-stale",
      exactEntry: entry("loaded"),
      archiveEntries: [],
    })
    store.applySourceSummaryLookupResult({
      sourceSummaryKey: "summary-1",
      requestId: staleSummary.requestId,
      archiveRevision: staleSummary.archiveRevision,
      counts: new Map([["p_1", 4]]),
    })

    const state = useExaminationStore.getState()
    const session = state.sourceSessions.get(sourceSessionKey)
    const summary = state.sourceSummaries.get("summary-1")
    assert.equal(session?.pendingLookupRequestId, currentLookup.requestId)
    assert.deepEqual(session?.display, { kind: "idle" })
    assert.equal(state.entriesByKey.has("archive-stale"), false)
    assert.equal(summary?.pendingRequestId, currentSummary.requestId)
    assert.equal(summary?.generatedQuestionCountBySubjectId.has("p_1"), false)
  })

  it("rejects stale generation results", () => {
    const store = activateSession()
    const stale = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    const current = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-2",
      generationControlId: "control-2",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    if (stale === null) throw new Error("Generation did not start.")
    if (current === null) throw new Error("Generation did not restart.")

    store.applyLoadedArchiveResult({
      sourceSummaryKey: "summary-1",
      sourceSessionKey,
      requestId: stale.requestId,
      loadingKey: "session-1",
      resultKey: "archive-stale",
      entry: entry("loaded"),
    })

    const state = useExaminationStore.getState()
    const session = state.sourceSessions.get(sourceSessionKey)
    assert.equal(state.entriesByKey.has("archive-stale"), false)
    assert.deepEqual(session?.display, {
      kind: "loading",
      entryKey: "session-2",
    })
    assert.equal(session?.pendingGenerationRequestId, current.requestId)
  })

  it("aborts lookup and summary sidecars during repository invalidation", () => {
    const store = useExaminationStore.getState()
    const summaryKey = repositorySummaryKey("/repo")
    store.activateSource({
      sourceSummaryKey: summaryKey,
      sourceSessionKey,
      sourceIdentity: identity,
      subjectIds: ["p_1"],
      selectedSubjectId: "p_1",
      defaultPreferences: {
        questionCount: 4,
        activeConnectionId: "llm-1",
        modelCode: "22",
        effort: "medium",
      },
    })
    const lookup = store.startLookup(sourceSessionKey)
    const summary = store.startSourceSummaryLookup(summaryKey)
    if (lookup === null) throw new Error("Lookup did not start.")
    if (summary === null) throw new Error("Summary lookup did not start.")
    const lookupController = new AbortController()
    const summaryController = new AbortController()
    examinationRequestSidecar.registerLookup(
      sourceSessionKey,
      lookup.requestId,
      lookupController,
    )
    examinationRequestSidecar.registerSummary(
      summaryKey,
      summary.requestId,
      summaryController,
    )

    store.invalidateRepositoryAnalysisSource("/repo")

    assert.equal(lookupController.signal.aborted, true)
    assert.equal(summaryController.signal.aborted, true)
    assert.equal(useExaminationStore.getState().sourceSessions.size, 0)
    assert.equal(useExaminationStore.getState().sourceSummaries.size, 0)
  })

  it("separates soft stop intent from transport cancellation", () => {
    const store = activateSession()
    const controller = new AbortController()
    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })
    if (started === null) throw new Error("Generation did not start.")
    examinationRequestSidecar.registerGeneration(
      sourceSessionKey,
      started.requestId,
      controller,
      "control-1",
    )

    store.requestGenerationStop(sourceSessionKey)

    assert.equal(controller.signal.aborted, false)
    assert.equal(
      useExaminationStore.getState().entriesByKey.get("session-1")
        ?.stopRequested,
      true,
    )

    store.cancelGenerationSession(sourceSessionKey)

    assert.equal(controller.signal.aborted, true)
    assert.equal(
      useExaminationStore.getState().entriesByKey.has("session-1"),
      false,
    )
  })

  it("invalidates repository summaries by parsed repository path", () => {
    const store = useExaminationStore.getState()
    const repoASummaryKey = repositorySummaryKey("/repo-a")
    const repoBSummaryKey = repositorySummaryKey("/repo-b")
    store.activateSourceSummary({
      sourceSummaryKey: repoASummaryKey,
      subjectIds: ["p_1"],
      selectedSubjectId: "p_1",
    })
    store.activateSourceSummary({
      sourceSummaryKey: repoBSummaryKey,
      subjectIds: ["p_2"],
      selectedSubjectId: "p_2",
    })

    store.invalidateRepositoryAnalysisSource("/repo-a")

    const summaries = useExaminationStore.getState().sourceSummaries
    assert.equal(summaries.has(repoASummaryKey), false)
    assert.equal(summaries.has(repoBSummaryKey), true)
  })

  it("invalidates only repository sessions in the requested analysis source scope", () => {
    const store = useExaminationStore.getState()
    const courseAKey: AnalysisSourceKey = {
      kind: "course",
      courseId: "course-a",
    }
    const courseBKey: AnalysisSourceKey = {
      kind: "course",
      courseId: "course-b",
    }
    const sessionAKey = buildSourceSessionKey(identity, courseAKey)
    const sessionBKey = buildSourceSessionKey(identity, courseBKey)
    const summaryAKey = scopedRepositorySummaryKey("/repo", courseAKey)
    const summaryBKey = scopedRepositorySummaryKey("/repo", courseBKey)
    store.activateSource({
      sourceSummaryKey: summaryAKey,
      sourceSessionKey: sessionAKey,
      sourceIdentity: identity,
      subjectIds: ["p_1"],
      selectedSubjectId: "p_1",
      defaultPreferences: {
        questionCount: 4,
        activeConnectionId: "llm-1",
        modelCode: "22",
        effort: "medium",
      },
    })
    store.activateSource({
      sourceSummaryKey: summaryBKey,
      sourceSessionKey: sessionBKey,
      sourceIdentity: identity,
      subjectIds: ["p_1"],
      selectedSubjectId: "p_1",
      defaultPreferences: {
        questionCount: 4,
        activeConnectionId: "llm-1",
        modelCode: "22",
        effort: "medium",
      },
    })

    store.invalidateRepositoryAnalysisSource("/repo", courseAKey)

    const state = useExaminationStore.getState()
    assert.equal(state.sourceSessions.has(sessionAKey), false)
    assert.equal(state.sourceSummaries.has(summaryAKey), false)
    assert.equal(state.sourceSessions.has(sessionBKey), true)
    assert.equal(state.sourceSummaries.has(summaryBKey), true)
    assert.equal(state.activeSourceSessionKey, sessionBKey)
  })

  it("invalidates every examination key in the requested analysis source scope", () => {
    const store = useExaminationStore.getState()
    const courseAKey: AnalysisSourceKey = {
      kind: "course",
      courseId: "course-a",
    }
    const courseBKey: AnalysisSourceKey = {
      kind: "course",
      courseId: "course-b",
    }
    const repositoryASessionKey = buildSourceSessionKey(identity, courseAKey)
    const repositoryBSessionKey = buildSourceSessionKey(identity, courseBKey)
    const submissionASessionKey = buildSourceSessionKey(
      submissionIdentity,
      courseAKey,
    )
    const submissionBSessionKey = buildSourceSessionKey(
      submissionIdentity,
      courseBKey,
    )
    const repositoryASummaryKey = scopedRepositorySummaryKey(
      "/repo",
      courseAKey,
    )
    const repositoryBSummaryKey = scopedRepositorySummaryKey(
      "/repo",
      courseBKey,
    )
    const submissionASummaryKey = scopedSubmissionSummaryKey(
      "/submission",
      courseAKey,
    )
    const submissionBSummaryKey = scopedSubmissionSummaryKey(
      "/submission",
      courseBKey,
    )
    const activate = (
      sourceSummaryKey: string,
      sourceSessionKey: string,
      sourceIdentity: SourceIdentity,
    ) =>
      store.activateSource({
        sourceSummaryKey,
        sourceSessionKey,
        sourceIdentity,
        subjectIds: [sourceIdentity.subjectId],
        selectedSubjectId: sourceIdentity.subjectId,
        defaultPreferences: {
          questionCount: 4,
          activeConnectionId: "llm-1",
          modelCode: "22",
          effort: "medium",
        },
      })
    activate(repositoryASummaryKey, repositoryASessionKey, identity)
    activate(submissionASummaryKey, submissionASessionKey, submissionIdentity)
    activate(repositoryBSummaryKey, repositoryBSessionKey, identity)
    activate(submissionBSummaryKey, submissionBSessionKey, submissionIdentity)

    store.invalidateAnalysisSource(courseAKey)

    const state = useExaminationStore.getState()
    assert.equal(state.sourceSessions.has(repositoryASessionKey), false)
    assert.equal(state.sourceSessions.has(submissionASessionKey), false)
    assert.equal(state.sourceSummaries.has(repositoryASummaryKey), false)
    assert.equal(state.sourceSummaries.has(submissionASummaryKey), false)
    assert.equal(state.sourceSessions.has(repositoryBSessionKey), true)
    assert.equal(state.sourceSessions.has(submissionBSessionKey), true)
    assert.equal(state.sourceSummaries.has(repositoryBSummaryKey), true)
    assert.equal(state.sourceSummaries.has(submissionBSummaryKey), true)
    assert.equal(state.activeSourceSessionKey, submissionBSessionKey)
  })
})

function activateSession() {
  const store = useExaminationStore.getState()
  store.activateSource({
    sourceSummaryKey: "summary-1",
    sourceSessionKey,
    sourceIdentity: identity,
    subjectIds: ["p_1"],
    selectedSubjectId: "p_1",
    defaultPreferences: {
      questionCount: 4,
      activeConnectionId: "llm-1",
      modelCode: "22",
      effort: "medium",
    },
  })
  return store
}

function repositorySummaryKey(repoPath: string): string {
  return JSON.stringify([
    "repository-analysis-summary",
    repoPath,
    repositoryCommitOid,
    identity.redactionIdentityScopeId,
    [[identity.subjectId, identity.excerptScopeId]],
  ])
}

function scopedRepositorySummaryKey(
  repoPath: string,
  sourceKey: AnalysisSourceKey,
): string {
  return JSON.stringify([
    "analysis-source",
    JSON.parse(analysisSourceKeyScopeId(sourceKey)) as unknown,
    JSON.parse(repositorySummaryKey(repoPath)) as unknown,
  ])
}

function submissionSummaryKey(folderPath: string): string {
  return JSON.stringify([
    "submission-summary",
    folderPath,
    submissionIdentity.contentScopeId,
    submissionIdentity.redactionIdentityScopeId,
    [[submissionIdentity.subjectId, submissionIdentity.excerptScopeId]],
  ])
}

function scopedSubmissionSummaryKey(
  folderPath: string,
  sourceKey: AnalysisSourceKey,
): string {
  return JSON.stringify([
    "analysis-source",
    JSON.parse(analysisSourceKeyScopeId(sourceKey)) as unknown,
    JSON.parse(submissionSummaryKey(folderPath)) as unknown,
  ])
}
