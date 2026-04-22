import { Button, Checkbox, Label } from "@repo-edu/ui"
import {
  selectAuthorColorsByPersonId,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"

export function AuthorFilterControls() {
  const result = useAnalysisStore((s) => s.result)
  const selectedAuthors = useAnalysisStore((s) => s.selectedAuthors)
  const setSelectedAuthors = useAnalysisStore((s) => s.setSelectedAuthors)
  const selectAllAuthors = useAnalysisStore((s) => s.selectAllAuthors)
  const clearAuthorSelection = useAnalysisStore((s) => s.clearAuthorSelection)
  const colors = useAnalysisStore(selectAuthorColorsByPersonId)

  const authorStats = result?.authorStats ?? []

  if (authorStats.length === 0) return null

  const allSelected = selectedAuthors.size === authorStats.length
  const noneSelected = selectedAuthors.size === 0

  const handleToggleAuthor = (personId: string) => {
    if (noneSelected) {
      const next = new Set(authorStats.map((a) => a.personId))
      next.delete(personId)
      setSelectedAuthors(next)
      return
    }
    const next = new Set(selectedAuthors)
    if (next.has(personId)) {
      next.delete(personId)
    } else {
      next.add(personId)
    }
    setSelectedAuthors(next)
  }

  return (
    <div className="border-t px-3 py-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filter Authors
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            disabled={allSelected}
            onClick={selectAllAuthors}
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            disabled={noneSelected}
            onClick={clearAuthorSelection}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {authorStats.map((a) => {
          const color = colors.get(a.personId) ?? "#888"
          const isSelected = noneSelected || selectedAuthors.has(a.personId)
          return (
            <div key={a.personId} className="flex items-center gap-1.5">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggleAuthor(a.personId)}
              />
              <Label className="text-xs flex items-center gap-1">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {a.canonicalName}
              </Label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
