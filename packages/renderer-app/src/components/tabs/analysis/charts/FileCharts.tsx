import type { AuthorStats, FileStats } from "@repo-edu/domain/analysis"
import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  type AnalysisActiveMetric,
  selectAuthorColorsByPersonId,
  useAnalysisStore,
} from "../../../../stores/analysis-store.js"
import { formatCount } from "../../../../utils/analysis-format.js"

type FileChartsProps = {
  fileStats: FileStats[]
  authorStats: AuthorStats[]
  activeMetric: AnalysisActiveMetric
}

const MAX_FILES_SHOWN = 25

function metricValueFromFile(
  file: FileStats,
  metric: AnalysisActiveMetric,
): number {
  switch (metric) {
    case "commits":
      return file.commits
    case "insertions":
      return file.insertions
    case "deletions":
      return file.deletions
    case "linesOfCode":
      return file.lines
  }
}

function metricValueFromBreakdown(
  values: {
    commits: number
    insertions: number
    deletions: number
    lines: number
  },
  metric: AnalysisActiveMetric,
): number {
  switch (metric) {
    case "commits":
      return values.commits
    case "insertions":
      return values.insertions
    case "deletions":
      return values.deletions
    case "linesOfCode":
      return values.lines
  }
}

export function FileCharts({
  fileStats,
  authorStats,
  activeMetric,
}: FileChartsProps) {
  const colors = useAnalysisStore(selectAuthorColorsByPersonId)
  const authorIds = useMemo(
    () => authorStats.map((author) => author.personId),
    [authorStats],
  )

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const author of authorStats) {
      map.set(author.personId, author.canonicalName)
    }
    return map
  }, [authorStats])

  const chartData = useMemo(() => {
    const sorted = [...fileStats]
      .sort(
        (a, b) =>
          metricValueFromFile(b, activeMetric) -
          metricValueFromFile(a, activeMetric),
      )
      .slice(0, MAX_FILES_SHOWN)

    return sorted.map((file) => {
      const row: Record<string, string | number> = {
        name: file.path.split("/").pop() ?? file.path,
        fullPath: file.path,
      }

      for (const [personId, breakdown] of file.authorBreakdown) {
        const value = metricValueFromBreakdown(breakdown, activeMetric)

        row[personId] = ((row[personId] as number | undefined) ?? 0) + value
      }

      return row
    })
  }, [activeMetric, fileStats])

  if (chartData.length === 0) return null

  return (
    <div className="p-3 text-foreground">
      {chartData.length < fileStats.length && (
        <div className="mb-1 text-xs text-muted-foreground">
          {chartData.length}/{fileStats.length} files shown
        </div>
      )}
      <ResponsiveContainer
        width="100%"
        height={Math.max(280, chartData.length * 26)}
      >
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "currentColor" }} />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 11, fill: "currentColor" }}
            width="auto"
          />
          <Tooltip
            labelFormatter={(_, payload) => payload[0]?.payload?.fullPath ?? ""}
            formatter={(value, key) => [
              formatCount(Number(value)),
              nameById.get(String(key)) ?? String(key),
            ]}
          />
          {authorIds.map((personId) => (
            <Bar
              key={personId}
              dataKey={personId}
              stackId="file"
              fill={colors.get(personId) ?? "#888"}
              isAnimationActive={false}
              name={personId}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
