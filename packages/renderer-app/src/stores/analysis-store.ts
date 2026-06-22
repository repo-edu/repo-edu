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

export type AnalysisDiscoveryOutcome = "none" | "completed" | "cancelled"
export type AnalysisDiscoveryCommandOutcome = Exclude<
  AnalysisDiscoveryOutcome,
  "completed"
>

export type AnalysisDiscoveryRequest = {
  readonly folder: string
  readonly depth: number
}

type DiscoveredRepoPath = {
  readonly path: string
}

export type AnalysisState = {
  selectedRepoPaths: Map<string, string>
  pendingRepoDiscoveryRequestsByScope: Map<string, AnalysisDiscoveryRequest>
  lastDiscoveryOutcomesByScope: Map<string, AnalysisDiscoveryCommandOutcome>
  autoDiscoveryRequestsByScope: Map<string, AnalysisDiscoveryRequest>
  searchDepth: number
  blameConfig: AnalysisBlameConfig

  activeBlameFiles: Map<string, string>
  focusedFilePaths: Map<string, string>

  blameShowMetadata: boolean
  blameColorize: boolean
  blameSyntaxColorize: boolean
  blameHideEmpty: boolean
  blameHideComments: boolean
  blameVisibleAuthorsByScope: Map<string, Set<string>>

  selectedAuthorsByScope: Map<string, Set<string>>
  fileSelectionModesByScope: Map<string, AnalysisFileSelectionMode>
  selectedFilesByScope: Map<string, Set<string>>

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
  setPendingRepoDiscoveryRequest: (
    scopeKey: string,
    request: AnalysisDiscoveryRequest | null,
  ) => void
  setLastDiscoveryOutcome: (
    scopeKey: string,
    outcome: AnalysisDiscoveryCommandOutcome,
  ) => void
  markAutoDiscoveryRequest: (
    scopeKey: string,
    request: AnalysisDiscoveryRequest,
  ) => void
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
    selectedRepoPaths: new Map(),
    pendingRepoDiscoveryRequestsByScope: new Map(),
    lastDiscoveryOutcomesByScope: new Map(),
    autoDiscoveryRequestsByScope: new Map(),
    searchDepth: 5,
    blameConfig: {
      copyMove: DEFAULT_BLAME_COPY_MOVE,
    },
    activeBlameFiles: new Map(),
    focusedFilePaths: new Map(),
    blameShowMetadata: true,
    blameColorize: true,
    blameSyntaxColorize: true,
    blameHideEmpty: false,
    blameHideComments: false,
    blameVisibleAuthorsByScope: new Map(),
    selectedAuthorsByScope: new Map(),
    fileSelectionModesByScope: new Map(),
    selectedFilesByScope: new Map(),
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
  entries: ReadonlyMap<string, T>,
  scopeKey: string | null,
): T | null {
  if (scopeKey === null) return null
  return entries.get(scopeKey) ?? null
}

export function selectSelectedRepoPathForScope(
  state: AnalysisState,
  scopeKey: string,
): string | null {
  return selectScopedValue(state.selectedRepoPaths, scopeKey)
}

export function selectPendingRepoDiscoveryRequestForScope(
  state: AnalysisState,
  scopeKey: string,
): AnalysisDiscoveryRequest | null {
  return selectScopedValue(state.pendingRepoDiscoveryRequestsByScope, scopeKey)
}

export function selectLastDiscoveryOutcomeForScope(
  state: AnalysisState,
  scopeKey: string,
): AnalysisDiscoveryCommandOutcome {
  return (
    selectScopedValue(state.lastDiscoveryOutcomesByScope, scopeKey) ?? "none"
  )
}

export function selectAutoDiscoveryRequestForScope(
  state: AnalysisState,
  scopeKey: string,
): AnalysisDiscoveryRequest | null {
  return selectScopedValue(state.autoDiscoveryRequestsByScope, scopeKey)
}

export function analysisDiscoveryRequestsEqual(
  left: AnalysisDiscoveryRequest | null,
  right: AnalysisDiscoveryRequest | null,
): boolean {
  if (left === null || right === null) return left === right
  return left.folder === right.folder && left.depth === right.depth
}

export function selectEffectiveSelectedRepoPath(params: {
  storedRepoPath: string | null
  discoveredRepos: readonly DiscoveredRepoPath[]
}): string | null {
  const { storedRepoPath, discoveredRepos } = params
  if (
    storedRepoPath !== null &&
    discoveredRepos.some((repo) => repo.path === storedRepoPath)
  ) {
    return storedRepoPath
  }
  return discoveredRepos[0]?.path ?? null
}

export function selectActiveBlameFileForScope(
  state: AnalysisState,
  scopeKey: string | null,
): string | null {
  return selectScopedValue(state.activeBlameFiles, scopeKey)
}

export function selectFocusedFilePathForScope(
  state: AnalysisState,
  scopeKey: string | null,
): string | null {
  return selectScopedValue(state.focusedFilePaths, scopeKey)
}

export function selectBlameVisibleAuthorsForScope(
  state: AnalysisState,
  scopeKey: string | null,
): ReadonlySet<string> | null {
  return selectScopedValue(state.blameVisibleAuthorsByScope, scopeKey)
}

