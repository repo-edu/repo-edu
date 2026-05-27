import { useMemo } from "react"
import type { SourceSubject } from "./source.js"

type SubjectListProps = {
  subjects: SourceSubject[]
  generatedQuestionCountBySubjectId: ReadonlyMap<string, number>
  selectedSubjectId: string | null
  onSelect: (subjectId: string) => void
}

export function SubjectList({
  subjects,
  generatedQuestionCountBySubjectId,
  selectedSubjectId,
  onSelect,
}: SubjectListProps) {
  const sorted = useMemo(
    () => [...subjects].sort((a, b) => b.lines - a.lines),
    [subjects],
  )
  return (
    <div className="flex flex-col gap-1 overflow-auto rounded border p-2">
      {sorted.map((subject) => {
        const generatedQuestionCount =
          generatedQuestionCountBySubjectId.get(subject.id) ?? 0
        const questionsLabel =
          generatedQuestionCount === 0
            ? "no questions yet"
            : `${generatedQuestionCount} ${
                generatedQuestionCount === 1 ? "question" : "questions"
              }`
        const active = subject.id === selectedSubjectId
        return (
          <button
            type="button"
            key={subject.id}
            onClick={() => onSelect(subject.id)}
            className={`flex flex-col items-start rounded px-3 py-2 text-left text-sm transition-colors ${
              active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            <span className="font-medium">{subject.name}</span>
            <span className="text-xs text-muted-foreground">
              {subject.lines} lines · {subject.linesPercent.toFixed(1)}% ·{" "}
              {questionsLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
