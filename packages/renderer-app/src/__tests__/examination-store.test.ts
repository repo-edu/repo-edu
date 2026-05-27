import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type { ExaminationEntry } from "../stores/examination-store.js"
import { useExaminationStore } from "../stores/examination-store.js"

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

  it("owns abort controllers in observable state", () => {
    const controller = new AbortController()

    useExaminationStore.getState().startGenerationSession({
      entryKey: "session-1",
      generationControlId: "control-1",
      abortController: controller,
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })

    assert.equal(
      useExaminationStore.getState().abortByEntryKey.get("session-1"),
      controller,
    )
  })

  it("migrates any loading key to the result archive key on success", () => {
    const controller = new AbortController()
    const store = useExaminationStore.getState()
    store.startGenerationSession({
      entryKey: "session-1",
      generationControlId: "control-1",
      abortController: controller,
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })

    store.applyLoadedArchiveResult({
      loadingKey: "session-1",
      resultKey: "archive-1",
      entry: entry("loaded"),
    })

    const state = useExaminationStore.getState()
    assert.equal(state.entriesByKey.has("session-1"), false)
    assert.equal(state.entriesByKey.get("archive-1")?.status, "loaded")
    assert.equal(state.abortByEntryKey.has("session-1"), false)
  })

  it("separates soft stop intent from transport cancellation", () => {
    const controller = new AbortController()
    const store = useExaminationStore.getState()
    store.startGenerationSession({
      entryKey: "session-1",
      generationControlId: "control-1",
      abortController: controller,
      seedQuestions: [],
      sourceReferences: [],
      requestedQuestionCount: 4,
    })

    store.requestGenerationStop("session-1")

    assert.equal(controller.signal.aborted, false)
    assert.equal(
      useExaminationStore.getState().entriesByKey.get("session-1")
        ?.stopRequested,
      true,
    )

    store.cancelGenerationSession("session-1")

    assert.equal(controller.signal.aborted, true)
    assert.equal(
      useExaminationStore.getState().entriesByKey.has("session-1"),
      false,
    )
  })
})
