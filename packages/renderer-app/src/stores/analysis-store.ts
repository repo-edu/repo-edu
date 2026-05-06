import type {
  AnalysisProgress,
  DiscoveredRepo,
} from "@repo-edu/application-contract"
import type {
  AnalysisBlameConfig,
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileBlame,
  FileStats,
  IdentityMatch,
} from "@repo-edu/domain/analysis"
import type { PersistedAnalysisSidebarSettings } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import { create } from "zustand"
import { authorColorMap } from "../utils/author-colors.js"

const DEFAULT_BLAME_COPY_MOVE = 1

export type AnalysisActiveMetric =
  | "commits"
  | "insertions"
  | "deletions"
  | "linesOfCode"

export type AnalysisDisplayMode = "absolute" | "percentage"

export type AnalysisView = "authors" | "files" | "blame" | "examination"

export type AnalysisWorkflowStatus = "idle" | "running" | "error"
export type AnalysisFileSelectionMode = "all" | "subset"

export type FileBlameEntry = {
  status: "pending" | "loaded" | "error"
  fileBlame: FileBlame | null
  errorMessage: string | null
}

type PerRepoBlameState = {
  blameResult: BlameResult | null
  blameTargetFiles: string[]
  blameFileResults: Map<string, FileBlameEntry>
  activeBlameFile: string | null
  blameWorkflowStatus: AnalysisWorkflowStatus
  blameProgress: AnalysisProgress | null
  blamePartialAuthorLines: ReadonlyMap<string, number>
  blameErrorMessage: string | null
  blameContextSnapshot: string | null
  blameVisibleAuthors: Set<string> | null
  asOfCommit: string
  selectedAuthors: Set<string>
  fileSelectionMode: AnalysisFileSelectionMode
  selectedFiles: Set<string>
  focusedFilePath: string | null
}

type PerRepoEntry = PerRepoBlameState & {
  result: AnalysisResult
  configFingerprint: string
}

