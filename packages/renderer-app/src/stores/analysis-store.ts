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

export type ScopedAnalysisValue<T> = {
  scopeKey: string
  value: T
}

export type AnalysisState = {
  selectedRepoPath: ScopedAnalysisValue<string> | null
  searchDepth: number
  blameConfig: AnalysisBlameConfig

  activeBlameFile: ScopedAnalysisValue<string> | null
  focusedFilePath: ScopedAnalysisValue<string> | null

  blameShowMetadata: boolean
  blameColorize: boolean
  blameSyntaxColorize: boolean
  blameHideEmpty: boolean
  blameHideComments: boolean
  blameVisibleAuthors: ScopedAnalysisValue<Set<string> | null> | null

  selectedAuthors: ScopedAnalysisValue<Set<string>> | null
  fileSelectionMode: ScopedAnalysisValue<AnalysisFileSelectionMode> | null
  selectedFiles: ScopedAnalysisValue<Set<string>> | null

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
  setSelectedRepoPath: (scopeKey: string, path: string | null) => void
  setSearchDepth: (depth: number) => void
  setBlameConfig: (patch: Partial<AnalysisBlameConfig>) => void

  openFileForBlame: (scopeKey: string, path: string) => void
  setFocusedFilePath: (scopeKey: string, path: string | null) => void

  setBlameShowMetadata: (show: boolean) => void
  setBlameColorize: (colorize: boolean) => void
  setBlameSyntaxColorize: (colorize: boolean) => void
  setBlameHideEmpty: (hide: boolean) => void
  setBlameHideComments: (hide: boolean) => void
  toggleBlameAuthorVisible: (
    scopeKey: string,
    personId: string,
    allPersonIds: string[],
  ) => void

  setSelectedAuthors: (scopeKey: string, authors: Set<string>) => void
  toggleAuthor: (scopeKey: string, personId: string) => void
  clearAuthorSelection: (scopeKey: string) => void

  setSelectedFiles: (scopeKey: string, files: Set<string>) => void
  clearFileSelection: (scopeKey: string) => void

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
    selectedAuthors: null,
    fileSelectionMode: null,
    selectedFiles: null,
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

const EMPTY_STRING_SET: ReadonlySet<string> = new Set()

function selectScopedValue<T>(
  entry: ScopedAnalysisValue<T> | null,
  scopeKey: string | null,
): T | null {
  if (scopeKey === null || entry?.scopeKey !== scopeKey) return null
  return entry.value
}

export function selectSelectedRepoPathForScope(
  state: AnalysisState,
  scopeKey: string,
): string | null {
  return selectScopedValue(state.selectedRepoPath, scopeKey)
}

export function selectActiveBlameFileForScope(
  state: AnalysisState,
  scopeKey: string | null,
): string | null {
  return selectScopedValue(state.activeBlameFile, scopeKey)
}

export function selectFocusedFilePathForScope(
  state: AnalysisState,
  scopeKey: string | null,
): string | null {
  return selectScopedValue(state.focusedFilePath, scopeKey)
}

export function selectBlameVisibleAuthorsForScope(
  state: AnalysisState,
  scopeKey: string | null,
): ReadonlySet<string> | null {
  return selectScopedValue(state.blameVisibleAuthors, scopeKey)
}

export function selectSelectedAuthorsForScope(
  state: AnalysisState,
  scopeKey: string | null,
): ReadonlySet<string> {
  return selectScopedValue(state.selectedAuthors, scopeKey) ?? EMPTY_STRING_SET
}

export function selectFileSelectionModeForScope(
  state: AnalysisState,
  scopeKey: string | null,
): AnalysisFileSelectionMode {
  return selectScopedValue(state.fileSelectionMode, scopeKey) ?? "all"
}

export function selectSelectedFilesForScope(
  state: AnalysisState,
  scopeKey: string | null,
): ReadonlySet<string> {
  return selectScopedValue(state.selectedFiles, scopeKey) ?? EMPTY_STRING_SET
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>(
  (set) => ({
    ...createInitialAnalysisState(),

    setSelectedRepoPath: (scopeKey, path) =>
      set((state) => {
        if (path !== null) {
          return { selectedRepoPath: { scopeKey, value: path } }
        }
        if (state.selectedRepoPath?.scopeKey !== scopeKey) return state
        return { selectedRepoPath: null }
      }),
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setBlameConfig: (patch) =>
      set((state) => ({
        blameConfig: { ...state.blameConfig, ...patch },
      })),

    openFileForBlame: (scopeKey, path) =>
      set({
        activeBlameFile: { scopeKey, value: path },
        focusedFilePath: { scopeKey, value: path },
        activeView: "blame",
      }),
    setFocusedFilePath: (scopeKey, path) =>
      set((state) => {
        if (path !== null) {
          return { focusedFilePath: { scopeKey, value: path } }
        }
        if (state.focusedFilePath?.scopeKey !== scopeKey) return state
        return { focusedFilePath: null }
      }),

    setBlameShowMetadata: (blameShowMetadata) => set({ blameShowMetadata }),
    setBlameColorize: (blameColorize) => set({ blameColorize }),
    setBlameSyntaxColorize: (blameSyntaxColorize) =>
      set({ blameSyntaxColorize }),
    setBlameHideEmpty: (blameHideEmpty) => set({ blameHideEmpty }),
    setBlameHideComments: (blameHideComments) => set({ blameHideComments }),
    toggleBlameAuthorVisible: (scopeKey, personId, allPersonIds) =>
      set((state) => {
        const current =
          state.blameVisibleAuthors?.scopeKey === scopeKey
            ? (state.blameVisibleAuthors.value ?? new Set(allPersonIds))
            : new Set(allPersonIds)
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
        return {
          blameVisibleAuthors: {
            scopeKey,
            value: allVisible ? null : next,
          },
        }
      }),

    setSelectedAuthors: (scopeKey, selectedAuthors) =>
      set({ selectedAuthors: { scopeKey, value: selectedAuthors } }),
    toggleAuthor: (scopeKey, personId) =>
      set((state) => {
        const current =
          state.selectedAuthors?.scopeKey === scopeKey
            ? state.selectedAuthors.value
            : new Set<string>()
        const next = new Set(current)
        if (next.has(personId)) {
          next.delete(personId)
        } else {
          next.add(personId)
        }
        return { selectedAuthors: { scopeKey, value: next } }
      }),
    clearAuthorSelection: (scopeKey) =>
      set({ selectedAuthors: { scopeKey, value: new Set() } }),

    setSelectedFiles: (scopeKey, selectedFiles) =>
      set({
        fileSelectionMode: { scopeKey, value: "subset" },
        selectedFiles: { scopeKey, value: selectedFiles },
      }),
    clearFileSelection: (scopeKey) =>
      set({
        fileSelectionMode: { scopeKey, value: "all" },
        selectedFiles: { scopeKey, value: new Set<string>() },
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
