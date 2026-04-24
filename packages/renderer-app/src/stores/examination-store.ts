import type {
  ExaminationProvenanceDrift,
  ExaminationQuestion,
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
  provenanceDrift: ExaminationProvenanceDrift | null
  archivedQuestionCount: number | null
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
  clearEntry: (key: string) => void
  reset: () => void
}

const initialState: ExaminationState = {
  selectedPersonId: null,
  questionCount: 8,
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
  if (!Number.isFinite(count)) return 8
  const integer = Math.round(count)
  if (integer < 1) return 1
  if (integer > 20) return 20
  return integer
}
