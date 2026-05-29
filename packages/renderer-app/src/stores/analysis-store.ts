import type {
  AnalysisProgress,
  DiscoveredRepo,
} from "@repo-edu/application-contract"
import type {
  AnalysisBlameConfig,
  AnalysisResult,
  BlameResult,
  FileBlame,
} from "@repo-edu/domain/analysis"
import type { PersistedAnalysisSidebarSettings } from "@repo-edu/domain/settings"
import { create } from "zustand"
import type { AnalysisSourceKey } from "../session/session-reducer.js"
import { useExaminationStore } from "./examination-store.js"

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

type AnalysisSourceBucket = {
  sourceKey: AnalysisSourceKey
  selectedRepoPath: string | null
  discoveredRepos: DiscoveredRepo[]
  discoveryStatus: "idle" | "loading" | "error"
  discoveryError: string | null
  discoveryCurrentFolder: string | null
  lastDiscoveryOutcome: "none" | "completed" | "cancelled"
  pendingRepoDiscoveryFolder: string | null
  repoWorkflowStatus: Map<string, AnalysisWorkflowStatus>
  repoProgress: Map<string, AnalysisProgress | null>
  repoErrorMessage: Map<string, string | null>
  repoStates: Map<string, PerRepoEntry>
  result: AnalysisResult | null
  blameResult: BlameResult | null
  blameTargetFiles: string[]
  workflowStatus: AnalysisWorkflowStatus
  progress: AnalysisProgress | null
  errorMessage: string | null
  asOfCommit: string
  blameFileResults: Map<string, FileBlameEntry>
  activeBlameFile: string | null
  blameWorkflowStatus: AnalysisWorkflowStatus
  blameProgress: AnalysisProgress | null
  blamePartialAuthorLines: ReadonlyMap<string, number>
  blameErrorMessage: string | null
  blameContextSnapshot: string | null
  blameVisibleAuthors: Set<string> | null
  selectedAuthors: Set<string>
  fileSelectionMode: AnalysisFileSelectionMode
  selectedFiles: Set<string>
  focusedFilePath: string | null
}

