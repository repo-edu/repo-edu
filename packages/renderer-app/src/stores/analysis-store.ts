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
import { resolveCourseAnalysisConfig } from "@repo-edu/domain/types"
import { create } from "zustand"

const DEFAULT_BLAME_COPY_MOVE = 1

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
  | "blame"

export type AnalysisWorkflowStatus = "idle" | "running" | "error"
export type AnalysisFileSelectionMode = "all" | "subset"

export type FileBlameEntry = {
  status: "pending" | "loaded" | "error"
  fileBlame: FileBlame | null
  errorMessage: string | null
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

  // Result state
  result: AnalysisResult | null
  blameResult: BlameResult | null
  blameTargetFiles: string[]
  workflowStatus: AnalysisWorkflowStatus
  progress: AnalysisProgress | null
  errorMessage: string | null

  // Blame config (sent to analysis.blame workflow)
  blameConfig: AnalysisBlameConfig
  asOfCommit: string

  // Per-file blame tracking
  blameFileResults: Map<string, FileBlameEntry>
  activeBlameFile: string | null
  blameWorkflowStatus: AnalysisWorkflowStatus
  blameProgress: AnalysisProgress | null
  blameErrorMessage: string | null
  blameContextSnapshot: string | null

  // Blame display toggles (client-side only)
  blameShowMetadata: boolean
  blameColorize: boolean
  blameSyntaxColorize: boolean
  blameHideEmpty: boolean
  blameHideComments: boolean
  blameVisibleAuthors: Set<string> | null

  // Filter state (post-analysis, client-side)
  selectedAuthors: Set<string>
  fileSelectionMode: AnalysisFileSelectionMode
  selectedFiles: Set<string>
  focusedFilePath: string | null

  // Display state
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

  setResult: (result: AnalysisResult | null) => void
  setBlameResult: (result: BlameResult | null) => void
  openFileForBlame: (path: string) => void
  setWorkflowStatus: (status: AnalysisWorkflowStatus) => void
  setProgress: (progress: AnalysisProgress | null) => void
  setErrorMessage: (message: string | null) => void

  // Blame config
  setBlameConfig: (patch: Partial<AnalysisBlameConfig>) => void
  setAsOfCommit: (oid: string) => void

  // Per-file blame tracking
  setBlameFileResult: (path: string, entry: FileBlameEntry) => void
  clearBlameFileResults: () => void
  setBlameWorkflowStatus: (status: AnalysisWorkflowStatus) => void
  setBlameProgress: (progress: AnalysisProgress | null) => void
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

const initialState: AnalysisState = {
  selectedRepoPath: null,

  searchDepth: 5,
  discoveredRepos: [],
  discoveryStatus: "idle",
  discoveryError: null,
  discoveryCurrentFolder: null,
  lastDiscoveryOutcome: "none",

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

// Abort controllers are coordination primitives, not UI state — kept outside
// Zustand so components cannot accidentally subscribe to them.
export const analysisStoreInternals = {
  analysisAbort: null as AbortController | null,
  discoveryAbort: null as AbortController | null,
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>(
  (set) => ({
    ...initialState,

    setSelectedRepoPath: (path) => set({ selectedRepoPath: path }),

    // Repo discovery
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setDiscoveredRepos: (discoveredRepos) => set({ discoveredRepos }),
    setDiscoveryStatus: (discoveryStatus) => set({ discoveryStatus }),
    setDiscoveryError: (discoveryError) => set({ discoveryError }),
    setDiscoveryCurrentFolder: (discoveryCurrentFolder) =>
      set({ discoveryCurrentFolder }),
    setLastDiscoveryOutcome: (lastDiscoveryOutcome) =>
      set({ lastDiscoveryOutcome }),

    setResult: (result) =>
      set({
        result,
        blameResult: null,
        blameTargetFiles: result ? result.fileStats.map((f) => f.path) : [],
        blameFileResults: new Map(),
        activeBlameFile: null,
        blameWorkflowStatus: "idle",
        blameProgress: null,
        blameErrorMessage: null,
        blameContextSnapshot: null,
        selectedAuthors: new Set(),
        blameVisibleAuthors: null,
        fileSelectionMode: "all",
        selectedFiles: new Set(),
        focusedFilePath: null,
        asOfCommit: result?.resolvedAsOfOid ?? "",
      }),
    setBlameResult: (blameResult) => set({ blameResult }),
    openFileForBlame: (path) =>
      set({
        activeBlameFile: path,
        focusedFilePath: path,
        activeView: "blame",
      }),
    setWorkflowStatus: (workflowStatus) => set({ workflowStatus }),
    setProgress: (progress) => set({ progress }),
    setErrorMessage: (errorMessage) => set({ errorMessage }),

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
      analysisStoreInternals.analysisAbort?.abort()
      analysisStoreInternals.discoveryAbort?.abort()
      analysisStoreInternals.analysisAbort = null
      analysisStoreInternals.discoveryAbort = null
      set({
        selectedRepoPath: null,
        discoveredRepos: [],
        discoveryStatus: "idle",
        discoveryError: null,
        discoveryCurrentFolder: null,
        lastDiscoveryOutcome: "none",
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
      analysisStoreInternals.analysisAbort?.abort()
      analysisStoreInternals.discoveryAbort?.abort()
      analysisStoreInternals.analysisAbort = null
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
  let previousValue: AuthorStats[] = EMPTY

  return (state: AnalysisState & AnalysisActions): AuthorStats[] => {
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
      previousValue = result.authorStats
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
  const config = resolveCourseAnalysisConfig(
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
