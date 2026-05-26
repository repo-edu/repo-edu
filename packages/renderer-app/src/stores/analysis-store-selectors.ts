import type {
  AnalysisBlameConfig,
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileStats,
  IdentityMatch,
} from "@repo-edu/domain/analysis"
import type { AnalysisCore } from "@repo-edu/domain/types"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import { authorColorMap } from "../utils/author-colors.js"
import type {
  AnalysisActions,
  AnalysisFileSelectionMode,
  AnalysisState,
} from "./analysis-store.js"

type AnalysisStoreSnapshot = AnalysisState & AnalysisActions

export const selectBlameMergedAuthorStats = (() => {
  const EMPTY: AuthorStats[] = []
  let previousResult: AnalysisResult | null = null
  let previousBlame: BlameResult | null = null
  let previousPartial: ReadonlyMap<string, number> | null = null
  let previousValue: AuthorStats[] = EMPTY

  return (state: AnalysisStoreSnapshot): AuthorStats[] => {
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

  return (state: AnalysisStoreSnapshot): FileStats[] => {
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

  return (state: AnalysisStoreSnapshot): AuthorStats[] => {
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

  return (state: AnalysisStoreSnapshot): Map<string, string> => {
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

  return (state: AnalysisStoreSnapshot): FileStats[] => {
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
  course: AnalysisCore,
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

  return (state: AnalysisStoreSnapshot): Map<string, AuthorDisplayIdentity> => {
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

  return (state: AnalysisStoreSnapshot): Map<string, IdentityMatch> => {
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
