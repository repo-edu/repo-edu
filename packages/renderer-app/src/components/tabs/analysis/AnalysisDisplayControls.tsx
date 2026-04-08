import { Button, Checkbox, Label, Separator } from "@repo-edu/ui"
import {
  type AnalysisActiveMetric,
  type AnalysisDisplayMode,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"

const METRIC_OPTIONS: { value: AnalysisActiveMetric; label: string }[] = [
  { value: "commits", label: "Commits" },
  { value: "insertions", label: "Insertions" },
  { value: "deletions", label: "Deletions" },
  { value: "linesOfCode", label: "Lines of Code" },
]

const DISPLAY_MODE_OPTIONS: { value: AnalysisDisplayMode; label: string }[] = [
  { value: "absolute", label: "Absolute" },
  { value: "percentage", label: "Percentage" },
]

export function AnalysisDisplayControls() {
  const activeMetric = useAnalysisStore((s) => s.activeMetric)
  const setActiveMetric = useAnalysisStore((s) => s.setActiveMetric)
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const setDisplayMode = useAnalysisStore((s) => s.setDisplayMode)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const setShowDeletions = useAnalysisStore((s) => s.setShowDeletions)
  const showRenames = useAnalysisStore((s) => s.showRenames)
  const setShowRenames = useAnalysisStore((s) => s.setShowRenames)
  const scaledPercentages = useAnalysisStore((s) => s.scaledPercentages)
  const setScaledPercentages = useAnalysisStore((s) => s.setScaledPercentages)

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm">
      {/* Metric selector */}
      <div className="flex items-center gap-1">
        {METRIC_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={activeMetric === opt.value ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveMetric(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Display mode */}
      <div className="flex items-center gap-1">
        {DISPLAY_MODE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={displayMode === opt.value ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setDisplayMode(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Toggles */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="show-deletions"
            checked={showDeletions}
            onCheckedChange={(c) => setShowDeletions(c === true)}
          />
          <Label htmlFor="show-deletions" className="text-xs">
            Deletions
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="show-renames"
            checked={showRenames}
            onCheckedChange={(c) => setShowRenames(c === true)}
          />
          <Label htmlFor="show-renames" className="text-xs">
            Renames
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="scaled-pct"
            checked={scaledPercentages}
            onCheckedChange={(c) => setScaledPercentages(c === true)}
          />
          <Label htmlFor="scaled-pct" className="text-xs">
            Scaled %
          </Label>
        </div>
      </div>
    </div>
  )
}
