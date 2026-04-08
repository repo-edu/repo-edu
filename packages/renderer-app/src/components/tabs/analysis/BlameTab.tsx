import type {
  BlameLine,
  FileBlame,
  PersonDbSnapshot,
} from "@repo-edu/domain/analysis"
import {
  classifyCommentLines,
  extensionToLanguage,
  lookupPerson,
} from "@repo-edu/domain/analysis"
import {
  Button,
  EmptyState,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { Eye, EyeOff, Loader2, Palette } from "@repo-edu/ui/components/icons"
import { useMemo } from "react"
import { useAnalysisStore } from "../../../stores/analysis-store.js"
import { authorColorMap } from "../../../utils/author-colors.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProcessedLine = {
  line: BlameLine
  personId: string
  isFirstInGroup: boolean
  authorRank: number
  commitNumber: number
  isComment: boolean
  isEmpty: boolean
  isExcludedByConfig: boolean
}

// ---------------------------------------------------------------------------
// Processing helpers
// ---------------------------------------------------------------------------

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot >= 0 ? path.slice(dot + 1) : ""
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function fnmatchToRegex(pattern: string): RegExp {
  let regex = ""
  let i = 0

  while (i < pattern.length) {
    const char = pattern[i]

    if (char === "*") {
      regex += "[\\s\\S]*"
    } else if (char === "?") {
      regex += "[\\s\\S]"
    } else if (char === "[") {
      let j = i + 1
      if (j < pattern.length && pattern[j] === "!") {
        j++
      }
      if (j < pattern.length && pattern[j] === "]") {
        j++
      }
      while (j < pattern.length && pattern[j] !== "]") {
        j++
      }

      if (j >= pattern.length) {
        regex += escapeRegex(char)
      } else {
        let classBody = pattern.slice(i + 1, j)
        if (classBody.startsWith("!")) {
          classBody = `^${classBody.slice(1)}`
        }
        regex += `[${classBody}]`
        i = j
      }
    } else {
      regex += escapeRegex(char)
    }

    i++
  }

  return new RegExp(`^${regex}$`, "i")
}

const PATTERN_CACHE_MAX = 64
const patternCache = new Map<string, RegExp>()

function matchesPattern(value: string, pattern: string): boolean {
  let regex = patternCache.get(pattern)
  if (!regex) {
    regex = fnmatchToRegex(pattern)
    if (patternCache.size >= PATTERN_CACHE_MAX) {
      const first = patternCache.keys().next().value
      if (first !== undefined) patternCache.delete(first)
    }
    patternCache.set(pattern, regex)
  }
  return regex.test(value)
}

function matchesAnyPattern(
  value: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => matchesPattern(value, pattern))
}

