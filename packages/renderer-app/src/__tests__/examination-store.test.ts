import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  buildSourceSessionKey,
  type SourceIdentity,
} from "../components/tabs/examination/source.js"
import type {
  ExaminationEntry,
  ExaminationGenerationReplayInput,
} from "../stores/examination-store.js"
import {
  examinationHistoryEffectDriver,
  examinationRequestSidecar,
  useExaminationStore,
} from "../stores/examination-store.js"

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
      generationReplayInput: replayInput(),
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
      generationReplayInput: replayInput(),
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

  it("updates the generation owner summary when another summary is active", () => {
    const store = activateSession()
    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
      generationReplayInput: replayInput(),
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

  it("undo restores only the command-owned examination session", () => {
    const store = activateSession()
    store.setSessionShowAnswers(sourceSessionKey, false)
    const otherIdentity: SourceIdentity = {
      ...identity,
      repoPath: "/other-repo",
      subjectId: "p_2",
      excerptScopeId: "scope-2",
    }
    const otherSessionKey = buildSourceSessionKey(otherIdentity)
    store.activateSource({
      sourceSummaryKey: "summary-2",
      sourceSessionKey: otherSessionKey,
      sourceIdentity: otherIdentity,
      subjectIds: ["p_2"],
      selectedSubjectId: "p_2",
      defaultPreferences: {
        questionCount: 6,
        activeConnectionId: "llm-2",
        modelCode: "c33",
        effort: "high",
      },
    })

    store.undo()

    const state = useExaminationStore.getState()
    assert.equal(state.sourceSessions.get(sourceSessionKey)?.showAnswers, true)
    assert.equal(state.sourceSessions.has(otherSessionKey), true)
    assert.equal(
      state.sourceSessions.get(otherSessionKey)?.preferences.questionCount,
      6,
    )
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

  it("rewrites later history snapshots when generation completes", () => {
    const store = activateSession()
    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
      generationReplayInput: replayInput(),
    })
    if (started === null) throw new Error("Generation did not start.")
    store.setSessionShowAnswers(sourceSessionKey, false)

    store.applyLoadedArchiveResult({
      sourceSummaryKey: "summary-1",
      sourceSessionKey,
      requestId: started.requestId,
      loadingKey: "session-1",
      resultKey: "archive-1",
      entry: entry("loaded"),
    })
    store.undo()

    const session = useExaminationStore
      .getState()
      .sourceSessions.get(sourceSessionKey)
    assert.equal(session?.showAnswers, true)
    assert.deepEqual(session?.display, {
      kind: "archived",
      entryKey: "archive-1",
      source: "just-generated",
    })
    assert.equal(session?.pendingGenerationRequestId, null)
    assert.equal(
      useExaminationStore.getState().entriesByKey.get("archive-1")?.status,
      "loaded",
    )
  })

  it("returns a replay effect instead of restoring a dead pending generation", () => {
    const store = activateSession()
    const replay = replayInput()
    const started = store.startGenerationSession({
      sourceSessionKey,
      entryKey: "session-1",
      generationControlId: "control-1",
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
      generationReplayInput: replay,
    })
    if (started === null) throw new Error("Generation did not start.")

    store.undo()
    const unregister = examinationHistoryEffectDriver.register(() => undefined)
    const transition = store.redo()
    unregister()

    assert.equal(transition?.effects.length, 1)
    assert.deepEqual(transition?.effects[0], {
      kind: "replay-generation",
      input: replay,
    })
    assert.equal(
      useExaminationStore.getState().sourceSessions.get(sourceSessionKey)
        ?.pendingGenerationRequestId,
      null,
    )
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
      generationReplayInput: replayInput(),
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

function replayInput(
  overrides: Partial<ExaminationGenerationReplayInput> = {},
): ExaminationGenerationReplayInput {
  return {
    sourceSummaryKey: "summary-1",
    sourceSessionKey,
    workflowInput: {
      personId: identity.subjectId,
      contentScopeId: repositoryCommitOid,
      localIdentityContext: {
        names: [],
        emails: [],
        opaqueIdentifiers: [],
        gitUsernames: [],
      },
      excerpts: [
        { filePath: "src/a.ts", startLine: 1, lines: ["const a = 1"] },
      ],
      excerptFileSources: { "src/a.ts": "const a = 1\n" },
      questionCount: 4,
      llmSettings: {
        llmConnections: [],
        activeLlmConnectionId: null,
        examinationModelsByProvider: {},
      },
    },
    sourceReferences: [],
    requestedQuestionCount: 4,
    ...overrides,
  }
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
