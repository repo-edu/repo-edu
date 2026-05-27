import type {
  ExaminationInProgressQuestion,
  ExaminationQuestion,
  ExaminationSourceReference,
  ExaminationStreamProgress,
  ExaminationUsage,
} from "@repo-edu/application-contract"
import type { LlmEffort } from "@repo-edu/integrations-llm-contract"
import { create } from "zustand"

export type ExaminationEntryStatus = "idle" | "loading" | "loaded" | "error"

export type ExaminationEntry = {
  status: ExaminationEntryStatus
  questions: ExaminationQuestion[]
  usage: ExaminationUsage | null
  errorMessage: string | null
  generatedAt: string | null
  fromArchive: boolean
  sourceReferences: ExaminationSourceReference[]
  archivedQuestionCount: number | null
  archivedModel: string | null
  archivedEffort: LlmEffort | null
  partialQuestionCount: {
    requested: number
    accepted: number
  } | null
  generationProgressLabel: string | null
  streamedResponseCharacterCount: number
  streamedResponsePreview: string
  inProgressQuestion: ExaminationInProgressQuestion | null
  generationControlId: string | null
  stopRequested: boolean
}

type ExaminationState = {
  selectedPersonId: string | null
  questionCount: number
  showAnswers: boolean
  entriesByKey: Map<string, ExaminationEntry>
  abortByEntryKey: Map<string, AbortController>
}

type ExaminationActions = {
  setSelectedPersonId: (personId: string | null) => void
  setQuestionCount: (count: number) => void
  setShowAnswers: (show: boolean) => void
  setEntry: (key: string, entry: ExaminationEntry) => void
  startGenerationSession: (payload: {
    entryKey: string
    generationControlId: string
    abortController: AbortController
    seedQuestions: ExaminationQuestion[]
    sourceReferences: ExaminationSourceReference[]
    requestedQuestionCount: number
  }) => void
  applyLoadedArchiveResult: (payload: {
    loadingKey: string | null
    resultKey: string
    entry: ExaminationEntry
  }) => void
  applyGenerationError: (key: string, message: string) => void
  setPartialQuestions: (
    key: string,
    payload: {
      questions: ExaminationQuestion[]
      sourceReferences: ExaminationSourceReference[]
      inProgressQuestion: ExaminationInProgressQuestion | null
    },
  ) => void
  applyPartialQuestions: (
    key: string,
    payload: {
      questions: ExaminationQuestion[]
      sourceReferences: ExaminationSourceReference[]
      inProgressQuestion: ExaminationInProgressQuestion | null
    },
  ) => void
  setGenerationProgress: (key: string, label: string) => void
  applyGenerationProgress: (key: string, label: string) => void
  setStreamProgress: (key: string, progress: ExaminationStreamProgress) => void
  applyStreamProgress: (
    key: string,
    progress: ExaminationStreamProgress,
  ) => void
  requestGenerationStop: (key: string) => void
  cancelGenerationSession: (key: string) => void
  cancelAllGenerationSessions: () => void
  registerAbort: (key: string, controller: AbortController) => void
  clearAbort: (key: string, controller?: AbortController) => void
  clearEntry: (key: string) => void
  reset: () => void
}

function createInitialState(): ExaminationState {
  return {
    selectedPersonId: null,
    questionCount: 4,
    showAnswers: true,
    entriesByKey: new Map(),
    abortByEntryKey: new Map(),
  }
}

function createLoadingEntry(params: {
  generationControlId: string
  seedQuestions: ExaminationQuestion[]
  sourceReferences: ExaminationSourceReference[]
  requestedQuestionCount: number
}): ExaminationEntry {
  return {
    status: "loading",
    questions: params.seedQuestions,
    usage: null,
    errorMessage: null,
    generatedAt: null,
    fromArchive: false,
    sourceReferences: params.sourceReferences,
    archivedQuestionCount: null,
    archivedModel: null,
    archivedEffort: null,
    partialQuestionCount: {
      requested: params.requestedQuestionCount,
      accepted: params.seedQuestions.length,
    },
    generationProgressLabel: "Preparing question generation.",
    streamedResponseCharacterCount: 0,
    streamedResponsePreview: "",
    inProgressQuestion: null,
    generationControlId: params.generationControlId,
    stopRequested: false,
  }
}

function createErrorEntry(message: string): ExaminationEntry {
  return {
    status: "error",
    questions: [],
    usage: null,
    errorMessage: message,
    generatedAt: null,
    fromArchive: false,
    sourceReferences: [],
    archivedQuestionCount: null,
    archivedModel: null,
    archivedEffort: null,
    partialQuestionCount: null,
    generationProgressLabel: null,
    streamedResponseCharacterCount: 0,
    streamedResponsePreview: "",
    inProgressQuestion: null,
    generationControlId: null,
    stopRequested: false,
  }
}

export const useExaminationStore = create<
  ExaminationState & ExaminationActions
