import type {
  ExaminationQuestion,
  ExaminationSourceReference,
  ExaminationUsage,
} from "@repo-edu/application-contract"
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
  partialQuestionCount: {
    requested: number
    accepted: number
  } | null
  generationProgressLabel: string | null
}

type ExaminationState = {
  selectedPersonId: string | null
  questionCount: number
  showAnswers: boolean
  entriesByKey: Map<string, ExaminationEntry>
}

type ExaminationActions = {
  setSelectedPersonId: (personId: string | null) => void
  setQuestionCount: (count: number) => void
  setShowAnswers: (show: boolean) => void
  setEntry: (key: string, entry: ExaminationEntry) => void
  setPartialQuestions: (
    key: string,
    payload: {
      questions: ExaminationQuestion[]
      sourceReferences: ExaminationSourceReference[]
    },
  ) => void
  setGenerationProgress: (key: string, label: string) => void
  clearEntry: (key: string) => void
  reset: () => void
}

const initialState: ExaminationState = {
  selectedPersonId: null,
  questionCount: 4,
  showAnswers: false,
  entriesByKey: new Map(),
}

export const examinationStoreInternals = {
  abortByEntryKey: new Map<string, AbortController>(),
}

export const useExaminationStore = create<
  ExaminationState & ExaminationActions
>((set) => ({
  ...initialState,

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
  setPartialQuestions: (key, payload) =>
    set((state) => {
      const current = state.entriesByKey.get(key)
      if (current?.status !== "loading") return state
      const next = new Map(state.entriesByKey)
      next.set(key, {
        ...current,
        questions: payload.questions,
        sourceReferences: payload.sourceReferences,
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
  setGenerationProgress: (key, label) =>
    set((state) => {
      const current = state.entriesByKey.get(key)
      if (current?.status !== "loading") return state
      const next = new Map(state.entriesByKey)
      next.set(key, {
        ...current,
        generationProgressLabel: label,
      })
      return { entriesByKey: next }
    }),
  clearEntry: (key) =>
    set((state) => {
      if (!state.entriesByKey.has(key)) return state
      const next = new Map(state.entriesByKey)
      next.delete(key)
      return { entriesByKey: next }
    }),
  reset: () => {
    for (const controller of examinationStoreInternals.abortByEntryKey.values()) {
      controller.abort()
    }
    examinationStoreInternals.abortByEntryKey.clear()
    set(initialState)
  },
}))

function clampQuestionCount(count: number): number {
  if (!Number.isFinite(count)) return 4
  const integer = Math.round(count)
  if (integer < 1) return 1
  if (integer > 20) return 20
  return integer
}
