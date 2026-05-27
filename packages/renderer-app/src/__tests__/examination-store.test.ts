import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  buildSourceSessionKey,
  type SourceIdentity,
} from "../components/tabs/examination/source.js"
import type { ExaminationEntry } from "../stores/examination-store.js"
import {
  examinationRequestSidecar,
  useExaminationStore,
} from "../stores/examination-store.js"

const identity: SourceIdentity = {
  kind: "repository-analysis",
  repoPath: "/repo",
  commitOid: "a".repeat(40),
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
