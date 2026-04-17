import type {
  AnalysisProgress,
  DiscoveredRepo,
} from "@repo-edu/application-contract"
import type {
  AnalysisBlameConfig,
  AnalysisConfig,
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileBlame,
  FileStats,
  IdentityMatch,
} from "@repo-edu/domain/analysis"
import type { PersistedAnalysisSidebarSettings } from "@repo-edu/domain/settings"
import { create } from "zustand"

const DEFAULT_BLAME_COPY_MOVE = 1
const DEFAULT_BLAME_EXCLUSIONS = "hide" as const

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
  // Config state
  config: AnalysisConfig
  selectedRepoPath: string | null

  // Repo discovery state
  searchFolder: string | null
  searchDepth: number
  discoveredRepos: DiscoveredRepo[]
  discoveryStatus: "idle" | "loading" | "error"
  discoveryError: string | null
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
  blameHideEmpty: boolean
  blameHideComments: boolean

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
  setConfig: (patch: Partial<AnalysisConfig>) => void
  setSelectedRepoPath: (path: string | null) => void

  // Repo discovery
  setSearchFolder: (folder: string | null) => void
  setSearchDepth: (depth: number) => void
  setDiscoveredRepos: (repos: DiscoveredRepo[]) => void
  setDiscoveryStatus: (status: "idle" | "loading" | "error") => void
  setDiscoveryError: (error: string | null) => void
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
  setBlameHideEmpty: (hide: boolean) => void
  setBlameHideComments: (hide: boolean) => void

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

