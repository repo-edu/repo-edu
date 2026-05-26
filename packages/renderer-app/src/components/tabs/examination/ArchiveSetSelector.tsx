import { getSpecByCode } from "@repo-edu/integrations-llm-catalog"
import { formatSpecLabel } from "./llm-models.js"
import type { AvailableArchiveEntry } from "./types.js"

type ArchiveSetSelectorProps = {
  entries: AvailableArchiveEntry[]
  selectedKey: string | null
  onSelect: (entry: AvailableArchiveEntry) => void
}

export function ArchiveSetSelector({
  entries,
  selectedKey,
  onSelect,
}: ArchiveSetSelectorProps) {
  return (
    <div className="rounded border bg-muted/20 px-3 py-2">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Archived sets
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map((entry) => {
          const active = entry.key === selectedKey
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelect(entry)}
              className={`rounded border px-2 py-1 text-xs transition-colors ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {formatArchiveChipLabel(entry)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function formatArchiveChipLabel(entry: AvailableArchiveEntry): string {
  const spec = getSpecByCode(entry.model)
  const modelLabel =
    spec !== undefined
      ? formatSpecLabel(spec)
      : entry.effort === "none"
        ? entry.model
        : `${entry.model} (${entry.effort})`
  const suffix = entry.questionCount === 1 ? "question" : "questions"
  return `${modelLabel} · ${entry.questionCount} ${suffix}`
}
