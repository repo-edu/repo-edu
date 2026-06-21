import type { AnalysisBlameConfig } from "@repo-edu/domain/analysis"
import type { PersistedAnalysisSidebarSettings } from "@repo-edu/domain/settings"
import { create } from "zustand"

const DEFAULT_BLAME_COPY_MOVE = 1

export type AnalysisActiveMetric =
  | "commits"
  | "insertions"
  | "deletions"
  | "linesOfCode"

export type AnalysisDisplayMode = "absolute" | "percentage"

export type AnalysisView = "authors" | "files" | "blame" | "examination"

export type AnalysisFileSelectionMode = "all" | "subset"

export type AnalysisState = {
  selectedRepoPath: string | null
  searchDepth: number
  blameConfig: AnalysisBlameConfig

  activeBlameFile: string | null
  focusedFilePath: string | null

  blameShowMetadata: boolean
  blameColorize: boolean
  blameSyntaxColorize: boolean
  blameHideEmpty: boolean
  blameHideComments: boolean
  blameVisibleAuthors: Set<string> | null

  selectedAuthors: Set<string>
  fileSelectionMode: AnalysisFileSelectionMode
  selectedFiles: Set<string>

  displayMode: AnalysisDisplayMode
  activeView: AnalysisView
  chartMetric: AnalysisActiveMetric
  showCommits: boolean
  showInsertions: boolean
  showDeletions: boolean
  showLinesOfCode: boolean
  showRenames: boolean
  showEmail: boolean
  showRosterMatch: boolean
  showAge: boolean
}

export type AnalysisActions = {
  setSelectedRepoPath: (path: string | null) => void
  setSearchDepth: (depth: number) => void
  setBlameConfig: (patch: Partial<AnalysisBlameConfig>) => void

  openFileForBlame: (path: string) => void
  setFocusedFilePath: (path: string | null) => void

  setBlameShowMetadata: (show: boolean) => void
  setBlameColorize: (colorize: boolean) => void
  setBlameSyntaxColorize: (colorize: boolean) => void
  setBlameHideEmpty: (hide: boolean) => void
  setBlameHideComments: (hide: boolean) => void
  toggleBlameAuthorVisible: (personId: string, allPersonIds: string[]) => void

  setSelectedAuthors: (authors: Set<string>) => void
  toggleAuthor: (personId: string) => void
  clearAuthorSelection: () => void

  setSelectedFiles: (files: Set<string>) => void
  clearFileSelection: () => void

  setDisplayMode: (mode: AnalysisDisplayMode) => void
  setActiveView: (view: AnalysisView) => void
  setChartMetric: (metric: AnalysisActiveMetric) => void
  setShowCommits: (show: boolean) => void
  setShowInsertions: (show: boolean) => void
  setShowDeletions: (show: boolean) => void
  setShowLinesOfCode: (show: boolean) => void
  setShowRenames: (show: boolean) => void
  setShowEmail: (show: boolean) => void
  setShowRosterMatch: (show: boolean) => void
  setShowAge: (show: boolean) => void

  hydrateFromPersistedSettings: (
    settings: PersistedAnalysisSidebarSettings,
  ) => void
  reset: () => void
}

function createInitialAnalysisState(): AnalysisState {
  return {
    selectedRepoPath: null,
    searchDepth: 5,
    blameConfig: {
      copyMove: DEFAULT_BLAME_COPY_MOVE,
    },
    activeBlameFile: null,
    focusedFilePath: null,
    blameShowMetadata: true,
    blameColorize: true,
    blameSyntaxColorize: true,
    blameHideEmpty: false,
    blameHideComments: false,
    blameVisibleAuthors: null,
    selectedAuthors: new Set(),
    fileSelectionMode: "all",
    selectedFiles: new Set(),
    displayMode: "absolute",
    activeView: "authors",
    chartMetric: "linesOfCode",
    showCommits: true,
    showInsertions: true,
    showDeletions: false,
    showLinesOfCode: true,
    showRenames: true,
    showEmail: true,
    showRosterMatch: true,
    showAge: false,
  }
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>(
  (set) => ({
    ...createInitialAnalysisState(),

    setSelectedRepoPath: (selectedRepoPath) => set({ selectedRepoPath }),
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setBlameConfig: (patch) =>
      set((state) => ({
        blameConfig: { ...state.blameConfig, ...patch },
      })),

    openFileForBlame: (path) =>
      set({
        activeBlameFile: path,
        focusedFilePath: path,
        activeView: "blame",
      }),
    setFocusedFilePath: (focusedFilePath) => set({ focusedFilePath }),

    setBlameShowMetadata: (blameShowMetadata) => set({ blameShowMetadata }),
    setBlameColorize: (blameColorize) => set({ blameColorize }),
    setBlameSyntaxColorize: (blameSyntaxColorize) =>
      set({ blameSyntaxColorize }),
    setBlameHideEmpty: (blameHideEmpty) => set({ blameHideEmpty }),
    setBlameHideComments: (blameHideComments) => set({ blameHideComments }),
    toggleBlameAuthorVisible: (personId, allPersonIds) =>
      set((state) => {
        const current = state.blameVisibleAuthors ?? new Set(allPersonIds)
        const next = new Set(current)
        if (next.has(personId)) {
          next.delete(personId)
        } else {
          next.add(personId)
        }
        const allVisible =
          allPersonIds.length > 0 &&
          next.size === allPersonIds.length &&
          allPersonIds.every((id) => next.has(id))
        return { blameVisibleAuthors: allVisible ? null : next }
      }),

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
    clearAuthorSelection: () => set({ selectedAuthors: new Set() }),

    setSelectedFiles: (selectedFiles) =>
      set({
        fileSelectionMode: "subset",
        selectedFiles,
      }),
    clearFileSelection: () =>
      set({
        fileSelectionMode: "all",
        selectedFiles: new Set<string>(),
      }),

    setDisplayMode: (displayMode) => set({ displayMode }),
    setActiveView: (activeView) => set({ activeView }),
    setChartMetric: (chartMetric) => set({ chartMetric }),
    setShowCommits: (showCommits) => set({ showCommits }),
    setShowInsertions: (showInsertions) => set({ showInsertions }),
    setShowDeletions: (showDeletions) => set({ showDeletions }),
    setShowLinesOfCode: (showLinesOfCode) => set({ showLinesOfCode }),
    setShowRenames: (showRenames) => set({ showRenames }),
    setShowEmail: (showEmail) => set({ showEmail }),
    setShowRosterMatch: (showRosterMatch) => set({ showRosterMatch }),
    setShowAge: (showAge) => set({ showAge }),

    hydrateFromPersistedSettings: (settings) =>
      set({
        searchDepth: settings.searchDepth,
        blameConfig: {
          copyMove: settings.blameConfig.copyMove ?? DEFAULT_BLAME_COPY_MOVE,
        },
      }),

    reset: () => set(createInitialAnalysisState()),
  }),
)