function processBlameLines(
  fileBlame: FileBlame,
  personDb: PersonDbSnapshot,
  options: {
    excludeAuthors: readonly string[]
    excludeEmails: readonly string[]
    includeEmptyLines: boolean
    includeComments: boolean
  },
): ProcessedLine[] {
  const lines = fileBlame.lines

  // Detect comment lines
  const ext = getFileExtension(fileBlame.path)
  const language = extensionToLanguage(ext)
  const commentSet = language
    ? classifyCommentLines(
        lines.map((l) => l.content),
        language,
      )
    : new Set<number>()

  // Map lines to personIds and compute per-author line counts
  const authorLineCounts = new Map<string, number>()
  const linePersonIds: string[] = []

  for (const line of lines) {
    const person = lookupPerson(personDb, line.authorName, line.authorEmail)
    const pid = person?.id ?? `unknown:${line.authorEmail}`
    linePersonIds.push(pid)
    authorLineCounts.set(pid, (authorLineCounts.get(pid) ?? 0) + 1)
  }

  // Author rank: sorted by line count descending, most lines = rank 1
  const sortedAuthors = [...authorLineCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )
  const authorRankMap = new Map<string, number>()
  for (let i = 0; i < sortedAuthors.length; i++) {
    authorRankMap.set(sortedAuthors[i][0], i + 1)
  }

  // Commit numbering: unique SHAs ordered by earliest timestamp
  const shaTimestamps = new Map<string, number>()
  for (const line of lines) {
    const existing = shaTimestamps.get(line.sha)
    if (existing === undefined || line.timestamp < existing) {
      shaTimestamps.set(line.sha, line.timestamp)
    }
  }
  const sortedShas = [...shaTimestamps.entries()].sort((a, b) => a[1] - b[1])
  const commitNumberMap = new Map<string, number>()
  for (let i = 0; i < sortedShas.length; i++) {
    commitNumberMap.set(sortedShas[i][0], i + 1)
  }

  // Build processed lines with commit grouping
  const processed: ProcessedLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const personId = linePersonIds[i]
    const isFirstInGroup = i === 0 || lines[i - 1].sha !== line.sha
    const isComment = commentSet.has(i)
    const isEmpty = line.content.trim().length === 0
    const isExcludedByIdentity =
      (options.excludeAuthors.length > 0 &&
        matchesAnyPattern(line.authorName, options.excludeAuthors)) ||
      (options.excludeEmails.length > 0 &&
        matchesAnyPattern(line.authorEmail, options.excludeEmails))
    const isExcludedByConfig =
      isExcludedByIdentity ||
      (!options.includeEmptyLines && isEmpty) ||
      (!options.includeComments && isComment)

    processed.push({
      line,
      personId,
      isFirstInGroup,
      authorRank: authorRankMap.get(personId) ?? 0,
      commitNumber: commitNumberMap.get(line.sha) ?? 0,
      isComment,
      isEmpty,
      isExcludedByConfig,
    })
  }

  return processed
}

type AuthorContribution = {
  personId: string
  name: string
  lines: number
  percent: number
}