>((set, get) => {
  const updateLoadingEntry = (
    key: string,
    update: (entry: ExaminationEntry) => ExaminationEntry,
  ): void => {
    set((state) => {
      const current = state.entriesByKey.get(key)
      if (current?.status !== "loading") return state
      const next = new Map(state.entriesByKey)
      next.set(key, update(current))
      return { entriesByKey: next }
    })
  }

  const clearAbortOnly = (key: string, controller?: AbortController): void => {
    set((state) => {
      const current = state.abortByEntryKey.get(key)
      if (current === undefined) return state
      if (controller !== undefined && current !== controller) return state
      const next = new Map(state.abortByEntryKey)
      next.delete(key)
      return { abortByEntryKey: next }
    })
  }

  return {
    ...createInitialState(),

    setSelectedPersonId: (selectedPersonId) => set({ selectedPersonId }),
    setQuestionCount: (questionCount) =>
      set({ questionCount: clampQuestionCount(questionCount) }),
    setShowAnswers: (showAnswers) => set({ showAnswers }),
    setEntry: (key, entry) =>
      set((state) => {
        const next = new Map(state.entriesByKey)
        next.set(key, entry)
        return { entriesByKey: next }
      }),
    startGenerationSession: (payload) =>
      set((state) => {
        state.abortByEntryKey.get(payload.entryKey)?.abort()
        const entriesByKey = new Map(state.entriesByKey)
        const abortByEntryKey = new Map(state.abortByEntryKey)
        entriesByKey.set(
          payload.entryKey,
          createLoadingEntry({
            generationControlId: payload.generationControlId,
            seedQuestions: payload.seedQuestions,
            sourceReferences: payload.sourceReferences,
            requestedQuestionCount: payload.requestedQuestionCount,
          }),
        )
        abortByEntryKey.set(payload.entryKey, payload.abortController)
        return { entriesByKey, abortByEntryKey }
      }),
    applyLoadedArchiveResult: ({ loadingKey, resultKey, entry }) =>
      set((state) => {
        const entriesByKey = new Map(state.entriesByKey)
        const abortByEntryKey = new Map(state.abortByEntryKey)
        if (loadingKey !== null) {
          if (loadingKey !== resultKey) {
            entriesByKey.delete(loadingKey)
          }
          abortByEntryKey.delete(loadingKey)
        }
        entriesByKey.set(resultKey, {
          ...entry,
          generationControlId: null,
          stopRequested: false,
        })
        return { entriesByKey, abortByEntryKey }
      }),
    applyGenerationError: (key, message) =>
      set((state) => {
        const entriesByKey = new Map(state.entriesByKey)
        const abortByEntryKey = new Map(state.abortByEntryKey)
        entriesByKey.set(key, createErrorEntry(message))
        abortByEntryKey.delete(key)
        return { entriesByKey, abortByEntryKey }
      }),
    setPartialQuestions: (key, payload) =>
      set((state) => {
        const current = state.entriesByKey.get(key)
        if (current?.status !== "loading") return state
        const next = new Map(state.entriesByKey)
        next.set(key, {
          ...current,
          questions: payload.questions,
          sourceReferences: payload.sourceReferences,
          inProgressQuestion: payload.inProgressQuestion,
          partialQuestionCount:
            current.partialQuestionCount === null
              ? null
              : {
                  ...current.partialQuestionCount,
                  accepted: payload.questions.length,
                },
        })
        return { entriesByKey: next }
      }),
    applyPartialQuestions: (key, payload) =>
      get().setPartialQuestions(key, payload),
    setGenerationProgress: (key, label) =>
      updateLoadingEntry(key, (current) => ({
        ...current,
        generationProgressLabel: label,
      })),
    applyGenerationProgress: (key, label) =>
      get().setGenerationProgress(key, label),
    setStreamProgress: (key, progress) =>
      updateLoadingEntry(key, (current) => {
        if (
          progress.streamedCharacterCount <
          current.streamedResponseCharacterCount
        ) {
          return current
        }
        return {
          ...current,
          generationProgressLabel:
            progress.activityLabel ?? current.generationProgressLabel,
          streamedResponseCharacterCount: progress.streamedCharacterCount,
          streamedResponsePreview: progress.streamedTextPreview,
        }
      }),
    applyStreamProgress: (key, progress) =>
      get().setStreamProgress(key, progress),
    requestGenerationStop: (key) =>
      updateLoadingEntry(key, (current) => ({
        ...current,
        stopRequested: true,
        generationProgressLabel:
          current.generationProgressLabel ?? "Stopping generation.",
      })),
    cancelGenerationSession: (key) =>
      set((state) => {
        state.abortByEntryKey.get(key)?.abort()
        const entriesByKey = new Map(state.entriesByKey)
        const abortByEntryKey = new Map(state.abortByEntryKey)
        entriesByKey.delete(key)
        abortByEntryKey.delete(key)
        return { entriesByKey, abortByEntryKey }
      }),
    cancelAllGenerationSessions: () =>
      set((state) => {
        for (const controller of state.abortByEntryKey.values()) {
          controller.abort()
        }
        const entriesByKey = new Map(state.entriesByKey)
        for (const key of state.abortByEntryKey.keys()) {
          entriesByKey.delete(key)
        }
        return {
          entriesByKey,
          abortByEntryKey: new Map(),
        }
      }),
    registerAbort: (key, controller) =>
      set((state) => {
        state.abortByEntryKey.get(key)?.abort()
        const next = new Map(state.abortByEntryKey)
        next.set(key, controller)
        return { abortByEntryKey: next }
      }),
    clearAbort: clearAbortOnly,
    clearEntry: (key) =>
      set((state) => {
        if (!state.entriesByKey.has(key)) return state
        const next = new Map(state.entriesByKey)
        next.delete(key)
        return { entriesByKey: next }
      }),
    reset: () => {
      for (const controller of get().abortByEntryKey.values()) {
        controller.abort()
      }
      set(createInitialState())
    },
  }
})

function clampQuestionCount(count: number): number {
  if (!Number.isFinite(count)) return 4
  const integer = Math.round(count)
  if (integer < 1) return 1
  if (integer > 20) return 20
  return integer
}
