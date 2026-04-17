import {
  Button,
  Checkbox,
  Label,
  RadioGroup,
  RadioGroupItem,
  Separator,
} from "@repo-edu/ui"
import {
  type AnalysisActiveMetric,
  type AnalysisDisplayMode,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"

const DISPLAY_MODE_OPTIONS: { value: AnalysisDisplayMode; label: string }[] = [
  { value: "absolute", label: "Absolute" },
  { value: "percentage", label: "Percentage" },
]

const CHART_METRIC_OPTIONS: { value: AnalysisActiveMetric; label: string }[] = [
  { value: "linesOfCode", label: "Lines of Code" },
  { value: "commits", label: "Commits" },
  { value: "insertions", label: "Insertions" },
]

type AnalysisDisplayControlsProps = {
  /** When true, render Email and Roster Match column toggles (AuthorPanel). */
  showIdentityToggles?: boolean
  /** When false, omit the chart-metric radio group (panels without charts). */
  showChartMetric?: boolean
}

export function AnalysisDisplayControls({
  showIdentityToggles = false,
  showChartMetric = true,
}: AnalysisDisplayControlsProps = {}) {
  const displayMode = useAnalysisStore((s) => s.displayMode)
  const setDisplayMode = useAnalysisStore((s) => s.setDisplayMode)
  const showCommits = useAnalysisStore((s) => s.showCommits)
  const setShowCommits = useAnalysisStore((s) => s.setShowCommits)
  const showInsertions = useAnalysisStore((s) => s.showInsertions)
  const setShowInsertions = useAnalysisStore((s) => s.setShowInsertions)
  const showDeletions = useAnalysisStore((s) => s.showDeletions)
  const setShowDeletions = useAnalysisStore((s) => s.setShowDeletions)
  const showLinesOfCode = useAnalysisStore((s) => s.showLinesOfCode)
  const setShowLinesOfCode = useAnalysisStore((s) => s.setShowLinesOfCode)
  const showRenames = useAnalysisStore((s) => s.showRenames)
  const setShowRenames = useAnalysisStore((s) => s.setShowRenames)
  const showAge = useAnalysisStore((s) => s.showAge)
  const setShowAge = useAnalysisStore((s) => s.setShowAge)
  const showEmail = useAnalysisStore((s) => s.showEmail)
  const setShowEmail = useAnalysisStore((s) => s.setShowEmail)
  const showRosterMatch = useAnalysisStore((s) => s.showRosterMatch)
  const setShowRosterMatch = useAnalysisStore((s) => s.setShowRosterMatch)
  const hasRosterMatches = useAnalysisStore(
    (s) => s.result?.rosterMatches != null,
  )
  const chartMetric = useAnalysisStore((s) => s.chartMetric)
  const setChartMetric = useAnalysisStore((s) => s.setChartMetric)

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm">
      {/* Display mode */}
      <div className="flex items-center gap-1">
        {DISPLAY_MODE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={displayMode === opt.value ? "selection" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setDisplayMode(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <Separator orientation="vertical" className="h-5" />

      {/* Column visibility toggles */}
      <div className="flex items-center gap-3">
        {showIdentityToggles && (
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="show-email"
              checked={showEmail}
              onCheckedChange={(c) => setShowEmail(c === true)}
            />
            <Label htmlFor="show-email" className="text-xs">
              Email
            </Label>
          </div>
        )}
        {showIdentityToggles && hasRosterMatches && (
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="show-roster-match"
              checked={showRosterMatch}
              onCheckedChange={(c) => setShowRosterMatch(c === true)}
            />
            <Label htmlFor="show-roster-match" className="text-xs">
              Roster Match
            </Label>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="show-lines-of-code"
            checked={showLinesOfCode}
            onCheckedChange={(c) => setShowLinesOfCode(c === true)}
          />
          <Label htmlFor="show-lines-of-code" className="text-xs">
            Lines of Code
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="show-commits"
            checked={showCommits}
            onCheckedChange={(c) => setShowCommits(c === true)}
          />
          <Label htmlFor="show-commits" className="text-xs">
            Commits
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="show-insertions"
            checked={showInsertions}
            onCheckedChange={(c) => setShowInsertions(c === true)}
          />
          <Label htmlFor="show-insertions" className="text-xs">
            Insertions
          </Label>
        </div>
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
            id="show-age"
            checked={showAge}
            onCheckedChange={(c) => setShowAge(c === true)}
          />
          <Label htmlFor="show-age" className="text-xs">
            Age
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
      </div>

      {showChartMetric && (
        <>
          <Separator orientation="vertical" className="h-5" />

          {/* Chart metric */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Charts:</span>
            <RadioGroup
              size="xs"
              value={chartMetric}
              onValueChange={(v) => setChartMetric(v as AnalysisActiveMetric)}
              className="flex flex-row gap-3"
            >
              {CHART_METRIC_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-center gap-1.5">
                  <RadioGroupItem
                    id={`chart-metric-${opt.value}`}
                    size="xs"
                    value={opt.value}
                  />
                  <Label
                    htmlFor={`chart-metric-${opt.value}`}
                    className="text-xs"
                  >
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </>
      )}
    </div>
  )
}