export type AnalysisState = {
  activeSourceKey: AnalysisSourceKey | null
  sourceBuckets: Map<string, AnalysisSourceBucket>
  selectedRepoPath: string | null

  // Repo discovery state
  searchDepth: number
  discoveredRepos: DiscoveredRepo[]
  discoveryStatus: "idle" | "loading" | "error"
  discoveryError: string | null
  discoveryCurrentFolder: string | null
  lastDiscoveryOutcome: "none" | "completed" | "cancelled"
  pendingRepoDiscoveryFolder: string | null

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

export type AnalysisActions = {
  activateSource: (sourceKey: AnalysisSourceKey | null) => void
  removeSourcesForCourse: (courseId: string) => void
  setSelectedRepoPath: (path: string | null) => void

  // Repo discovery
  setSearchDepth: (depth: number) => void
  setDiscoveredRepos: (repos: DiscoveredRepo[]) => void
  setDiscoveryStatus: (status: "idle" | "loading" | "error") => void
  setDiscoveryError: (error: string | null) => void
  setDiscoveryCurrentFolder: (folder: string | null) => void
  setLastDiscoveryOutcome: (outcome: "none" | "completed" | "cancelled") => void
  requestRepoDiscovery: (folder: string) => void
  clearPendingRepoDiscovery: (folder: string) => void

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

function createEmptySourceFields(): Omit<AnalysisSourceBucket, "sourceKey"> {
  return {
    selectedRepoPath: null,
    discoveredRepos: [],
    discoveryStatus: "idle",
    discoveryError: null,
    discoveryCurrentFolder: null,
    lastDiscoveryOutcome: "none",
    pendingRepoDiscoveryFolder: null,
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
    asOfCommit: "",
    blameFileResults: new Map(),
    activeBlameFile: null,
    blameWorkflowStatus: "idle",
    blameProgress: null,
    blamePartialAuthorLines: EMPTY_PARTIAL_AUTHOR_LINES,
    blameErrorMessage: null,
    blameContextSnapshot: null,
    blameVisibleAuthors: null,
    selectedAuthors: new Set(),
    fileSelectionMode: "all",
    selectedFiles: new Set(),
    focusedFilePath: null,
  }
}

function createInitialAnalysisState(): AnalysisState {
  return {
    activeSourceKey: null,
    sourceBuckets: new Map(),
    ...createEmptySourceFields(),
    searchDepth: 5,
    blameConfig: {
      copyMove: DEFAULT_BLAME_COPY_MOVE,
    },
    blameShowMetadata: true,
    blameColorize: true,
    blameSyntaxColorize: true,
    blameHideEmpty: false,
    blameHideComments: false,
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

const initialState = createInitialAnalysisState()

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

function analysisSourceKeyId(sourceKey: AnalysisSourceKey): string {
  if (sourceKey.kind === "course") {
    return JSON.stringify(["course", sourceKey.courseId])
  }
  if (sourceKey.kind === "folder") {
    return JSON.stringify(["folder", sourceKey.path])
  }
  return JSON.stringify(["submission", sourceKey.path, sourceKey.courseId])
}

function analysisSourceKeysEqual(
  left: AnalysisSourceKey | null,
  right: AnalysisSourceKey | null,
): boolean {
  if (left === null || right === null) return left === right
  return analysisSourceKeyId(left) === analysisSourceKeyId(right)
}

function sourceBelongsToCourse(
  sourceKey: AnalysisSourceKey,
  courseId: string,
): boolean {
  if (sourceKey.kind === "course") return sourceKey.courseId === courseId
  if (sourceKey.kind === "submission") return sourceKey.courseId === courseId
  return false
}

type CourseSourceInvalidations = {
  repositoryPaths: Set<string>
  submissionPaths: Set<string>
}

function collectCourseSourceInvalidations(
  bucket: AnalysisSourceBucket,
  invalidations: CourseSourceInvalidations,
): void {
  if (bucket.sourceKey.kind === "submission") {
    invalidations.submissionPaths.add(bucket.sourceKey.path)
    return
  }
  if (bucket.sourceKey.kind !== "course") {
    return
  }

  if (bucket.selectedRepoPath !== null) {
    invalidations.repositoryPaths.add(bucket.selectedRepoPath)
  }
  for (const repoPath of bucket.repoStates.keys()) {
    invalidations.repositoryPaths.add(repoPath)
  }
  for (const repoPath of bucket.repoWorkflowStatus.keys()) {
    invalidations.repositoryPaths.add(repoPath)
  }
  for (const repoPath of bucket.repoProgress.keys()) {
    invalidations.repositoryPaths.add(repoPath)
  }
  for (const repoPath of bucket.repoErrorMessage.keys()) {
    invalidations.repositoryPaths.add(repoPath)
  }
}

function clearPendingBlameFiles(
  entries: Map<string, FileBlameEntry>,
): Map<string, FileBlameEntry> {
  let changed = false
  const next = new Map(entries)
  for (const [path, entry] of next) {
    if (entry.status === "pending") {
      next.delete(path)
      changed = true
    }
  }
  return changed ? next : entries
}

function idleRepoWorkflowStatus(
  statuses: Map<string, AnalysisWorkflowStatus>,
): Map<string, AnalysisWorkflowStatus> {
  let changed = false
  const next = new Map(statuses)
  for (const [repoPath, status] of next) {
    if (status === "running") {
      next.set(repoPath, "idle")
      changed = true
    }
  }
  return changed ? next : statuses
}

function bucketFromState(
  sourceKey: AnalysisSourceKey,
  state: AnalysisState,
  options?: { settleRunningWorkflows?: boolean },
): AnalysisSourceBucket {
  const settleRunningWorkflows = options?.settleRunningWorkflows ?? false
  return {
    sourceKey,
    selectedRepoPath: state.selectedRepoPath,
    discoveredRepos: state.discoveredRepos,
    discoveryStatus:
      settleRunningWorkflows && state.discoveryStatus === "loading"
        ? "idle"
        : state.discoveryStatus,
    discoveryError: state.discoveryError,
    discoveryCurrentFolder:
      settleRunningWorkflows && state.discoveryStatus === "loading"
        ? null
        : state.discoveryCurrentFolder,
    lastDiscoveryOutcome:
      settleRunningWorkflows && state.discoveryStatus === "loading"
        ? "cancelled"
        : state.lastDiscoveryOutcome,
    pendingRepoDiscoveryFolder:
      settleRunningWorkflows && state.discoveryStatus === "loading"
        ? null
        : state.pendingRepoDiscoveryFolder,
    repoWorkflowStatus: settleRunningWorkflows
      ? idleRepoWorkflowStatus(state.repoWorkflowStatus)
      : state.repoWorkflowStatus,
    repoProgress: settleRunningWorkflows ? new Map() : state.repoProgress,
    repoErrorMessage: state.repoErrorMessage,
    repoStates: snapshotActiveBlameState(state),
    result: state.result,
    blameResult: state.blameResult,
    blameTargetFiles: state.blameTargetFiles,
    workflowStatus:
      settleRunningWorkflows && state.workflowStatus === "running"
        ? "idle"
        : state.workflowStatus,
    progress: settleRunningWorkflows ? null : state.progress,
    errorMessage: state.errorMessage,
    asOfCommit: state.asOfCommit,
    blameFileResults: settleRunningWorkflows
      ? clearPendingBlameFiles(state.blameFileResults)
      : state.blameFileResults,
    activeBlameFile: state.activeBlameFile,
    blameWorkflowStatus:
      settleRunningWorkflows && state.blameWorkflowStatus === "running"
        ? "idle"
        : state.blameWorkflowStatus,
    blameProgress: settleRunningWorkflows ? null : state.blameProgress,
    blamePartialAuthorLines: settleRunningWorkflows
      ? EMPTY_PARTIAL_AUTHOR_LINES
      : state.blamePartialAuthorLines,
    blameErrorMessage: state.blameErrorMessage,
    blameContextSnapshot: state.blameContextSnapshot,
    blameVisibleAuthors: state.blameVisibleAuthors,
    selectedAuthors: state.selectedAuthors,
    fileSelectionMode: state.fileSelectionMode,
    selectedFiles: state.selectedFiles,
    focusedFilePath: state.focusedFilePath,
  }
}

function sourceFieldsFromBucket(
  bucket: AnalysisSourceBucket | null,
): Omit<AnalysisSourceBucket, "sourceKey"> {
  if (bucket === null) return createEmptySourceFields()
  const { sourceKey: _sourceKey, ...fields } = bucket
  return fields
}

function snapshotActiveSourceBucket(
  state: AnalysisState,
  options?: { settleRunningWorkflows?: boolean },
): Map<string, AnalysisSourceBucket> {
  const sourceBuckets = new Map(state.sourceBuckets)
  if (state.activeSourceKey === null) return sourceBuckets
  sourceBuckets.set(
    analysisSourceKeyId(state.activeSourceKey),
    bucketFromState(state.activeSourceKey, state, options),
  )
  return sourceBuckets
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
  abortAndClearAll(): void {
    for (const controller of analysisStoreInternals.analysisAborts.values()) {
      controller.abort()
    }
    analysisStoreInternals.analysisAborts.clear()
  },
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>(
  (set, get) => ({
    ...initialState,

    activateSource: (sourceKey) => {
      if (analysisSourceKeysEqual(get().activeSourceKey, sourceKey)) return
      analysisStoreInternals.abortAndClearAll()
      analysisStoreInternals.discoveryAbort?.abort()
      analysisStoreInternals.discoveryAbort = null
      set((state) => {
        const sourceBuckets = snapshotActiveSourceBucket(state, {
          settleRunningWorkflows: true,
        })
        const nextBucket =
          sourceKey === null
            ? null
            : (sourceBuckets.get(analysisSourceKeyId(sourceKey)) ?? null)
        return {
          activeSourceKey: sourceKey,
          sourceBuckets,
          ...sourceFieldsFromBucket(nextBucket),
        }
      })
    },

    removeSourcesForCourse: (courseId) => {
      const activeSourceKey = get().activeSourceKey
      const activeBelongsToCourse =
        activeSourceKey !== null &&
        sourceBelongsToCourse(activeSourceKey, courseId)
      if (activeBelongsToCourse) {
        analysisStoreInternals.abortAndClearAll()
        analysisStoreInternals.discoveryAbort?.abort()
        analysisStoreInternals.discoveryAbort = null
      }
      const invalidations: CourseSourceInvalidations = {
        repositoryPaths: new Set(),
        submissionPaths: new Set(),
      }
      set((state) => {
        // Only snapshot the active bucket when we are about to clear it; the
        // settled copy would otherwise be overwritten on the next navigation.
        const sourceBuckets = activeBelongsToCourse
          ? snapshotActiveSourceBucket(state, { settleRunningWorkflows: true })
          : new Map(state.sourceBuckets)
        for (const [bucketId, bucket] of sourceBuckets) {
          if (sourceBelongsToCourse(bucket.sourceKey, courseId)) {
            collectCourseSourceInvalidations(bucket, invalidations)
            sourceBuckets.delete(bucketId)
          }
        }
        if (activeBelongsToCourse) {
          return {
            activeSourceKey: null,
            sourceBuckets,
            ...createEmptySourceFields(),
            activeView: "authors" as AnalysisView,
          }
        }
        return { sourceBuckets }
      })
      const examinationStore = useExaminationStore.getState()
      for (const repoPath of invalidations.repositoryPaths) {
        examinationStore.invalidateRepositoryAnalysisSource(repoPath)
      }
      for (const folderPath of invalidations.submissionPaths) {
        examinationStore.invalidateSubmissionSource(folderPath)
      }
    },

    setSelectedRepoPath: (path) => {
      if (get().selectedRepoPath === path) return
      set((state) => {
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
      })
    },

    // Repo discovery
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setDiscoveredRepos: (discoveredRepos) => set({ discoveredRepos }),
    setDiscoveryStatus: (discoveryStatus) => set({ discoveryStatus }),
    setDiscoveryError: (discoveryError) => set({ discoveryError }),
    setDiscoveryCurrentFolder: (discoveryCurrentFolder) =>
      set({ discoveryCurrentFolder }),
    setLastDiscoveryOutcome: (lastDiscoveryOutcome) =>
      set({ lastDiscoveryOutcome }),
    requestRepoDiscovery: (pendingRepoDiscoveryFolder) =>
      set({ pendingRepoDiscoveryFolder }),
    clearPendingRepoDiscovery: (folder) =>
      set((state) =>
        state.pendingRepoDiscoveryFolder === folder
          ? { pendingRepoDiscoveryFolder: null }
          : state,
      ),

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

    clearAllRepoStates: () => {
      useExaminationStore.getState().resetRepositoryAnalysis()
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
      })
    },

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

    reset: () => {
      analysisStoreInternals.abortAndClearAll()
      analysisStoreInternals.discoveryAbort?.abort()
      analysisStoreInternals.discoveryAbort = null
      useExaminationStore.getState().resetRepositoryAnalysis()
      set(createInitialAnalysisState())
    },
  }),
)

export {
  type AuthorDisplayIdentity,
  buildEffectiveBlameWorkflowConfig,
  selectAuthorColorsByPersonId,
  selectAuthorDisplayByPersonId,
  selectBlameMergedAuthorStats,
  selectBlameMergedFileStats,
  selectFilteredAuthorStats,
  selectFilteredFileStats,
  selectRosterMatchByPersonId,
} from "./analysis-store-selectors.js"
