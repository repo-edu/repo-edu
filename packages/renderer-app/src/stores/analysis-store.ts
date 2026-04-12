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
  | "blame"

export type AnalysisWorkflowStatus = "idle" | "running" | "error"

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

  // Blame display toggles (client-side only)
  blameShowMetadata: boolean
  blameColorize: boolean
  blameHideEmpty: boolean
  blameHideComments: boolean

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

  // Repo discovery
  setSearchFolder: (folder: string | null) => void
  setSearchDepth: (depth: number) => void
  setDiscoveredRepos: (repos: DiscoveredRepo[]) => void
  setDiscoveryStatus: (status: "idle" | "loading" | "error") => void
  setDiscoveryError: (error: string | null) => void

  setResult: (result: AnalysisResult | null) => void
  setBlameResult: (result: BlameResult | null) => void
  openFileForBlame: (path: string) => void
  closeBlameTargetFile: (path: string) => void
  clearBlameTargetFiles: () => void
  setWorkflowStatus: (status: AnalysisWorkflowStatus) => void
  setProgress: (progress: AnalysisProgress | null) => void
  setErrorMessage: (message: string | null) => void

  // Blame config
  setBlameConfig: (patch: Partial<AnalysisBlameConfig>) => void
  setAsOfCommit: (oid: string) => void

  // Per-file blame tracking
  setActiveBlameFile: (path: string | null) => void
  setBlameFileResult: (path: string, entry: FileBlameEntry) => void
  clearBlameFileResults: () => void
  setBlameWorkflowStatus: (status: AnalysisWorkflowStatus) => void
  setBlameProgress: (progress: AnalysisProgress | null) => void
  setBlameErrorMessage: (message: string | null) => void

  // Blame display toggles
  setBlameShowMetadata: (show: boolean) => void
  setBlameColorize: (colorize: boolean) => void
  setBlameHideEmpty: (hide: boolean) => void
  setBlameHideComments: (hide: boolean) => void

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

  searchFolder: null,
  searchDepth: 5,
  discoveredRepos: [],
  discoveryStatus: "idle",
  discoveryError: null,

  result: null,
  blameResult: null,
  blameTargetFiles: [],
  workflowStatus: "idle",
  progress: null,
  errorMessage: null,

  blameConfig: { copyMove: 1, blameExclusions: "hide" },
  asOfCommit: "",

  blameFileResults: new Map(),
  activeBlameFile: null,
  blameWorkflowStatus: "idle",
  blameProgress: null,
  blameErrorMessage: null,

  blameShowMetadata: true,
  blameColorize: true,
  blameHideEmpty: false,
  blameHideComments: false,

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
      set((state) => {
        const nextConfig = { ...state.config, ...patch }
        const enablingBlameSkip =
          patch.blameSkip === true &&
          (state.config.blameSkip ?? false) === false

        if (!enablingBlameSkip) {
          return { config: nextConfig }
        }

        return {
          config: nextConfig,
          blameResult: null,
          blameTargetFiles: [],
          blameFileResults: new Map(),
          activeBlameFile: null,
          blameWorkflowStatus: "idle",
          blameProgress: null,
          blameErrorMessage: null,
          activeView:
            state.activeView === "blame" ? "authors" : state.activeView,
        }
      }),

    setSelectedRepoPath: (path) => set({ selectedRepoPath: path }),

    // Repo discovery
    setSearchFolder: (searchFolder) => set({ searchFolder }),
    setSearchDepth: (searchDepth) => set({ searchDepth }),
    setDiscoveredRepos: (discoveredRepos) => set({ discoveredRepos }),
    setDiscoveryStatus: (discoveryStatus) => set({ discoveryStatus }),
    setDiscoveryError: (discoveryError) => set({ discoveryError }),

    setResult: (result) =>
      set({
        result,
        blameResult: null,
        blameTargetFiles: [],
        blameFileResults: new Map(),
        activeBlameFile: null,
        blameWorkflowStatus: "idle",
        blameProgress: null,
        blameErrorMessage: null,
        selectedAuthors: new Set(),
        selectedFiles: new Set(),
        asOfCommit: result?.resolvedAsOfOid ?? "",
      }),
    setBlameResult: (blameResult) => set({ blameResult }),
    openFileForBlame: (path) =>
      set((state) => {
        if (state.config.blameSkip ?? false) {
          return state
        }
        const alreadyOpen = state.blameTargetFiles.includes(path)
        return {
          blameTargetFiles: alreadyOpen
            ? state.blameTargetFiles
            : [...state.blameTargetFiles, path],
          activeBlameFile: path,
          activeView: "blame",
        }
      }),
    closeBlameTargetFile: (path) =>
      set((state) => {
        const next = state.blameTargetFiles.filter((p) => p !== path)
        const nextResults = new Map(state.blameFileResults)
        nextResults.delete(path)
        const nextActive =
          state.activeBlameFile === path
            ? (next[next.length - 1] ?? null)
            : state.activeBlameFile
        return {
          blameTargetFiles: next,
          blameFileResults: nextResults,
          activeBlameFile: nextActive,
        }
      }),
    clearBlameTargetFiles: () =>
      set({
        blameTargetFiles: [],
        blameFileResults: new Map(),
        activeBlameFile: null,
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
    setActiveBlameFile: (activeBlameFile) => set({ activeBlameFile }),
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
  let previousSelectedFiles: Set<string> | null = null
  let previousValue: FileStats[] = EMPTY_FILE_STATS

  return (state: AnalysisState & AnalysisActions): FileStats[] => {
    const result = state.result
    const selectedFiles = state.selectedFiles
    if (result === previousResult && selectedFiles === previousSelectedFiles) {
      return previousValue
    }

    previousResult = result
    previousSelectedFiles = selectedFiles

    if (!result) {
      previousValue = EMPTY_FILE_STATS
      return previousValue
    }

    const { fileStats } = result
    if (selectedFiles.size === 0) {
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
