import type {
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileStats,
  IdentityMatch,
} from "@repo-edu/domain/analysis"
import { authorColorMap } from "../utils/author-colors.js"

export type AnalysisFileSelectionMode = "all" | "subset"

export type AuthorDisplayIdentity = {
  name: string
  email: string
}

const EMPTY_AUTHOR_STATS: AuthorStats[] = []
const EMPTY_FILE_STATS: FileStats[] = []
const EMPTY_AUTHOR_COLORS_BY_PERSON_ID = new Map<string, string>()
const EMPTY_AUTHOR_DISPLAY_BY_PERSON_ID = new Map<
  string,
  AuthorDisplayIdentity
>()
const EMPTY_ROSTER_MATCH_BY_PERSON_ID = new Map<string, IdentityMatch>()

export function mergeAuthorStats(params: {
  result: AnalysisResult | null
  blameResult: BlameResult | null
  partialAuthorLines: ReadonlyMap<string, number>
}): AuthorStats[] {
  const { result, blameResult, partialAuthorLines } = params
  if (!result) return EMPTY_AUTHOR_STATS

  if (!blameResult) {
    if (partialAuthorLines.size === 0) return result.authorStats
    let totalPartial = 0
    for (const lines of partialAuthorLines.values()) totalPartial += lines
    return result.authorStats.map((stat) => {
      const lines = partialAuthorLines.get(stat.personId) ?? 0
      const linesPercent = totalPartial > 0 ? (100 * lines) / totalPartial : 0
      return { ...stat, lines, linesPercent }
    })
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

  return result.authorStats.map((stat) => {
    const lines = linesByPerson.get(stat.personId) ?? 0
    const linesPercent = totalLines > 0 ? (100 * lines) / totalLines : 0
    return { ...stat, lines, linesPercent }
  })
}

export function mergeFileStats(params: {
  result: AnalysisResult | null
  blameResult: BlameResult | null
}): FileStats[] {
  const { result, blameResult } = params
  if (!result) return EMPTY_FILE_STATS
  if (!blameResult) return result.fileStats

  const summaryByPath = new Map(
    blameResult.fileSummaries.map((summary) => [summary.path, summary]),
  )

  return result.fileStats.map((file) => {
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
}

export function filterAuthorStats(
  merged: readonly AuthorStats[],
  selectedAuthors: ReadonlySet<string>,
): AuthorStats[] {
  if (merged.length === 0) return EMPTY_AUTHOR_STATS
  if (selectedAuthors.size === 0) return [...merged]
  const filtered = merged.filter((author) =>
    selectedAuthors.has(author.personId),
  )
  return filtered.length > 0 ? filtered : [...merged]
}

export function filterFileStats(params: {
  merged: readonly FileStats[]
  fileSelectionMode: AnalysisFileSelectionMode
  selectedFiles: ReadonlySet<string>
}): FileStats[] {
  const { merged, fileSelectionMode, selectedFiles } = params
  if (merged.length === 0) return EMPTY_FILE_STATS
  if (fileSelectionMode === "all") return [...merged]
  const filtered = merged.filter((file) => selectedFiles.has(file.path))
  return filtered.length > 0 ? filtered : [...merged]
}

export function selectEffectiveBlameVisibleAuthors(params: {
  storedVisibleAuthors: ReadonlySet<string> | null
  visibleAuthorIds: readonly string[]
}): ReadonlySet<string> | null {
  const { storedVisibleAuthors, visibleAuthorIds } = params
  if (storedVisibleAuthors === null) return null
  const visible = new Set<string>()
  for (const id of visibleAuthorIds) {
    if (storedVisibleAuthors.has(id)) visible.add(id)
  }
  return visible.size > 0 ? visible : null
}

export function selectEffectiveFocusedFile(params: {
  storedPath: string | null
  filePaths: readonly string[]
}): string | null {
  const { storedPath, filePaths } = params
  if (storedPath !== null && filePaths.includes(storedPath)) return storedPath
  return filePaths[0] ?? null
}

export function buildAuthorColorsByPersonId(
  merged: readonly AuthorStats[],
): Map<string, string> {
  return merged.length === 0
    ? EMPTY_AUTHOR_COLORS_BY_PERSON_ID
    : authorColorMap(merged)
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

export function buildAuthorDisplayByPersonId(params: {
  result: AnalysisResult | null
  showRenames: boolean
}): Map<string, AuthorDisplayIdentity> {
  const { result, showRenames } = params
  if (!result) return EMPTY_AUTHOR_DISPLAY_BY_PERSON_ID

  const personById = new Map(
    result.personDbBaseline.persons.map((person) => [person.id, person]),
  )
  const displayById = new Map<string, AuthorDisplayIdentity>()
  for (const stat of result.authorStats) {
    const person = personById.get(stat.personId)
    if (!person || !showRenames) {
      displayById.set(stat.personId, {
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
    displayById.set(stat.personId, {
      name: names.join(" | "),
      email: emails.join(" | "),
    })
  }
  return displayById
}

export function buildRosterMatchByPersonId(
  result: AnalysisResult | null,
): Map<string, IdentityMatch> {
  const rosterMatches = result?.rosterMatches
  if (!rosterMatches) return EMPTY_ROSTER_MATCH_BY_PERSON_ID
  const matchById = new Map<string, IdentityMatch>()
  for (const match of rosterMatches.matches) {
    matchById.set(match.personId, match)
  }
  return matchById
}
