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
import {
  type AnalysisActiveMetric,
  selectAuthorColorsByPersonId,
  useAnalysisStore,
} from "../../../../stores/analysis-store.js"
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

function cumulativeLabel(metric: AnalysisActiveMetric): string {
  if (metric === "linesOfCode") return "Cumulative Net Lines"
  return `Cumulative ${metricLabel(metric)}`
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
  const colors = useAnalysisStore(selectAuthorColorsByPersonId)
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

  const { cumulativeData, cumulativeTickDates, cumulativeChangeIndices } =
    useMemo(() => {
      const byDateAuthor = new Map<string, Map<string, number>>()
      for (const row of dailyActivity) {
        if (!nameById.has(row.personId)) continue
        const byAuthor = byDateAuthor.get(row.date) ?? new Map<string, number>()
        byAuthor.set(
          row.personId,
          (byAuthor.get(row.personId) ?? 0) +
            metricFromDaily(row, activeMetric),
        )
        byDateAuthor.set(row.date, byAuthor)
      }

      const dates = [...byDateAuthor.keys()].sort()
      const cumulative = new Map<string, number>()
      const changes = new Map<string, Set<number>>()
      for (const personId of authorIdsByLoc) {
        cumulative.set(personId, 0)
        changes.set(personId, new Set())
      }

      const points = dates.map((date, index) => {
        const point: Record<string, number | string> = { date }
        const deltas = byDateAuthor.get(date) ?? new Map<string, number>()
        for (const personId of authorIdsByLoc) {
          const delta = deltas.get(personId) ?? 0
          const next = (cumulative.get(personId) ?? 0) + delta
          cumulative.set(personId, next)
          point[personId] = next
          if (delta !== 0) changes.get(personId)?.add(index)
        }
        return point
      })

      return {
        cumulativeData: points,
        cumulativeTickDates: dates,
        cumulativeChangeIndices: changes,
      }
    }, [activeMetric, authorIdsByLoc, dailyActivity, nameById])

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

        <div className="min-h-[260px]">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dailyBarData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                ticks={cumulativeTickDates}
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
      </div>

      <div className="min-h-[280px]">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={cumulativeData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              ticks={cumulativeTickDates}
              scale="band"
              tick={{ fontSize: 11, fill: "currentColor" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "currentColor" }}
              label={{
                value: cumulativeLabel(activeMetric),
                angle: -90,
                position: "insideLeft",
                style: {
                  fill: "currentColor",
                  fontSize: 11,
                  textAnchor: "middle",
                },
              }}
            />
            <Tooltip
              formatter={(value, key) => [
                formatCount(Number(value)),
                nameById.get(String(key)) ?? String(key),
              ]}
              labelFormatter={(label) => `Date: ${String(label)}`}
            />
            <Legend itemSorter={legendItemSorter} formatter={legendFormatter} />
            {authorIdsByLoc.map((personId) => (
              <Line
                key={personId}
                type="stepAfter"
                dataKey={personId}
                stroke={colors.get(personId) ?? "#888"}
                strokeWidth={3}
                dot={(dotProps) => {
                  const { cx, cy, index, key } = dotProps as {
                    cx?: number
                    cy?: number
                    index?: number
                    key?: React.Key | null
                  }
                  const reactKey = key ?? `dot-${personId}-${index ?? "x"}`
                  if (
                    index === undefined ||
                    cx === undefined ||
                    cy === undefined ||
                    !cumulativeChangeIndices.get(personId)?.has(index)
                  ) {
                    return <g key={reactKey} />
                  }
                  return (
                    <circle
                      key={reactKey}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={colors.get(personId) ?? "#888"}
                    />
                  )
                }}
                isAnimationActive={false}
                name={personId}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