export function selectSelectedAuthorsForScope(
  state: AnalysisState,
  scopeKey: string | null,
): ReadonlySet<string> {
  return (
    selectScopedValue(state.selectedAuthorsByScope, scopeKey) ??
    EMPTY_STRING_SET
  )
}

export function selectFileSelectionModeForScope(
  state: AnalysisState,
  scopeKey: string | null,
): AnalysisFileSelectionMode {
  return selectScopedValue(state.fileSelectionModesByScope, scopeKey) ?? "all"
}

export function selectSelectedFilesForScope(
  state: AnalysisState,
  scopeKey: string | null,
): ReadonlySet<string> {
  return (
    selectScopedValue(state.selectedFilesByScope, scopeKey) ?? EMPTY_STRING_SET
  )
}

function nextScopedMap<T>(
  map: ReadonlyMap<string, T>,
  scopeKey: string,
  value: T | null,
): Map<string, T> {
  const next = new Map(map)
  if (value === null) {
    next.delete(scopeKey)
  } else {
    next.set(scopeKey, value)
  }
  return next
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>(
  (set) => ({
    ...createInitialAnalysisState(),

    setSelectedRepoPath: (scopeKey, path) =>
      set((state) => ({
        selectedRepoPaths: nextScopedMap(
          state.selectedRepoPaths,
          scopeKey,
          path,
        ),
      })),
    setPendingRepoDiscoveryRequest: (scopeKey, request) =>
      set((state) => ({
        pendingRepoDiscoveryRequestsByScope: nextScopedMap(
          state.pendingRepoDiscoveryRequestsByScope,
          scopeKey,
          request,
        ),
      })),
    setLastDiscoveryOutcome: (scopeKey, outcome) =>
      set((state) => ({
        lastDiscoveryOutcomesByScope: nextScopedMap(
          state.lastDiscoveryOutcomesByScope,
          scopeKey,
          outcome === "none" ? null : outcome,
        ),
      })),
    markAutoDiscoveryRequest: (scopeKey, request) =>
      set((state) => ({
        autoDiscoveryRequestsByScope: nextScopedMap(
          state.autoDiscoveryRequestsByScope,
          scopeKey,
          request,
        ),
      })),
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setBlameConfig: (patch) =>
      set((state) => ({
        blameConfig: { ...state.blameConfig, ...patch },
      })),

    openFileForBlame: (scopeKey, path) =>
      set((state) => ({
        activeBlameFiles: nextScopedMap(state.activeBlameFiles, scopeKey, path),
        focusedFilePaths: nextScopedMap(state.focusedFilePaths, scopeKey, path),
        activeView: "blame",
      })),
    setFocusedFilePath: (scopeKey, path) =>
      set((state) => ({
        focusedFilePaths: nextScopedMap(state.focusedFilePaths, scopeKey, path),
      })),

    setBlameShowMetadata: (blameShowMetadata) => set({ blameShowMetadata }),
    setBlameColorize: (blameColorize) => set({ blameColorize }),
    setBlameSyntaxColorize: (blameSyntaxColorize) =>
      set({ blameSyntaxColorize }),
    setBlameHideEmpty: (blameHideEmpty) => set({ blameHideEmpty }),
    setBlameHideComments: (blameHideComments) => set({ blameHideComments }),
    toggleBlameAuthorVisible: (scopeKey, personId, allPersonIds) =>
      set((state) => {
        const current =
          state.blameVisibleAuthorsByScope.get(scopeKey) ??
          new Set(allPersonIds)
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
          blameVisibleAuthorsByScope: nextScopedMap(
            state.blameVisibleAuthorsByScope,
            scopeKey,
            allVisible ? null : next,
          ),
        }
      }),

    setSelectedAuthors: (scopeKey, selectedAuthors) =>
      set((state) => ({
        selectedAuthorsByScope: nextScopedMap(
          state.selectedAuthorsByScope,
          scopeKey,
          selectedAuthors,
        ),
      })),
    toggleAuthor: (scopeKey, personId) =>
      set((state) => {
        const current =
          state.selectedAuthorsByScope.get(scopeKey) ?? new Set<string>()
        const next = new Set(current)
        if (next.has(personId)) {
          next.delete(personId)
        } else {
          next.add(personId)
        }
        return {
          selectedAuthorsByScope: nextScopedMap(
            state.selectedAuthorsByScope,
            scopeKey,
            next,
          ),
        }
      }),
    clearAuthorSelection: (scopeKey) =>
      set((state) => ({
        selectedAuthorsByScope: nextScopedMap(
          state.selectedAuthorsByScope,
          scopeKey,
          new Set(),
        ),
      })),

    setSelectedFiles: (scopeKey, selectedFiles) =>
      set((state) => ({
        fileSelectionModesByScope: nextScopedMap(
          state.fileSelectionModesByScope,
          scopeKey,
          "subset",
        ),
        selectedFilesByScope: nextScopedMap(
          state.selectedFilesByScope,
          scopeKey,
          selectedFiles,
        ),
      })),
    clearFileSelection: (scopeKey) =>
      set((state) => ({
        fileSelectionModesByScope: nextScopedMap(
          state.fileSelectionModesByScope,
          scopeKey,
          "all",
        ),
        selectedFilesByScope: nextScopedMap(
          state.selectedFilesByScope,
          scopeKey,
          new Set<string>(),
        ),
      })),

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
