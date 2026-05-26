import type { BlameAuthorSummary } from "@repo-edu/domain/analysis"
import { useMemo } from "react"
import { countGeneratedQuestions } from "./archive-entries.js"
import type { GeneratedQuestionSetsByPersonId } from "./types.js"

type AuthorListProps = {
  authorSummaries: BlameAuthorSummary[]
  authorDisplays: Map<string, { name: string; email: string }>
  generatedQuestionSetsByPersonId: GeneratedQuestionSetsByPersonId
  selectedPersonId: string | null
  onSelect: (personId: string) => void
}

export function AuthorList({
  authorSummaries,
  authorDisplays,
  generatedQuestionSetsByPersonId,
  selectedPersonId,
  onSelect,
}: AuthorListProps) {
  const sorted = useMemo(
    () => [...authorSummaries].sort((a, b) => b.lines - a.lines),
    [authorSummaries],
  )
  return (
    <div className="flex flex-col gap-1 overflow-auto rounded border p-2">
      {sorted.map((summary) => {
        const display = authorDisplays.get(summary.personId) ?? {
          name: summary.canonicalName,
          email: summary.canonicalEmail,
        }
        const generatedSets = generatedQuestionSetsByPersonId.get(
          summary.personId,
        )
        const generatedQuestionCount = countGeneratedQuestions(generatedSets)
        const questionsLabel =
          generatedSets === undefined || generatedSets.size === 0
            ? "no questions yet"
            : `${generatedQuestionCount} ${generatedQuestionCount === 1 ? "question" : "questions"}`
        const active = summary.personId === selectedPersonId
        return (
          <button
            type="button"
            key={summary.personId}
            onClick={() => onSelect(summary.personId)}
            className={`flex flex-col items-start rounded px-3 py-2 text-left text-sm transition-colors ${
              active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            <span className="font-medium">{display.name}</span>
            <span className="text-xs text-muted-foreground">
              {summary.lines} lines · {summary.linesPercent.toFixed(1)}% ·{" "}
              {questionsLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
