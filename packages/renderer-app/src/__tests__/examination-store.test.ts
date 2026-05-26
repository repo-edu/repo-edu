import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { useExaminationStore } from "../stores/examination-store.js"

beforeEach(() => {
  useExaminationStore.getState().reset()
})

describe("examination store", () => {
  it("replaces partial questions and source references on loading entries", () => {
    const store = useExaminationStore.getState()
    store.setEntry("entry", {
      status: "loading",
      questions: [],
      usage: null,
      errorMessage: null,
      generatedAt: null,
      fromArchive: false,
      sourceReferences: [],
      archivedQuestionCount: null,
      partialQuestionCount: null,
      generationProgressLabel: null,
      streamedResponseCharacterCount: 0,
      streamedResponsePreview: "",
      inProgressQuestion: null,
    })

    store.setPartialQuestions("entry", {
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

    const entry = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(entry?.status, "loading")
    assert.equal(entry.questions.length, 1)
    assert.equal(
      entry.sourceReferences[0]?.occurrences[0]?.filePath,
      "src/a.ts",
    )
    assert.equal(entry.inProgressQuestion?.question, "Q2 in progress")
  })

  it("ignores partial question updates for loaded entries", () => {
    const store = useExaminationStore.getState()
    store.setEntry("entry", {
      status: "loaded",
      questions: [],
      usage: null,
      errorMessage: null,
      generatedAt: null,
      fromArchive: false,
      sourceReferences: [],
      archivedQuestionCount: 1,
      partialQuestionCount: null,
      generationProgressLabel: null,
      streamedResponseCharacterCount: 0,
      streamedResponsePreview: "",
      inProgressQuestion: null,
    })

    store.setPartialQuestions("entry", {
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

    const entry = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(entry?.status, "loaded")
    assert.equal(entry.questions.length, 0)
  })

  it("updates generation progress only for loading entries", () => {
    const store = useExaminationStore.getState()
    store.setEntry("entry", {
      status: "loading",
      questions: [],
      usage: null,
      errorMessage: null,
      generatedAt: null,
      fromArchive: false,
      sourceReferences: [],
      archivedQuestionCount: null,
      partialQuestionCount: { requested: 2, accepted: 0 },
      generationProgressLabel: null,
      streamedResponseCharacterCount: 0,
      streamedResponsePreview: "",
      inProgressQuestion: null,
    })

    store.setGenerationProgress("entry", "Building prompt.")
    let entry = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(entry?.generationProgressLabel, "Building prompt.")
    assert.ok(entry)

    store.setEntry("entry", {
      ...entry,
      status: "loaded",
    })
    store.setGenerationProgress("entry", "Ignored.")
    entry = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(entry?.generationProgressLabel, "Building prompt.")
  })

  it("keeps streamed response progress monotonic on loading entries", () => {
    const store = useExaminationStore.getState()
    store.setEntry("entry", {
      status: "loading",
      questions: [],
      usage: null,
      errorMessage: null,
      generatedAt: null,
      fromArchive: false,
      sourceReferences: [],
      archivedQuestionCount: null,
      partialQuestionCount: { requested: 2, accepted: 0 },
      generationProgressLabel: null,
      streamedResponseCharacterCount: 0,
      streamedResponsePreview: "",
      inProgressQuestion: null,
    })

    store.setStreamProgress("entry", {
      streamedCharacterCount: 12,
      streamedTextPreview: "newer",
      activityLabel: "Receiving model response.",
    })
    store.setStreamProgress("entry", {
      streamedCharacterCount: 8,
      streamedTextPreview: "older",
      activityLabel: "Older activity.",
    })

    const entry = useExaminationStore.getState().entriesByKey.get("entry")
    assert.equal(entry?.streamedResponseCharacterCount, 12)
    assert.equal(entry?.streamedResponsePreview, "newer")
    assert.equal(entry?.generationProgressLabel, "Receiving model response.")
  })
})
