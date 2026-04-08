import type {
  AnalysisConfig,
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"
import type { AnalysisProgress } from "@repo-edu/application-contract"
import { create } from "zustand"

export type AnalysisActiveMetric =
  | "commits"
  | "insertions"
  | "deletions"
  | "linesOfCode"

export type AnalysisDisplayMode = "absolute" | "percentage"

export type AnalysisView =
  | "authors"
  | "authors-files"
  | "files-authors"
  | "files"

export type AnalysisWorkflowStatus = "idle" | "running" | "error"

type AnalysisState = {
  // Config state
  config: AnalysisConfig
  selectedRepoPath: string | null

  // Result state
  result: AnalysisResult | null
  blameResult: BlameResult | null
  blameTargetFiles: string[]
  workflowStatus: AnalysisWorkflowStatus
  progress: AnalysisProgress | null
  errorMessage: string | null

  // Filter state (post-analysis, client-side)
  selectedAuthors: Set<string>
  selectedFiles: Set<string>

  // Display state
  displayMode: AnalysisDisplayMode
  activeMetric: AnalysisActiveMetric
  activeView: AnalysisView
  showDeletions: boolean
  showRenames: boolean
  scaledPercentages: boolean
}

type AnalysisActions = {
  setConfig: (patch: Partial<AnalysisConfig>) => void
  setSelectedRepoPath: (path: string | null) => void

  setResult: (result: AnalysisResult | null) => void
  setBlameResult: (result: BlameResult | null) => void
  openFileForBlame: (path: string) => void
  closeBlameTargetFile: (path: string) => void
  clearBlameTargetFiles: () => void
  setWorkflowStatus: (status: AnalysisWorkflowStatus) => void
  setProgress: (progress: AnalysisProgress | null) => void
  setErrorMessage: (message: string | null) => void

  setSelectedAuthors: (authors: Set<string>) => void
  toggleAuthor: (personId: string) => void
  selectAllAuthors: () => void
  clearAuthorSelection: () => void

  setSelectedFiles: (files: Set<string>) => void
  toggleFile: (path: string) => void
  selectAllFiles: () => void
  clearFileSelection: () => void

  setDisplayMode: (mode: AnalysisDisplayMode) => void
  setActiveMetric: (metric: AnalysisActiveMetric) => void
  setActiveView: (view: AnalysisView) => void
  setShowDeletions: (show: boolean) => void
  setShowRenames: (show: boolean) => void
  setScaledPercentages: (scaled: boolean) => void

  reset: () => void
}

const initialState: AnalysisState = {
  config: {},
  selectedRepoPath: null,

  result: null,
  blameResult: null,
  blameTargetFiles: [],
  workflowStatus: "idle",
  progress: null,
  errorMessage: null,

  selectedAuthors: new Set(),
  selectedFiles: new Set(),

  displayMode: "absolute",
  activeMetric: "commits",
  activeView: "authors",
  showDeletions: true,
  showRenames: true,
  scaledPercentages: false,
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>(
  (set) => ({
    ...initialState,

    setConfig: (patch) =>
      set((state) => ({ config: { ...state.config, ...patch } })),

    setSelectedRepoPath: (path) => set({ selectedRepoPath: path }),

    setResult: (result) =>
      set({
        result,
        blameResult: null,
        blameTargetFiles: [],
        selectedAuthors: new Set(),
        selectedFiles: new Set(),
      }),
    setBlameResult: (blameResult) => set({ blameResult }),
    openFileForBlame: (path) =>
      set((state) => {
        if (state.blameTargetFiles.includes(path)) {
          return state
        }
        return { blameTargetFiles: [...state.blameTargetFiles, path] }
      }),
    closeBlameTargetFile: (path) =>
      set((state) => ({
        blameTargetFiles: state.blameTargetFiles.filter((p) => p !== path),
      })),
    clearBlameTargetFiles: () => set({ blameTargetFiles: [] }),
    setWorkflowStatus: (workflowStatus) => set({ workflowStatus }),
    setProgress: (progress) => set({ progress }),
    setErrorMessage: (errorMessage) => set({ errorMessage }),

    setSelectedAuthors: (selectedAuthors) => set({ selectedAuthors }),
    toggleAuthor: (personId) =>
      set((state) => {
        const next = new Set(state.selectedAuthors)
        if (next.has(personId)) {
          next.delete(personId)
        } else {
          next.add(personId)
        }
        return { selectedAuthors: next }
      }),
    selectAllAuthors: () =>
      set((state) => {
        if (!state.result) return state
        return {
          selectedAuthors: new Set(
            state.result.authorStats.map((a) => a.personId),
          ),
        }
      }),
    clearAuthorSelection: () => set({ selectedAuthors: new Set() }),

    setSelectedFiles: (selectedFiles) => set({ selectedFiles }),
    toggleFile: (path) =>
      set((state) => {
        const next = new Set(state.selectedFiles)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return { selectedFiles: next }
      }),
    selectAllFiles: () =>
      set((state) => {
        if (!state.result) return state
        return {
          selectedFiles: new Set(state.result.fileStats.map((f) => f.path)),
        }
      }),
    clearFileSelection: () => set({ selectedFiles: new Set() }),

    setDisplayMode: (displayMode) => set({ displayMode }),
    setActiveMetric: (activeMetric) => set({ activeMetric }),
    setActiveView: (activeView) => set({ activeView }),
    setShowDeletions: (showDeletions) => set({ showDeletions }),
    setShowRenames: (showRenames) => set({ showRenames }),
    setScaledPercentages: (scaledPercentages) => set({ scaledPercentages }),

    reset: () => set(initialState),
  }),
)

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectFilteredAuthorStats = (
  state: AnalysisState & AnalysisActions,
): AuthorStats[] => {
  if (!state.result) return []
  const { authorStats } = state.result
  if (state.selectedAuthors.size === 0) return authorStats
  return authorStats.filter((a) => state.selectedAuthors.has(a.personId))
}

export const selectFilteredFileStats = (
  state: AnalysisState & AnalysisActions,
): FileStats[] => {
  if (!state.result) return []
  const { fileStats } = state.result
  if (state.selectedFiles.size === 0) return fileStats
  return fileStats.filter((f) => state.selectedFiles.has(f.path))
}

export type AuthorDisplayIdentity = {
  name: string
  email: string
}

function uniqueNormalized(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length === 0) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export const selectAuthorDisplayByPersonId = (
  state: AnalysisState & AnalysisActions,
): Map<string, AuthorDisplayIdentity> => {
  const map = new Map<string, AuthorDisplayIdentity>()
  if (!state.result) return map

  const personById = new Map(
    state.result.personDbBaseline.persons.map((person) => [person.id, person]),
  )
  const showRenames = state.showRenames

  for (const stat of state.result.authorStats) {
    const person = personById.get(stat.personId)
    if (!person || !showRenames) {
      map.set(stat.personId, {
        name: stat.canonicalName,
        email: stat.canonicalEmail,
      })
      continue
    }

    const names = uniqueNormalized([
      person.canonicalName,
      ...person.aliases.map((alias) => alias.name),
    ])
    const emails = uniqueNormalized([
      person.canonicalEmail,
      ...person.aliases.map((alias) => alias.email),
    ])

    map.set(stat.personId, {
      name: names.join(" | "),
      email: emails.join(" | "),
    })
  }

  return map
}
