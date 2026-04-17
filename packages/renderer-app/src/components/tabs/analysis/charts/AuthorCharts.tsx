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
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { AnalysisActiveMetric } from "../../../../stores/analysis-store.js"
import { formatCount } from "../../../../utils/analysis-format.js"
import { authorColorMap } from "../../../../utils/author-colors.js"

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

function metricFromDaily(
  row: AuthorDailyActivity,
  metric: AnalysisActiveMetric,
): number {
  switch (metric) {
    case "commits":
      return row.commits
    case "insertions":
      return row.insertions
    case "deletions":
      return row.deletions
    case "linesOfCode":
      return row.netLines
  }
}

export function AuthorCharts({
  authorStats,
  dailyActivity,
  activeMetric,
}: AuthorChartsProps) {
  const authorIds = useMemo(
    () => authorStats.map((author) => author.personId),
    [authorStats],
  )
  const colors = useMemo(() => authorColorMap(authorIds), [authorIds])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const author of authorStats) {
      map.set(author.personId, author.canonicalName)
    }
    return map
  }, [authorStats])

  const dailyBarData = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>()
    for (const row of dailyActivity) {
      if (!nameById.has(row.personId)) continue
      const point = byDate.get(row.date) ?? {}
      point[row.personId] =
        (point[row.personId] ?? 0) + metricFromDaily(row, activeMetric)
      byDate.set(row.date, point)
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }))
  }, [activeMetric, dailyActivity, nameById])

  const linesHistoryData = useMemo(() => {
    const byDateAuthor = new Map<string, Map<string, number>>()
    for (const row of dailyActivity) {
      if (!nameById.has(row.personId)) continue
      const byAuthor = byDateAuthor.get(row.date) ?? new Map<string, number>()
      byAuthor.set(
        row.personId,
        (byAuthor.get(row.personId) ?? 0) + row.netLines,
      )
      byDateAuthor.set(row.date, byAuthor)
    }

    const dates = [...byDateAuthor.keys()].sort()
    const cumulative = new Map<string, number>()
    for (const personId of authorIds) {
      cumulative.set(personId, 0)
    }

    return dates.map((date) => {
      const point: Record<string, number | string> = { date }
      const deltas = byDateAuthor.get(date) ?? new Map<string, number>()
      for (const personId of authorIds) {
        const next =
          (cumulative.get(personId) ?? 0) + (deltas.get(personId) ?? 0)
        cumulative.set(personId, next)
        point[personId] = next
      }
      return point
    })
  }, [authorIds, dailyActivity, nameById])

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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                formatter={(value) =>
                  nameById.get(String(value)) ?? String(value)
                }
              />
              {authorIds.map((personId) => (
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

        <div className="min-h-[260px]">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
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
      </div>

      {activeMetric === "linesOfCode" && (
        <div className="min-h-[280px]">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={linesHistoryData}>
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
                formatter={(value) =>
                  nameById.get(String(value)) ?? String(value)
                }
              />
              {authorIds.map((personId) => (
                <Line
                  key={personId}
                  type="monotone"
                  dataKey={personId}
                  stroke={colors.get(personId) ?? "#888"}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name={personId}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
