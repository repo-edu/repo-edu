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
import type { AnalysisActiveMetric } from "../../../../stores/analysis-store.js"
import { formatCount } from "../../../../utils/analysis-format.js"
import { authorColorMap } from "../../../../utils/author-colors.js"

type FileChartsProps = {
  fileStats: FileStats[]
  authorStats: AuthorStats[]
  activeMetric: AnalysisActiveMetric
}

const MAX_FILES_SHOWN = 25

function metricLabel(metric: AnalysisActiveMetric): string {
  switch (metric) {
    case "commits":
      return "Commits"
    case "insertions":
      return "Insertions"
    case "deletions":
      return "Deletions"
    case "linesOfCode":
      return "Lines of Code"
  }
}

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
  values: { commits: number; insertions: number; deletions: number },
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
      return values.insertions - values.deletions
  }
}

export function FileCharts({
  fileStats,
  authorStats,
  activeMetric,
}: FileChartsProps) {
  const authorIds = useMemo(
    () => authorStats.map((author) => author.personId),
    [authorStats],
  )

  const colors = useMemo(() => authorColorMap(authorIds), [authorIds])

  const authorKeyToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const author of authorStats) {
      map.set(
        `${author.canonicalName}\0${author.canonicalEmail}`,
        author.personId,
      )
    }
    return map
  }, [authorStats])

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

      for (const [authorKey, breakdown] of file.authorBreakdown) {
        const personId = authorKeyToId.get(authorKey)
        if (!personId) continue
        let value = metricValueFromBreakdown(breakdown, activeMetric)

        // Keep line segments non-negative for stacked rendering.
        if (activeMetric === "linesOfCode") {
          if (file.lines > 0) {
            const totalInsertions = [...file.authorBreakdown.values()].reduce(
              (sum, item) => sum + item.insertions,
              0,
            )
            value =
              totalInsertions > 0
                ? (file.lines * breakdown.insertions) / totalInsertions
                : 0
          } else {
            value = Math.max(0, value)
          }
        }

        row[personId] = ((row[personId] as number | undefined) ?? 0) + value
      }

      return row
    })
  }, [activeMetric, authorKeyToId, fileStats])

  if (chartData.length === 0) return null

  return (
    <div className="p-3 text-foreground">
      <div className="mb-1 text-xs text-muted-foreground">
        {chartData.length}/{fileStats.length} files shown
      </div>
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
            width={180}
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
      <div className="mt-1 text-xs text-muted-foreground">
        Metric: {metricLabel(activeMetric)}
      </div>
    </div>
  )
}