const initialState: AnalysisState = {
  config: {},
  selectedRepoPath: null,

  searchFolder: null,
  searchDepth: 5,
  discoveredRepos: [],
  discoveryStatus: "idle",
  discoveryError: null,
  lastDiscoveryOutcome: "none",

  result: null,
  blameResult: null,
  blameTargetFiles: [],
  workflowStatus: "idle",
  progress: null,
  errorMessage: null,

  blameConfig: {
    copyMove: DEFAULT_BLAME_COPY_MOVE,
    blameExclusions: DEFAULT_BLAME_EXCLUSIONS,
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
  blameHideEmpty: false,
  blameHideComments: false,

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

    setConfig: (patch) =>
      set((state) => {
        const nextConfig = { ...state.config, ...patch }
        const previousBlameSkip = state.config.blameSkip ?? false
        const nextBlameSkip = nextConfig.blameSkip ?? false

        if (!previousBlameSkip && nextBlameSkip) {
          return {
            config: nextConfig,
            blameResult: null,
            blameTargetFiles: [],
            blameFileResults: new Map(),
            activeBlameFile: null,
            blameWorkflowStatus: "idle",
            blameProgress: null,
            blameErrorMessage: null,
            blameContextSnapshot: null,
            activeView:
              state.activeView === "blame" ? "authors" : state.activeView,
          }
        }

        if (previousBlameSkip && !nextBlameSkip && state.result) {
          return {
            config: nextConfig,
            blameTargetFiles: state.result.fileStats.map((f) => f.path),
          }
        }

        return { config: nextConfig }
      }),

    setSelectedRepoPath: (path) => set({ selectedRepoPath: path }),

    // Repo discovery
    setSearchFolder: (searchFolder) => set({ searchFolder }),
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setDiscoveredRepos: (discoveredRepos) => set({ discoveredRepos }),
    setDiscoveryStatus: (discoveryStatus) => set({ discoveryStatus }),
    setDiscoveryError: (discoveryError) => set({ discoveryError }),
    setLastDiscoveryOutcome: (lastDiscoveryOutcome) =>
      set({ lastDiscoveryOutcome }),

    setResult: (result) =>
      set((state) => ({
        result,
        blameResult: null,
        blameTargetFiles:
          result && !(state.config.blameSkip ?? false)
            ? result.fileStats.map((f) => f.path)
            : [],
        blameFileResults: new Map(),
        activeBlameFile: null,
        blameWorkflowStatus: "idle",
        blameProgress: null,
        blameErrorMessage: null,
        blameContextSnapshot: null,
        selectedAuthors: new Set(),
        fileSelectionMode: "all",
        selectedFiles: new Set(),
        focusedFilePath: null,
        asOfCommit: result?.resolvedAsOfOid ?? "",
      })),
    setBlameResult: (blameResult) => set({ blameResult }),
    openFileForBlame: (path) =>
      set((state) => {
        if (state.config.blameSkip ?? false) {
          return state
        }
        return {
          activeBlameFile: path,
          focusedFilePath: path,
          activeView: "blame",
        }
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
    setBlameHideEmpty: (blameHideEmpty) => set({ blameHideEmpty }),
    setBlameHideComments: (blameHideComments) => set({ blameHideComments }),

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
        searchFolder: settings.searchFolder,
        searchDepth: settings.searchDepth,
        config: settings.config,
        blameConfig: {
          copyMove: settings.blameConfig.copyMove ?? DEFAULT_BLAME_COPY_MOVE,
          blameExclusions:
            settings.blameConfig.blameExclusions ?? DEFAULT_BLAME_EXCLUSIONS,
          includeEmptyLines: settings.blameConfig.includeEmptyLines,
          includeComments: settings.blameConfig.includeComments,
        },
      }),

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

export const selectFilteredAuthorStats = (() => {
  const EMPTY_AUTHOR_STATS: AuthorStats[] = []
  let previousResult: AnalysisResult | null = null
  let previousSelectedAuthors: Set<string> | null = null
  let previousValue: AuthorStats[] = EMPTY_AUTHOR_STATS

  return (state: AnalysisState & AnalysisActions): AuthorStats[] => {
    const result = state.result
    const selectedAuthors = state.selectedAuthors
    if (
      result === previousResult &&
      selectedAuthors === previousSelectedAuthors
    ) {
      return previousValue
    }

    previousResult = result
    previousSelectedAuthors = selectedAuthors

    if (!result) {
      previousValue = EMPTY_AUTHOR_STATS
      return previousValue
    }

    const { authorStats } = result
    if (selectedAuthors.size === 0) {
      previousValue = authorStats
      return previousValue
    }

    previousValue = authorStats.filter((a) => selectedAuthors.has(a.personId))
    return previousValue
  }
})()

export const selectFilteredFileStats = (() => {
  const EMPTY_FILE_STATS: FileStats[] = []
  let previousResult: AnalysisResult | null = null
  let previousFileSelectionMode: AnalysisFileSelectionMode | null = null
  let previousSelectedFiles: Set<string> | null = null
  let previousValue: FileStats[] = EMPTY_FILE_STATS

  return (state: AnalysisState & AnalysisActions): FileStats[] => {
    const result = state.result
    const fileSelectionMode = state.fileSelectionMode
    const selectedFiles = state.selectedFiles
    if (
      result === previousResult &&
      fileSelectionMode === previousFileSelectionMode &&
      selectedFiles === previousSelectedFiles
    ) {
      return previousValue
    }

    previousResult = result
    previousFileSelectionMode = fileSelectionMode
    previousSelectedFiles = selectedFiles

    if (!result) {
      previousValue = EMPTY_FILE_STATS
      return previousValue
    }

    const { fileStats } = result
    if (fileSelectionMode === "all") {
      previousValue = fileStats
      return previousValue
    }

    previousValue = fileStats.filter((f) => selectedFiles.has(f.path))
    return previousValue
  }
})()

export const buildEffectiveBlameWorkflowConfig = (
  config: AnalysisConfig,
  blameConfig: AnalysisBlameConfig,
): AnalysisBlameConfig => ({
  ...blameConfig,
  subfolder: config.subfolder,
  extensions: config.extensions,
  includeFiles: config.includeFiles,
  excludeFiles: config.excludeFiles,
  excludeAuthors: config.excludeAuthors,
  excludeEmails: config.excludeEmails,
  whitespace: config.whitespace,
  maxConcurrency: config.maxConcurrency,
})

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
