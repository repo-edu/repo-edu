import type { PersonDbSnapshot } from "@repo-edu/domain/analysis"
import { Button, Checkbox, EmptyState, Text } from "@repo-edu/ui"
import {
  Eye,
  EyeOff,
  FileCode,
  Loader2,
  Palette,
} from "@repo-edu/ui/components/icons"
import type { CSSProperties, ReactNode } from "react"
import { useMemo } from "react"
import type { ThemedToken } from "shiki/types"
import {
  useAnalysisAuthorView,
  useAnalysisBlameResult,
  useAnalysisBlameStatus,
  useAnalysisResult,
  useAnalysisSelection,
} from "../../../analysis/analysis-query-coordinator.js"
import { selectEffectiveBlameVisibleAuthors } from "../../../analysis/analysis-view-models.js"
import {
  selectBlameVisibleAuthorsForScope,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { splitOffLeading } from "../../../utils/blame-highlighter.js"
import { buildBlameCommitNumberMap } from "./blame-commit-numbering.js"
import { type ProcessedLine, processBlameLines } from "./process-blame-lines.js"
import { useBlameCommentClassification } from "./use-blame-comment-classification.js"
import {
  type HighlightedLineTokens,
  useBlameHighlightedLines,
} from "./use-blame-highlighted-lines.js"

const TAB_WIDTH = 4

function countLeadingIndent(content: string): number {
  let i = 0
  while (i < content.length && (content[i] === " " || content[i] === "\t")) {
    i++
  }
  return i
}

function expandLeadingIndent(content: string, leadingCount: number): string {
  if (leadingCount === 0) return ""
  let expanded = ""
  for (let i = 0; i < leadingCount; i++) {
    expanded += content[i] === "\t" ? "\u00A0".repeat(TAB_WIDTH) : "\u00A0"
  }
  return expanded
}

function preserveLeadingIndent(content: string): string {
  const leadingCount = countLeadingIndent(content)
  if (leadingCount === 0) return content
  return (
    expandLeadingIndent(content, leadingCount) + content.slice(leadingCount)
  )
}

function renderCodeCell(
  p: ProcessedLine,
  lineTokens: ThemedToken[] | undefined,
): ReactNode {
  if (p.isEmpty) return "\u00A0"
  if (!lineTokens) return preserveLeadingIndent(p.line.content)

  const leadingCount = countLeadingIndent(p.line.content)
  const remaining = splitOffLeading(lineTokens, leadingCount)
  const indent = expandLeadingIndent(p.line.content, leadingCount)

  return (
    <>
      {indent && <span>{indent}</span>}
      {remaining.map((token, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: token order is stable per render
          key={i}
          className="shiki-token"
          style={token.htmlStyle as CSSProperties | undefined}
        >
          {token.content}
        </span>
      ))}
    </>
  )
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

function ContributionsPie({
  contributions,
  colorMap,
  size = 20,
}: {
  contributions: AuthorContribution[]
  colorMap: ReadonlyMap<string, string>
  size?: number
}) {
  const total = contributions.reduce((sum, c) => sum + c.lines, 0)
  if (total === 0) return null

  const radius = size / 2
  const nonZero = contributions.filter((c) => c.lines > 0)

  if (nonZero.length === 1) {
    const only = nonZero[0]
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Author contributions"
      >
        <circle
          cx={radius}
          cy={radius}
          r={radius}
          fill={colorMap.get(only.personId) ?? "#888"}
        />
      </svg>
    )
  }

  let startAngle = -Math.PI / 2
  const segments = nonZero.map((c) => {
    const angle = (c.lines / total) * Math.PI * 2
    const endAngle = startAngle + angle
    const x1 = radius + radius * Math.cos(startAngle)
    const y1 = radius + radius * Math.sin(startAngle)
    const x2 = radius + radius * Math.cos(endAngle)
    const y2 = radius + radius * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const path = `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
    startAngle = endAngle
    return { personId: c.personId, path }
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Author contributions"
    >
      {segments.map((s) => (
        <path
          key={s.personId}
          d={s.path}
          fill={colorMap.get(s.personId) ?? "#888"}
        />
      ))}
    </svg>
  )
}

function AuthorSummary({
  contributions,
  colorMap,
  visibleAuthors,
  onToggle,
}: {
  contributions: AuthorContribution[]
  colorMap: ReadonlyMap<string, string>
  visibleAuthors: ReadonlySet<string> | null
  onToggle: (personId: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 pl-2 pr-3 py-1 border-b">
      <ContributionsPie
        contributions={contributions}
        colorMap={colorMap}
        size={24}
      />
      {contributions.map((c) => {
        const color = colorMap.get(c.personId) ?? "#888"
        const checked =
          visibleAuthors === null || visibleAuthors.has(c.personId)
        return (
          <button
            key={c.personId}
            type="button"
            onClick={() => onToggle(c.personId)}
            className="flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <Checkbox checked={checked} tabIndex={-1} />
            <div
              className="size-3 rounded-sm shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="truncate max-w-24">{c.name}</span>
            <span className="text-muted-foreground">{c.lines}</span>
          </button>
        )
      })}
    </div>
  )
}

function PersonDbDeltaDisplay() {
  const { blameResult } = useAnalysisBlameResult()
  const delta = blameResult?.delta
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
  tokens,
}: {
  processed: ProcessedLine[]
  colorMap: ReadonlyMap<string, string>
  showMetadata: boolean
  colorize: boolean
  tokens: HighlightedLineTokens | null
}) {
  return (
    <div
      className="grid text-xs font-mono min-w-max"
      style={{
        gridTemplateColumns: showMetadata
          ? "auto auto auto fit-content(12rem) auto auto auto 1fr"
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
        const bgStyle = colorize ? { backgroundColor: `${color}59` } : undefined
        const borderStyle = colorize
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
              <div className="px-2 py-px text-muted-foreground" style={bgStyle}>
                {p.isFirstInGroup ? date : ""}
              </div>
              <div
                className="px-2 py-px max-w-48 text-muted-foreground truncate cursor-default hover:whitespace-normal"
                style={bgStyle}
              >
                {p.isFirstInGroup ? p.line.message : ""}
              </div>
              <div className="px-2 py-px text-muted-foreground" style={bgStyle}>
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
                {renderCodeCell(p, tokens?.get(p.line.lineNumber))}
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
              {renderCodeCell(p, tokens?.get(p.line.lineNumber))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BlameTab({ filePath }: { filePath: string }) {
  const { result } = useAnalysisResult()
  const { blameResult } = useAnalysisBlameResult()
  const { blameStatus, blameErrorMessage } = useAnalysisBlameStatus()
  const { authorColorsByPersonId: colorMap } = useAnalysisAuthorView()
  const { analysisScopeKey } = useAnalysisSelection()

  const showMetadata = useAnalysisStore((s) => s.blameShowMetadata)
  const colorize = useAnalysisStore((s) => s.blameColorize)
  const syntaxColorize = useAnalysisStore((s) => s.blameSyntaxColorize)
  const hideEmpty = useAnalysisStore((s) => s.blameHideEmpty)
  const hideComments = useAnalysisStore((s) => s.blameHideComments)
  const visibleAuthors = useAnalysisStore((s) =>
    selectBlameVisibleAuthorsForScope(s, analysisScopeKey),
  )
  const toggleAuthor = useAnalysisStore((s) => s.toggleBlameAuthorVisible)

  const setBlameShowMetadata = useAnalysisStore((s) => s.setBlameShowMetadata)
  const setBlameColorize = useAnalysisStore((s) => s.setBlameColorize)
  const setBlameSyntaxColorize = useAnalysisStore(
    (s) => s.setBlameSyntaxColorize,
  )
  const setBlameHideEmpty = useAnalysisStore((s) => s.setBlameHideEmpty)
  const setBlameHideComments = useAnalysisStore((s) => s.setBlameHideComments)

  const syntaxTheme = useAppSettingsStore(
    (s) => s.settings.appearance.syntaxTheme,
  )
  const fileBlame = useMemo(
    () =>
      blameResult?.fileBlames.find(
        (candidate) => candidate.path === filePath,
      ) ?? null,
    [blameResult, filePath],
  )
  const highlightedTokens = useBlameHighlightedLines(
    fileBlame,
    syntaxColorize,
    syntaxTheme,
  )
  const commentClassification = useBlameCommentClassification(fileBlame)

  const personDb = blameResult?.personDbOverlay ?? result?.personDbBaseline
  const commitNumberMap = useMemo(() => {
    return buildBlameCommitNumberMap(blameResult?.fileBlames ?? [])
  }, [blameResult])

  const processed = useMemo(() => {
    if (!fileBlame || !personDb) return []
    return processBlameLines(
      fileBlame,
      personDb,
      commitNumberMap,
      commentClassification,
    )
  }, [fileBlame, personDb, commitNumberMap, commentClassification])

  const lineFilteredLines = useMemo(() => {
    let lines = processed

    if (hideEmpty) {
      lines = lines.filter((p) => !p.isEmpty)
    }
    if (hideComments) {
      lines = lines.filter((p) => !p.isComment)
    }

    if (lines === processed) return lines

    return lines.map((p, i) => ({
      ...p,
      isFirstInGroup: i === 0 || lines[i - 1].line.sha !== p.line.sha,
    }))
  }, [processed, hideEmpty, hideComments])

  const contributions = useMemo(() => {
    if (!personDb) return []
    return computeAuthorContributions(lineFilteredLines, personDb)
  }, [lineFilteredLines, personDb])

  const effectiveVisibleAuthors = useMemo(
    () =>
      selectEffectiveBlameVisibleAuthors({
        storedVisibleAuthors: visibleAuthors,
        visibleAuthorIds: contributions.map((c) => c.personId),
      }),
    [visibleAuthors, contributions],
  )

  const filteredLines = useMemo(() => {
    if (effectiveVisibleAuthors === null) return lineFilteredLines
    const lines = lineFilteredLines.filter((p) =>
      effectiveVisibleAuthors.has(p.personId),
    )
    return lines.map((p, i) => ({
      ...p,
      isFirstInGroup: i === 0 || lines[i - 1].line.sha !== p.line.sha,
    }))
  }, [lineFilteredLines, effectiveVisibleAuthors])

  if (blameStatus === "running" && !fileBlame) {
    return (
      <div className="flex h-full items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">
          Loading blame data...
        </Text>
      </div>
    )
  }

  if (blameStatus === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState message={blameErrorMessage ?? "Failed to load blame."} />
      </div>
    )
  }

  if (!fileBlame || processed.length === 0) {
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
          variant="toggle"
          size="sm"
          className="h-7 gap-1 text-xs"
          aria-pressed={showMetadata}
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
          variant="toggle"
          size="sm"
          className="h-7 gap-1 text-xs"
          aria-pressed={colorize}
          onClick={() => setBlameColorize(!colorize)}
        >
          <Palette className="size-3.5" />
          Colorize
        </Button>
        <Button
          variant="toggle"
          size="sm"
          className="h-7 gap-1 text-xs"
          aria-pressed={syntaxColorize}
          onClick={() => setBlameSyntaxColorize(!syntaxColorize)}
        >
          <FileCode className="size-3.5" />
          Syntax
        </Button>
        <Button
          variant="toggle"
          size="sm"
          className="h-7 gap-1 text-xs"
          aria-pressed={hideEmpty}
          onClick={() => setBlameHideEmpty(!hideEmpty)}
        >
          Hide Empty
        </Button>
        <Button
          variant="toggle"
          size="sm"
          className="h-7 gap-1 text-xs"
          aria-pressed={hideComments}
          onClick={() => setBlameHideComments(!hideComments)}
        >
          Hide Comments
        </Button>
      </div>

      {/* Scroll region: author summary scrolls away, grid header stays sticky */}
      <div className="overflow-auto flex-1 min-h-0">
        {colorize && contributions.length > 0 && (
          <AuthorSummary
            contributions={contributions}
            colorMap={colorMap}
            visibleAuthors={effectiveVisibleAuthors}
            onToggle={(personId) => {
              if (analysisScopeKey === null) return
              toggleAuthor(
                analysisScopeKey,
                personId,
                contributions.map((c) => c.personId),
              )
            }}
          />
        )}

        <BlameGrid
          processed={filteredLines}
          colorMap={colorMap}
          showMetadata={showMetadata}
          colorize={colorize}
          tokens={highlightedTokens}
        />
      </div>

      {/* PersonDB delta */}
      <PersonDbDeltaDisplay />
    </div>
  )
}
