import type {
  AuthorDailyActivity,
  AuthorStats,
} from "@repo-edu/domain/analysis"
import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useAnalysisCoordinator } from "../../../../analysis/analysis-query-coordinator.js"
import type { AnalysisActiveMetric } from "../../../../stores/analysis-store.js"
import { formatCount } from "../../../../utils/analysis-format.js"

type AuthorChartsProps = {
  authorStats: AuthorStats[]
  dailyActivity: AuthorDailyActivity[]
  activeMetric: AnalysisActiveMetric
}

function metricValue(stat: AuthorStats, metric: AnalysisActiveMetric): number {
  switch (metric) {
    case "commits":
      return stat.commits
    case "insertions":
      return stat.insertions
    case "deletions":
      return stat.deletions
    case "linesOfCode":
      return stat.lines
  }
}

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

type DailyMetric = Exclude<AnalysisActiveMetric, "linesOfCode">

function metricFromDaily(
  row: AuthorDailyActivity,
  metric: DailyMetric,
): number {
  switch (metric) {
    case "commits":
      return row.commits
    case "insertions":
      return row.insertions
    case "deletions":
      return row.deletions
  }
}

export function AuthorCharts({
  authorStats,
  dailyActivity,
  activeMetric,
}: AuthorChartsProps) {
  const { authorColorsByPersonId: colors } = useAnalysisCoordinator()
  const authorIdsByLoc = useMemo(
    () =>
      [...authorStats]
        .sort((left, right) => {
          if (left.lines !== right.lines) return right.lines - left.lines
          return left.canonicalName.localeCompare(
            right.canonicalName,
            undefined,
            {
              sensitivity: "base",
            },
          )
        })
        .map((author) => author.personId),
    [authorStats],
  )

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const author of authorStats) {
      map.set(author.personId, author.canonicalName)
    }
    return map
  }, [authorStats])

  const legendSortOrderByPersonId = useMemo(
    () =>
      new Map(
        authorIdsByLoc.map((personId, index) => [personId, index] as const),
      ),
    [authorIdsByLoc],
  )

  const legendItemSorter = (entry: { dataKey?: unknown; value?: unknown }) => {
    const personId =
      typeof entry.dataKey === "string"
        ? entry.dataKey
        : String(entry.value ?? "")
    return legendSortOrderByPersonId.get(personId) ?? Number.MAX_SAFE_INTEGER
  }

  const legendFormatter = (value: unknown, entry: { dataKey?: unknown }) => {
    const personId =
      typeof entry.dataKey === "string" ? entry.dataKey : String(value)
    return nameById.get(personId) ?? personId
  }

  const dailyMetric: DailyMetric | null =
    activeMetric === "linesOfCode" ? null : activeMetric

  const dailyBarData = useMemo(() => {
    if (dailyMetric === null) return []
    const byDate = new Map<string, Record<string, number>>()
    for (const row of dailyActivity) {
      if (!nameById.has(row.personId)) continue
      const point = byDate.get(row.date) ?? {}
      point[row.personId] =
        (point[row.personId] ?? 0) + metricFromDaily(row, dailyMetric)
      byDate.set(row.date, point)
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }))
  }, [dailyMetric, dailyActivity, nameById])

  const pieData = useMemo(
    () =>
      authorStats
        .map((author) => ({
          personId: author.personId,
          name: author.canonicalName,
          value: metricValue(author, activeMetric),
          color: colors.get(author.personId) ?? "#888",
        }))
        .filter((point) => point.value > 0),
    [activeMetric, authorStats, colors],
  )

  if (authorStats.length === 0) return null

  return (
    <div className="space-y-4 p-3 text-foreground">
      <div
        className={
          dailyMetric === null
            ? "grid grid-cols-1 gap-4"
            : "grid grid-cols-1 xl:grid-cols-2 gap-4"
        }
      >
        <div className="min-h-[170px]">
          <ResponsiveContainer width="100%" height={170}>
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="30%"
                cy="50%"
                outerRadius={65}
                isAnimationActive={false}
                label={({
                  name,
                  percent,
                }: {
                  name?: string
                  percent?: number
                }) => `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.personId} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [
                  formatCount(Number(value)),
                  metricLabel(activeMetric),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {dailyMetric !== null && (
          <div className="min-h-[260px]">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyBarData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "currentColor" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "currentColor" }} />
                <Tooltip
                  formatter={(value, key) => [
                    formatCount(Number(value)),
                    nameById.get(String(key)) ?? String(key),
                  ]}
                  labelFormatter={(label) => `Date: ${String(label)}`}
                />
                <Legend
                  itemSorter={legendItemSorter}
                  formatter={legendFormatter}
                />
                {authorIdsByLoc.map((personId) => (
                  <Bar
                    key={personId}
                    dataKey={personId}
                    stackId="daily"
                    isAnimationActive={false}
                    fill={colors.get(personId) ?? "#888"}
                    name={personId}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