type AnalysisState = {
  selectedRepoPath: string | null

  // Repo discovery state
  searchDepth: number
  discoveredRepos: DiscoveredRepo[]
  discoveryStatus: "idle" | "loading" | "error"
  discoveryError: string | null
  discoveryCurrentFolder: string | null
  lastDiscoveryOutcome: "none" | "completed" | "cancelled"

  // Per-repo in-flight status — separate from `repoStates` so errors and
  // progress surface for repos that have never completed successfully.
  repoWorkflowStatus: Map<string, AnalysisWorkflowStatus>
  repoProgress: Map<string, AnalysisProgress | null>
  repoErrorMessage: Map<string, string | null>
  repoStates: Map<string, PerRepoEntry>

  // Currently-selected repo flat view (derived from repoStates/repo*)
  result: AnalysisResult | null
  blameResult: BlameResult | null
  blameTargetFiles: string[]
  workflowStatus: AnalysisWorkflowStatus
  progress: AnalysisProgress | null
  errorMessage: string | null

  // Blame config (sent to analysis.blame workflow)
  blameConfig: AnalysisBlameConfig
  asOfCommit: string

  // Per-file blame tracking (currently selected repo)
  blameFileResults: Map<string, FileBlameEntry>
  activeBlameFile: string | null
  blameWorkflowStatus: AnalysisWorkflowStatus
  blameProgress: AnalysisProgress | null
  blamePartialAuthorLines: ReadonlyMap<string, number>
  blameErrorMessage: string | null
  blameContextSnapshot: string | null

  // Blame display toggles (client-side only, shared across repos)
  blameShowMetadata: boolean
  blameColorize: boolean
  blameSyntaxColorize: boolean
  blameHideEmpty: boolean
  blameHideComments: boolean
  blameVisibleAuthors: Set<string> | null

  // Filter state (post-analysis, client-side, currently selected repo)
  selectedAuthors: Set<string>
  fileSelectionMode: AnalysisFileSelectionMode
  selectedFiles: Set<string>
  focusedFilePath: string | null

  // Display state (shared across repos)
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

type AnalysisActions = {
  setSelectedRepoPath: (path: string | null) => void

  // Repo discovery
  setSearchDepth: (depth: number) => void
  setDiscoveredRepos: (repos: DiscoveredRepo[]) => void
  setDiscoveryStatus: (status: "idle" | "loading" | "error") => void
  setDiscoveryError: (error: string | null) => void
  setDiscoveryCurrentFolder: (folder: string | null) => void
  setLastDiscoveryOutcome: (outcome: "none" | "completed" | "cancelled") => void

  setResult: (result: AnalysisResult | null, configFingerprint?: string) => void
  setResultForRepo: (
    repoPath: string,
    result: AnalysisResult,
    configFingerprint: string,
  ) => void
  pruneStaleResultsByFingerprint: (currentFingerprint: string) => void
  setBlameResult: (result: BlameResult | null) => void
  openFileForBlame: (path: string) => void
  setWorkflowStatus: (status: AnalysisWorkflowStatus) => void
  setWorkflowStatusForRepo: (
    repoPath: string,
    status: AnalysisWorkflowStatus,
  ) => void
  setProgress: (progress: AnalysisProgress | null) => void
  setProgressForRepo: (
    repoPath: string,
    progress: AnalysisProgress | null,
  ) => void
  setErrorMessage: (message: string | null) => void
  setErrorMessageForRepo: (repoPath: string, message: string | null) => void

  clearAllRepoStates: () => void

  // Blame config
  setBlameConfig: (patch: Partial<AnalysisBlameConfig>) => void
  setAsOfCommit: (oid: string) => void

  // Per-file blame tracking
  setBlameFileResult: (path: string, entry: FileBlameEntry) => void
  clearBlameFileResults: () => void
  setBlameWorkflowStatus: (status: AnalysisWorkflowStatus) => void
  setBlameProgress: (progress: AnalysisProgress | null) => void
  setBlamePartialAuthorLines: (lines: ReadonlyMap<string, number>) => void
  setBlameErrorMessage: (message: string | null) => void
  setBlameContextSnapshot: (snapshot: string | null) => void

  // Blame display toggles
  setBlameShowMetadata: (show: boolean) => void
  setBlameColorize: (colorize: boolean) => void
  setBlameSyntaxColorize: (colorize: boolean) => void
  setBlameHideEmpty: (hide: boolean) => void
  setBlameHideComments: (hide: boolean) => void
  toggleBlameAuthorVisible: (personId: string, allPersonIds: string[]) => void

  setSelectedAuthors: (authors: Set<string>) => void
  toggleAuthor: (personId: string) => void
  selectAllAuthors: () => void
  clearAuthorSelection: () => void

  setFocusedFilePath: (path: string | null) => void
  setSelectedFiles: (files: Set<string>) => void
  toggleFile: (path: string) => void
  selectAllFiles: () => void
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
  resetAnalysisContext: () => void
  reset: () => void
}

const EMPTY_PARTIAL_AUTHOR_LINES: ReadonlyMap<string, number> = new Map()

const DEFAULT_BLAME_STATE: PerRepoBlameState = {
  blameResult: null,
  blameTargetFiles: [],
  blameFileResults: new Map(),
  activeBlameFile: null,
  blameWorkflowStatus: "idle",
  blameProgress: null,
  blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
  blameErrorMessage: null,
  blameContextSnapshot: null,
  blameVisibleAuthors: null,
  asOfCommit: "",
  selectedAuthors: new Set(),
  fileSelectionMode: "all",
  selectedFiles: new Set(),
  focusedFilePath: null,
}

const initialState: AnalysisState = {
  selectedRepoPath: null,

  searchDepth: 5,
  discoveredRepos: [],
  discoveryStatus: "idle",
  discoveryError: null,
  discoveryCurrentFolder: null,
  lastDiscoveryOutcome: "none",

  repoWorkflowStatus: new Map(),
  repoProgress: new Map(),
  repoErrorMessage: new Map(),
  repoStates: new Map(),

  result: null,
  blameResult: null,
  blameTargetFiles: [],
  workflowStatus: "idle",
  progress: null,
  errorMessage: null,

  blameConfig: {
    copyMove: DEFAULT_BLAME_COPY_MOVE,
  },
  asOfCommit: "",

  blameFileResults: new Map(),
  activeBlameFile: null,
  blameWorkflowStatus: "idle",
  blameProgress: null,
  blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
  blameErrorMessage: null,
  blameContextSnapshot: null,

  blameShowMetadata: true,
  blameColorize: true,
  blameSyntaxColorize: true,
  blameHideEmpty: false,
  blameHideComments: false,
  blameVisibleAuthors: null,

  selectedAuthors: new Set(),
  fileSelectionMode: "all",
  selectedFiles: new Set(),
  focusedFilePath: null,

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

/**
 * Snapshot the currently-selected repo's per-repo state into `repoStates`
 * so that switching away and back restores it (Phase D1/D2). Updates in
 * place — the existing entry's `result` and `configFingerprint` are
 * preserved, only the blame/filter/focus state is captured.
 */
function snapshotActiveBlameState(
  state: AnalysisState,
): Map<string, PerRepoEntry> {
  const repoPath = state.selectedRepoPath
  if (!repoPath) return state.repoStates
  const existing = state.repoStates.get(repoPath)
  if (!existing) return state.repoStates
  const next = new Map(state.repoStates)
  next.set(repoPath, {
    ...existing,
    blameResult: state.blameResult,
    blameTargetFiles: state.blameTargetFiles,
    blameFileResults: state.blameFileResults,
    activeBlameFile: state.activeBlameFile,
    blameWorkflowStatus: state.blameWorkflowStatus,
    blameProgress: state.blameProgress,
    blamePartialAuthorLines: state.blamePartialAuthorLines,
    blameErrorMessage: state.blameErrorMessage,
    blameContextSnapshot: state.blameContextSnapshot,
    blameVisibleAuthors: state.blameVisibleAuthors,
    asOfCommit: state.asOfCommit,
    selectedAuthors: state.selectedAuthors,
    fileSelectionMode: state.fileSelectionMode,
    selectedFiles: state.selectedFiles,
    focusedFilePath: state.focusedFilePath,
  })
  return next
}

// Abort controllers are coordination primitives, not UI state — kept outside
// Zustand so components cannot accidentally subscribe to them.
export const analysisStoreInternals = {
  analysisAborts: new Map<string, AbortController>(),
  discoveryAbort: null as AbortController | null,
  cancelAll(): void {
    for (const controller of analysisStoreInternals.analysisAborts.values()) {
      controller.abort()
    }
    // Keep handles until each run settles and removes itself. Clearing here
    // breaks `isCurrentRun()` guards and can leave stale UI status.
  },
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>(
  (set) => ({
    ...initialState,

    setSelectedRepoPath: (path) =>
      set((state) => {
        if (state.selectedRepoPath === path) return state
        const snapshot = snapshotActiveBlameState(state)
        if (path === null) {
          return {
            selectedRepoPath: null,
            repoStates: snapshot,
            result: null,
            workflowStatus: "idle",
            progress: null,
            errorMessage: null,
            ...DEFAULT_BLAME_STATE,
          }
        }
        const nextEntry = snapshot.get(path)
        const nextStatus = state.repoWorkflowStatus.get(path) ?? "idle"
        const nextProgress = state.repoProgress.get(path) ?? null
        const nextError = state.repoErrorMessage.get(path) ?? null
        if (nextEntry) {
          return {
            selectedRepoPath: path,
            repoStates: snapshot,
            result: nextEntry.result,
            workflowStatus: nextStatus,
            progress: nextProgress,
            errorMessage: nextError,
            blameResult: nextEntry.blameResult,
            blameTargetFiles: nextEntry.blameTargetFiles,
            blameFileResults: nextEntry.blameFileResults,
            activeBlameFile: nextEntry.activeBlameFile,
            blameWorkflowStatus: nextEntry.blameWorkflowStatus,
            blameProgress: nextEntry.blameProgress,
            blamePartialAuthorLines: nextEntry.blamePartialAuthorLines,
            blameErrorMessage: nextEntry.blameErrorMessage,
            blameContextSnapshot: nextEntry.blameContextSnapshot,
            blameVisibleAuthors: nextEntry.blameVisibleAuthors,
            asOfCommit: nextEntry.asOfCommit,
            selectedAuthors: nextEntry.selectedAuthors,
            fileSelectionMode: nextEntry.fileSelectionMode,
            selectedFiles: nextEntry.selectedFiles,
            focusedFilePath: nextEntry.focusedFilePath,
          }
        }
        return {
          selectedRepoPath: path,
          repoStates: snapshot,
          result: null,
          workflowStatus: nextStatus,
          progress: nextProgress,
          errorMessage: nextError,
          ...DEFAULT_BLAME_STATE,
        }
      }),

    // Repo discovery
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setDiscoveredRepos: (discoveredRepos) => set({ discoveredRepos }),
    setDiscoveryStatus: (discoveryStatus) => set({ discoveryStatus }),
    setDiscoveryError: (discoveryError) => set({ discoveryError }),
    setDiscoveryCurrentFolder: (discoveryCurrentFolder) =>
      set({ discoveryCurrentFolder }),
    setLastDiscoveryOutcome: (lastDiscoveryOutcome) =>
      set({ lastDiscoveryOutcome }),

    setResult: (result, configFingerprint) =>
      set((state) => {
        const repoPath = state.selectedRepoPath
        const nextFlat = {
          result,
          blameResult: null,
          blameTargetFiles: result ? result.fileStats.map((f) => f.path) : [],
          blameFileResults: new Map(),
          activeBlameFile: null,
          blameWorkflowStatus: "idle" as AnalysisWorkflowStatus,
          blameProgress: null,
          blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
          blameErrorMessage: null,
          blameContextSnapshot: null,
          selectedAuthors: new Set<string>(),
          blameVisibleAuthors: null,
          fileSelectionMode: "all" as AnalysisFileSelectionMode,
          selectedFiles: new Set<string>(),
          focusedFilePath: null,
          asOfCommit: result?.resolvedAsOfOid ?? "",
        }
        if (!repoPath) {
          return nextFlat
        }
        const repoStates = new Map(state.repoStates)
        if (result && configFingerprint !== undefined) {
          repoStates.set(repoPath, {
            result,
            configFingerprint,
            blameResult: null,
            blameTargetFiles: result.fileStats.map((f) => f.path),
            blameFileResults: new Map(),
            activeBlameFile: null,
            blameWorkflowStatus: "idle",
            blameProgress: null,
            blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
            blameErrorMessage: null,
            blameContextSnapshot: null,
            blameVisibleAuthors: null,
            asOfCommit: result.resolvedAsOfOid,
            selectedAuthors: new Set<string>(),
            fileSelectionMode: "all",
            selectedFiles: new Set<string>(),
            focusedFilePath: null,
          })
        } else if (result === null) {
          repoStates.delete(repoPath)
        }
        return { ...nextFlat, repoStates }
      }),

    setResultForRepo: (repoPath, result, configFingerprint) =>
      set((state) => {
        const repoStates = new Map(state.repoStates)
        repoStates.set(repoPath, {
          result,
          configFingerprint,
          blameResult: null,
          blameTargetFiles: result.fileStats.map((f) => f.path),
          blameFileResults: new Map(),
          activeBlameFile: null,
          blameWorkflowStatus: "idle",
          blameProgress: null,
          blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
          blameErrorMessage: null,
          blameContextSnapshot: null,
          blameVisibleAuthors: null,
          asOfCommit: result.resolvedAsOfOid,
          selectedAuthors: new Set<string>(),
          fileSelectionMode: "all",
          selectedFiles: new Set<string>(),
          focusedFilePath: null,
        })
        // Mirror into flat fields if this is the selected repo.
        if (state.selectedRepoPath === repoPath) {
          return {
            repoStates,
            result,
            blameResult: null,
            blameTargetFiles: result.fileStats.map((f) => f.path),
            blameFileResults: new Map(),
            activeBlameFile: null,
            blameWorkflowStatus: "idle" as AnalysisWorkflowStatus,
            blameProgress: null,
            blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
            blameErrorMessage: null,
            blameContextSnapshot: null,
            selectedAuthors: new Set<string>(),
            blameVisibleAuthors: null,
            fileSelectionMode: "all" as AnalysisFileSelectionMode,
            selectedFiles: new Set<string>(),
            focusedFilePath: null,
            asOfCommit: result.resolvedAsOfOid,
          }
        }
        return { repoStates }
      }),

    pruneStaleResultsByFingerprint: (currentFingerprint) =>
      set((state) => {
        let changed = false
        const next = new Map(state.repoStates)
        for (const [path, entry] of next) {
          if (entry.configFingerprint !== currentFingerprint) {
            next.delete(path)
            changed = true
          }
        }
        if (!changed) return state
        // Selection is the user's intent and persists across config changes;
        // an auto-rerun (see `setConfigAndRerun` in AnalysisSidebar) repopulates
        // the result via setResultForRepo, which mirrors into the flat fields
        // only while selectedRepoPath still matches the repo being analyzed.
        const isSelectedRemoved =
          state.selectedRepoPath !== null && !next.has(state.selectedRepoPath)
        if (!isSelectedRemoved) {
          return { repoStates: next }
        }
        return {
          repoStates: next,
          result: null,
          blameResult: null,
          blameTargetFiles: [],
          blameFileResults: new Map(),
          activeBlameFile: null,
          blameWorkflowStatus: "idle",
          blameProgress: null,
          blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
          blameErrorMessage: null,
          blameContextSnapshot: null,
          selectedAuthors: new Set(),
          blameVisibleAuthors: null,
          fileSelectionMode: "all",
          selectedFiles: new Set(),
          focusedFilePath: null,
        }
      }),

    setBlameResult: (blameResult) => set({ blameResult }),
    openFileForBlame: (path) =>
      set({
        activeBlameFile: path,
        focusedFilePath: path,
        activeView: "blame",
      }),
    setWorkflowStatus: (workflowStatus) =>
      set((state) => {
        const next = new Map(state.repoWorkflowStatus)
        if (state.selectedRepoPath) {
          next.set(state.selectedRepoPath, workflowStatus)
        }
        return { workflowStatus, repoWorkflowStatus: next }
      }),
    setWorkflowStatusForRepo: (repoPath, status) =>
      set((state) => {
        const next = new Map(state.repoWorkflowStatus)
        next.set(repoPath, status)
        if (state.selectedRepoPath === repoPath) {
          return { repoWorkflowStatus: next, workflowStatus: status }
        }
        return { repoWorkflowStatus: next }
      }),
    setProgress: (progress) =>
      set((state) => {
        const next = new Map(state.repoProgress)
        if (state.selectedRepoPath) {
          next.set(state.selectedRepoPath, progress)
        }
        return { progress, repoProgress: next }
      }),
    setProgressForRepo: (repoPath, progress) =>
      set((state) => {
        const next = new Map(state.repoProgress)
        next.set(repoPath, progress)
        if (state.selectedRepoPath === repoPath) {
          return { repoProgress: next, progress }
        }
        return { repoProgress: next }
      }),
    setErrorMessage: (errorMessage) =>
      set((state) => {
        const next = new Map(state.repoErrorMessage)
        if (state.selectedRepoPath) {
          next.set(state.selectedRepoPath, errorMessage)
        }
        return { errorMessage, repoErrorMessage: next }
      }),
    setErrorMessageForRepo: (repoPath, message) =>
      set((state) => {
        const next = new Map(state.repoErrorMessage)
        next.set(repoPath, message)
        if (state.selectedRepoPath === repoPath) {
          return { repoErrorMessage: next, errorMessage: message }
        }
        return { repoErrorMessage: next }
      }),

    clearAllRepoStates: () =>
      set({
        selectedRepoPath: null,
        repoStates: new Map(),
        repoWorkflowStatus: new Map(),
        repoProgress: new Map(),
        repoErrorMessage: new Map(),
        result: null,
        blameResult: null,
        blameTargetFiles: [],
        blameFileResults: new Map(),
        activeBlameFile: null,
        blameWorkflowStatus: "idle",
        blameProgress: null,
        blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
        blameErrorMessage: null,
        blameContextSnapshot: null,
        workflowStatus: "idle",
        progress: null,
        errorMessage: null,
        selectedAuthors: new Set(),
        blameVisibleAuthors: null,
        fileSelectionMode: "all",
        selectedFiles: new Set(),
        focusedFilePath: null,
      }),

    // Blame config
    setBlameConfig: (patch) =>
      set((state) => ({
        blameConfig: { ...state.blameConfig, ...patch },
      })),
    setAsOfCommit: (asOfCommit) => set({ asOfCommit }),

    // Per-file blame tracking
    setBlameFileResult: (path, entry) =>
      set((state) => {
        const next = new Map(state.blameFileResults)
        next.set(path, entry)
        return { blameFileResults: next }
      }),
    clearBlameFileResults: () => set({ blameFileResults: new Map() }),
    setBlameWorkflowStatus: (blameWorkflowStatus) =>
      set({ blameWorkflowStatus }),
    setBlameProgress: (blameProgress) => set({ blameProgress }),
    setBlamePartialAuthorLines: (blamePartialAuthorLines) =>
      set({ blamePartialAuthorLines }),
    setBlameErrorMessage: (blameErrorMessage) => set({ blameErrorMessage }),
    setBlameContextSnapshot: (blameContextSnapshot) =>
      set({ blameContextSnapshot }),

    // Blame display toggles
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

    setFocusedFilePath: (focusedFilePath) => set({ focusedFilePath }),
    setSelectedFiles: (selectedFiles) =>
      set({
        fileSelectionMode: "subset",
        selectedFiles,
      }),
    toggleFile: (path) =>
      set((state) => {
        const allPaths = state.result?.fileStats.map((f) => f.path) ?? []
        const next =
          state.fileSelectionMode === "all"
            ? new Set(allPaths)
            : new Set(state.selectedFiles)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }

        if (
          allPaths.length > 0 &&
          next.size >= allPaths.length &&
          allPaths.every((filePath) => next.has(filePath))
        ) {
          return {
            fileSelectionMode: "all",
            selectedFiles: new Set<string>(),
          }
        }

        return {
          fileSelectionMode: "subset",
          selectedFiles: next,
        }
      }),
    selectAllFiles: () =>
      set(() => {
        return {
          fileSelectionMode: "all",
          selectedFiles: new Set<string>(),
        }
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

    resetAnalysisContext: () => {
      analysisStoreInternals.cancelAll()
      analysisStoreInternals.discoveryAbort?.abort()
      analysisStoreInternals.discoveryAbort = null
      set({
        selectedRepoPath: null,
        discoveredRepos: [],
        discoveryStatus: "idle",
        discoveryError: null,
        discoveryCurrentFolder: null,
        lastDiscoveryOutcome: "none",
        repoStates: new Map(),
        repoWorkflowStatus: new Map(),
        repoProgress: new Map(),
        repoErrorMessage: new Map(),
        result: null,
        blameResult: null,
        blameTargetFiles: [],
        blameFileResults: new Map(),
        activeBlameFile: null,
        workflowStatus: "idle",
        progress: null,
        errorMessage: null,
        blameWorkflowStatus: "idle",
        blameProgress: null,
        blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
        blameErrorMessage: null,
        blameContextSnapshot: null,
        asOfCommit: "",
        selectedAuthors: new Set(),
        blameVisibleAuthors: null,
        fileSelectionMode: "all",
        selectedFiles: new Set(),
        focusedFilePath: null,
      })
    },

    reset: () => {
      analysisStoreInternals.cancelAll()
      analysisStoreInternals.discoveryAbort?.abort()
      analysisStoreInternals.discoveryAbort = null
      set(initialState)
    },
  }),
)

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectBlameMergedAuthorStats = (() => {
  const EMPTY: AuthorStats[] = []
  let previousResult: AnalysisResult | null = null
  let previousBlame: BlameResult | null = null
  let previousPartial: ReadonlyMap<string, number> | null = null
  let previousValue: AuthorStats[] = EMPTY

  return (state: AnalysisState & AnalysisActions): AuthorStats[] => {
    const result = state.result
    const blameResult = state.blameResult
    const partial = state.blamePartialAuthorLines
    if (
      result === previousResult &&
      blameResult === previousBlame &&
      partial === previousPartial
    ) {
      return previousValue
    }

    previousResult = result
    previousBlame = blameResult
    previousPartial = partial

    if (!result) {
      previousValue = EMPTY
      return previousValue
    }

    if (!blameResult) {
      if (partial.size === 0) {
        previousValue = result.authorStats
        return previousValue
      }
      let totalPartial = 0
      for (const lines of partial.values()) totalPartial += lines
      previousValue = result.authorStats.map((stat) => {
        const lines = partial.get(stat.personId) ?? 0
        const linesPercent = totalPartial > 0 ? (100 * lines) / totalPartial : 0
        return { ...stat, lines, linesPercent }
      })
      return previousValue
    }

    const linesByPerson = new Map<string, number>()
    let totalLines = 0
    for (const summary of blameResult.authorSummaries) {
      if (!summary.personId) continue
      linesByPerson.set(
        summary.personId,
        (linesByPerson.get(summary.personId) ?? 0) + summary.lines,
      )
      totalLines += summary.lines
    }

    previousValue = result.authorStats.map((stat) => {
      const lines = linesByPerson.get(stat.personId) ?? 0
      const linesPercent = totalLines > 0 ? (100 * lines) / totalLines : 0
      return { ...stat, lines, linesPercent }
    })
    return previousValue
  }
})()

export const selectBlameMergedFileStats = (() => {
  const EMPTY: FileStats[] = []
  let previousResult: AnalysisResult | null = null
  let previousBlame: BlameResult | null = null
  let previousValue: FileStats[] = EMPTY

  return (state: AnalysisState & AnalysisActions): FileStats[] => {
    const result = state.result
    const blameResult = state.blameResult
    if (result === previousResult && blameResult === previousBlame) {
      return previousValue
    }

    previousResult = result
    previousBlame = blameResult

    if (!result) {
      previousValue = EMPTY
      return previousValue
    }

    if (!blameResult) {
      previousValue = result.fileStats
      return previousValue
    }

    const summaryByPath = new Map(
      blameResult.fileSummaries.map((summary) => [summary.path, summary]),
    )

    previousValue = result.fileStats.map((file) => {
      const summary = summaryByPath.get(file.path)
      const fileLines = summary?.lines ?? 0
      const authorLines = summary?.authorLines

      const clonedBreakdown = new Map<
        string,
        {
          insertions: number
          deletions: number
          commits: number
          lines: number
          commitShas: Set<string>
        }
      >()
      for (const [personId, breakdown] of file.authorBreakdown) {
        clonedBreakdown.set(personId, {
          ...breakdown,
          lines: authorLines?.get(personId) ?? 0,
        })
      }

      return { ...file, lines: fileLines, authorBreakdown: clonedBreakdown }
    })
    return previousValue
  }
})()

export const selectFilteredAuthorStats = (() => {
  const EMPTY_AUTHOR_STATS: AuthorStats[] = []
  let previousMerged: AuthorStats[] | null = null
  let previousSelectedAuthors: Set<string> | null = null
  let previousValue: AuthorStats[] = EMPTY_AUTHOR_STATS

  return (state: AnalysisState & AnalysisActions): AuthorStats[] => {
    const merged = selectBlameMergedAuthorStats(state)
    const selectedAuthors = state.selectedAuthors
    if (
      merged === previousMerged &&
      selectedAuthors === previousSelectedAuthors
    ) {
      return previousValue
    }

    previousMerged = merged
    previousSelectedAuthors = selectedAuthors

    if (merged.length === 0) {
      previousValue = EMPTY_AUTHOR_STATS
      return previousValue
    }

    if (selectedAuthors.size === 0) {
      previousValue = merged
      return previousValue
    }

    previousValue = merged.filter((a) => selectedAuthors.has(a.personId))
    return previousValue
  }
})()

export const selectAuthorColorsByPersonId = (() => {
  const EMPTY_AUTHOR_COLORS_BY_PERSON_ID = new Map<string, string>()
  let previousMerged: AuthorStats[] | null = null
  let previousValue = EMPTY_AUTHOR_COLORS_BY_PERSON_ID

  return (state: AnalysisState & AnalysisActions): Map<string, string> => {
    const merged = selectBlameMergedAuthorStats(state)
    if (merged === previousMerged) {
      return previousValue
    }

    previousMerged = merged

    if (merged.length === 0) {
      previousValue = EMPTY_AUTHOR_COLORS_BY_PERSON_ID
      return previousValue
    }

    previousValue = authorColorMap(merged)
    return previousValue
  }
})()

export const selectFilteredFileStats = (() => {
  const EMPTY_FILE_STATS: FileStats[] = []
  let previousMerged: FileStats[] | null = null
  let previousFileSelectionMode: AnalysisFileSelectionMode | null = null
  let previousSelectedFiles: Set<string> | null = null
  let previousValue: FileStats[] = EMPTY_FILE_STATS

  return (state: AnalysisState & AnalysisActions): FileStats[] => {
    const merged = selectBlameMergedFileStats(state)
    const fileSelectionMode = state.fileSelectionMode
    const selectedFiles = state.selectedFiles
    if (
      merged === previousMerged &&
      fileSelectionMode === previousFileSelectionMode &&
      selectedFiles === previousSelectedFiles
    ) {
      return previousValue
    }

    previousMerged = merged
    previousFileSelectionMode = fileSelectionMode
    previousSelectedFiles = selectedFiles

    if (merged.length === 0) {
      previousValue = EMPTY_FILE_STATS
      return previousValue
    }

    if (fileSelectionMode === "all") {
      previousValue = merged
      return previousValue
    }

    previousValue = merged.filter((f) => selectedFiles.has(f.path))
    return previousValue
  }
})()

export const buildEffectiveBlameWorkflowConfig = (
  course: PersistedCourse,
  blameConfig: AnalysisBlameConfig,
  defaultExtensions: string[],
  maxConcurrency: number,
): AnalysisBlameConfig => {
  const config = resolveAnalysisConfig(
    course,
    defaultExtensions,
    maxConcurrency,
  )
  return {
    ...blameConfig,
    subfolder: config.subfolder,
    extensions: config.extensions,
    includeFiles: config.includeFiles,
    excludeFiles: config.excludeFiles,
    excludeAuthors: config.excludeAuthors,
    excludeEmails: config.excludeEmails,
    whitespace: config.whitespace,
    maxConcurrency: config.maxConcurrency,
  }
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

export const selectAuthorDisplayByPersonId = (() => {
  const EMPTY_AUTHOR_DISPLAY_BY_PERSON_ID = new Map<
    string,
    AuthorDisplayIdentity
  >()
  let previousResult: AnalysisResult | null = null
  let previousShowRenames: boolean | null = null
  let previousValue = EMPTY_AUTHOR_DISPLAY_BY_PERSON_ID

  return (
    state: AnalysisState & AnalysisActions,
  ): Map<string, AuthorDisplayIdentity> => {
    const result = state.result
    const showRenames = state.showRenames
    if (result === previousResult && showRenames === previousShowRenames) {
      return previousValue
    }

    previousResult = result
    previousShowRenames = showRenames

    if (!result) {
      previousValue = EMPTY_AUTHOR_DISPLAY_BY_PERSON_ID
      return previousValue
    }

    const personById = new Map(
      result.personDbBaseline.persons.map((person) => [person.id, person]),
    )

    const nextValue = new Map<string, AuthorDisplayIdentity>()
    for (const stat of result.authorStats) {
      const person = personById.get(stat.personId)
      if (!person || !showRenames) {
        nextValue.set(stat.personId, {
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

      nextValue.set(stat.personId, {
        name: names.join(" | "),
        email: emails.join(" | "),
      })
    }

    previousValue = nextValue
    return previousValue
  }
})()

export const selectRosterMatchByPersonId = (() => {
  const EMPTY_ROSTER_MATCH_BY_PERSON_ID = new Map<string, IdentityMatch>()
  let previousRosterMatches: AnalysisResult["rosterMatches"] | undefined
  let previousValue = EMPTY_ROSTER_MATCH_BY_PERSON_ID

  return (
    state: AnalysisState & AnalysisActions,
  ): Map<string, IdentityMatch> => {
    const rosterMatches = state.result?.rosterMatches
    if (rosterMatches === previousRosterMatches) {
      return previousValue
    }

    previousRosterMatches = rosterMatches
    if (!rosterMatches) {
      previousValue = EMPTY_ROSTER_MATCH_BY_PERSON_ID
      return previousValue
    }

    const nextValue = new Map<string, IdentityMatch>()
    for (const match of rosterMatches.matches) {
      nextValue.set(match.personId, match)
    }
    previousValue = nextValue
    return previousValue
  }
})()
