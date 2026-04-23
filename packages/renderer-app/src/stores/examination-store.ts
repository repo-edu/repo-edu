import type {
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
}

type ExaminationState = {
  selectedPersonId: string | null
  questionCount: number
  showAnswers: boolean
  entriesByPersonId: Map<string, ExaminationEntry>
}

type ExaminationActions = {
  setSelectedPersonId: (personId: string | null) => void
  setQuestionCount: (count: number) => void
  setShowAnswers: (show: boolean) => void
  setEntry: (personId: string, entry: ExaminationEntry) => void
  clearEntry: (personId: string) => void
  reset: () => void
}

const initialState: ExaminationState = {
  selectedPersonId: null,
  questionCount: 8,
  showAnswers: false,
  entriesByPersonId: new Map(),
}

export const examinationStoreInternals = {
  abortByPersonId: new Map<string, AbortController>(),
}

export const useExaminationStore = create<
  ExaminationState & ExaminationActions
>((set) => ({
  ...initialState,

  setSelectedPersonId: (selectedPersonId) => set({ selectedPersonId }),
  setQuestionCount: (questionCount) =>
    set({ questionCount: clampQuestionCount(questionCount) }),
  setShowAnswers: (showAnswers) => set({ showAnswers }),
  setEntry: (personId, entry) =>
    set((state) => {
      const next = new Map(state.entriesByPersonId)
      next.set(personId, entry)
      return { entriesByPersonId: next }
    }),
  clearEntry: (personId) =>
    set((state) => {
      if (!state.entriesByPersonId.has(personId)) return state
      const next = new Map(state.entriesByPersonId)
      next.delete(personId)
      return { entriesByPersonId: next }
    }),
  reset: () => {
    for (const controller of examinationStoreInternals.abortByPersonId.values()) {
      controller.abort()
    }
    examinationStoreInternals.abortByPersonId.clear()
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