function computeAuthorContributions(
  processed: ProcessedLine[],
  personDb: PersonDbSnapshot,
): AuthorContribution[] {
  const counts = new Map<string, { name: string; lines: number }>()
  for (const p of processed) {
    const existing = counts.get(p.personId)
    if (existing) {
      existing.lines++
    } else {
      const person = personDb.persons.find((pr) => pr.id === p.personId)
      counts.set(p.personId, {
        name: person?.canonicalName ?? p.line.authorName,
        lines: 1,
      })
    }
  }

  const total = processed.length
  return [...counts.entries()]
    .map(([personId, { name, lines }]) => ({
      personId,
      name,
      lines,
      percent: total > 0 ? (lines / total) * 100 : 0,
    }))
    .sort((a, b) => b.lines - a.lines)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AuthorSummary({
  contributions,
  colorMap,
}: {
  contributions: AuthorContribution[]
  colorMap: Map<string, string>
}) {
  return (
    <div className="flex flex-wrap gap-2 px-3 py-2 border-b">
      {contributions.map((c) => {
        const color = colorMap.get(c.personId) ?? "#888"
        return (
          <div key={c.personId} className="flex items-center gap-1.5 text-xs">
            <div
              className="size-3 rounded-sm shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="truncate max-w-24">{c.name}</span>
            <span className="text-muted-foreground">
              {c.lines} ({c.percent.toFixed(1)}%)
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PersonDbDeltaDisplay() {
  const delta = useAnalysisStore((s) => s.blameResult?.delta)
  if (!delta) return null

  const hasChanges =
    delta.newPersons.length > 0 ||
    delta.newAliases.length > 0 ||
    delta.relinkedIdentities.length > 0

  if (!hasChanges) return null

  return (
    <div className="border-t px-3 py-2 space-y-0.5">
      <Text className="text-xs font-medium">PersonDB changes</Text>
      {delta.newPersons.length > 0 && (
        <Text className="text-xs text-muted-foreground">
          {delta.newPersons.length} new person
          {delta.newPersons.length !== 1 ? "s" : ""} discovered
        </Text>
      )}
      {delta.newAliases.length > 0 && (
        <Text className="text-xs text-muted-foreground">
          {delta.newAliases.length} new alias
          {delta.newAliases.length !== 1 ? "es" : ""} linked
        </Text>
      )}
      {delta.relinkedIdentities.length > 0 && (
        <Text className="text-xs text-muted-foreground">
          {delta.relinkedIdentities.length} identit
          {delta.relinkedIdentities.length !== 1 ? "ies" : "y"} relinked
        </Text>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blame grid
// ---------------------------------------------------------------------------

function BlameGrid({
  processed,
  colorMap,
  showMetadata,
  colorize,
  blameExclusions,
}: {
  processed: ProcessedLine[]
  colorMap: Map<string, string>
  showMetadata: boolean
  colorize: boolean
  blameExclusions: string
}) {
  return (
    <div className="overflow-auto flex-1 min-h-0">
      <div
        className="grid text-xs font-mono min-w-max"
        style={{
          gridTemplateColumns: showMetadata
            ? "auto auto auto minmax(80px, 1fr) auto auto auto 1fr"
            : "auto 1fr",
        }}
      >
        {/* Header */}
        {showMetadata ? (
          <>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              ID
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              Author
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              Date
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              Message
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              SHA
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              Commit#
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground text-right">
              Line#
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              Code
            </div>
          </>
        ) : (
          <>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground text-right">
              Line#
            </div>
            <div className="sticky top-0 z-10 bg-background border-b px-2 py-1 font-sans font-medium text-muted-foreground">
              Code
            </div>
          </>
        )}

        {/* Rows */}
        {processed.map((p) => {
          const color = colorMap.get(p.personId) ?? "#888"
          const isExcluded = p.isExcludedByConfig
          const excluded = isExcluded && blameExclusions === "hide"
          const bgStyle =
            colorize && !excluded
              ? { backgroundColor: `${color}66` }
              : undefined
          const borderStyle =
            colorize && !excluded
              ? { borderLeft: `2px solid ${color}` }
              : { borderLeft: "2px solid transparent" }
          const date = new Date(p.line.timestamp * 1000)
            .toISOString()
            .slice(0, 10)

          if (showMetadata) {
            return (
              <div key={p.line.lineNumber} className="contents">
                <div
                  className="px-2 py-px text-muted-foreground text-center"
                  style={{ ...borderStyle, ...bgStyle }}
                >
                  {p.isFirstInGroup ? p.authorRank : ""}
                </div>
                <div className="px-2 py-px truncate max-w-32" style={bgStyle}>
                  {p.isFirstInGroup ? p.line.authorName : ""}
                </div>
                <div
                  className="px-2 py-px text-muted-foreground"
                  style={bgStyle}
                >
                  {p.isFirstInGroup ? date : ""}
                </div>
                <div
                  className="px-2 py-px truncate max-w-48 text-muted-foreground"
                  style={bgStyle}
                >
                  {p.isFirstInGroup ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">{p.line.message}</span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        className="max-w-sm break-words"
                      >
                        {p.line.message}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    ""
                  )}
                </div>
                <div
                  className="px-2 py-px text-muted-foreground"
                  style={bgStyle}
                >
                  {p.isFirstInGroup ? p.line.sha.slice(0, 7) : ""}
                </div>
                <div
                  className="px-2 py-px text-muted-foreground text-center"
                  style={bgStyle}
                >
                  {p.isFirstInGroup ? p.commitNumber : ""}
                </div>
                <div
                  className="px-2 py-px text-muted-foreground text-right"
                  style={bgStyle}
                >
                  {p.line.lineNumber}
                </div>
                <div
                  className={`px-2 py-px whitespace-pre${p.isComment ? " italic" : ""}`}
                  style={bgStyle}
                >
                  {p.isEmpty ? "\u00A0" : p.line.content}
                </div>
              </div>
            )
          }

          return (
            <div key={p.line.lineNumber} className="contents">
              <div
                className="px-2 py-px text-muted-foreground text-right"
                style={{ ...borderStyle, ...bgStyle }}
              >
                {p.line.lineNumber}
              </div>
              <div
                className={`px-2 py-px whitespace-pre${p.isComment ? " italic" : ""}`}
                style={bgStyle}
              >
                {p.isEmpty ? "\u00A0" : p.line.content}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BlameTab({ filePath }: { filePath: string }) {
  const entry = useAnalysisStore((s) => s.blameFileResults.get(filePath))
  const result = useAnalysisStore((s) => s.result)
  const blameResult = useAnalysisStore((s) => s.blameResult)
  const blameConfig = useAnalysisStore((s) => s.blameConfig)

  const showMetadata = useAnalysisStore((s) => s.blameShowMetadata)
  const colorize = useAnalysisStore((s) => s.blameColorize)
  const hideEmpty = useAnalysisStore((s) => s.blameHideEmpty)
  const hideComments = useAnalysisStore((s) => s.blameHideComments)
  const blameExclusions = blameConfig.blameExclusions ?? "hide"

  const setBlameShowMetadata = useAnalysisStore((s) => s.setBlameShowMetadata)
  const setBlameColorize = useAnalysisStore((s) => s.setBlameColorize)
  const setBlameHideEmpty = useAnalysisStore((s) => s.setBlameHideEmpty)
  const setBlameHideComments = useAnalysisStore((s) => s.setBlameHideComments)

  const personDb = blameResult?.personDbOverlay ?? result?.personDbBaseline

  const processed = useMemo(() => {
    if (!entry?.fileBlame || !personDb) return []
    return processBlameLines(entry.fileBlame, personDb, {
      excludeAuthors: blameConfig.excludeAuthors ?? [],
      excludeEmails: blameConfig.excludeEmails ?? [],
      includeEmptyLines: blameConfig.includeEmptyLines ?? false,
      includeComments: blameConfig.includeComments ?? false,
    })
  }, [entry?.fileBlame, personDb, blameConfig])

  const filteredLines = useMemo(() => {
    let lines = processed

    if (blameExclusions === "remove") {
      lines = lines.filter((p) => !p.isExcludedByConfig)
    }

    if (hideEmpty) {
      lines = lines.filter((p) => !p.isEmpty)
    }
    if (hideComments) {
      lines = lines.filter((p) => !p.isComment)
    }

    return lines
  }, [processed, blameExclusions, hideEmpty, hideComments])

  const contributions = useMemo(() => {
    if (!personDb) return []
    return computeAuthorContributions(filteredLines, personDb)
  }, [filteredLines, personDb])

  const colorMap = useMemo(
    () => authorColorMap(contributions.map((c) => c.personId)),
    [contributions],
  )

  if (!entry || entry.status === "pending") {
    return (
      <div className="flex h-full items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">
          Loading blame data...
        </Text>
      </div>
    )
  }

  if (entry.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message={entry.errorMessage ?? "Failed to load blame."} />
      </div>
    )
  }

  if (!entry.fileBlame || filteredLines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message="No blame data for this file." />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <Button
          variant={showMetadata ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setBlameShowMetadata(!showMetadata)}
        >
          {showMetadata ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
          Metadata
        </Button>
        <Button
          variant={colorize ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setBlameColorize(!colorize)}
        >
          <Palette className="size-3.5" />
          Colorize
        </Button>
        <Button
          variant={hideEmpty ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setBlameHideEmpty(!hideEmpty)}
        >
          Hide Empty
        </Button>
        <Button
          variant={hideComments ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setBlameHideComments(!hideComments)}
        >
          Hide Comments
        </Button>
      </div>

      {/* Author contributions */}
      {colorize && contributions.length > 0 && (
        <AuthorSummary contributions={contributions} colorMap={colorMap} />
      )}

      {/* Blame grid */}
      <BlameGrid
        processed={filteredLines}
        colorMap={colorMap}
        showMetadata={showMetadata}
        colorize={colorize}
        blameExclusions={blameExclusions}
      />

      {/* PersonDB delta */}
      <PersonDbDeltaDisplay />
    </div>
  )
}
