import type { BlameResult } from "@repo-edu/domain/analysis"
import {
  type Query,
  QueryClient,
  type QueryFilters,
} from "@tanstack/react-query"
import {
  type AnalysisSourceKeyParts,
  queryKeyMatchesSourceSnapshotHead,
} from "./analysis-query-keys.js"

/**
 * Blame lines kept across unobserved blame results before the oldest are
 * evicted. One large course is 50 repositories of about 5,000 source lines,
 * so this holds such a course under two settings variants. Analysis results
 * are aggregates without source text and are never evicted.
 */
export const RETAINED_BLAME_LINE_BUDGET = 500_000

type RendererQueryClientOptions = {
  readonly retainedBlameLineBudget?: number
}

function isBlameResultQuery(query: Query): boolean {
  const key = query.queryKey
  return (
    key[0] === "analysis" &&
    key[1] === "source" &&
    Array.isArray(key[2]) &&
    key[3] === "repo" &&
    typeof key[4] === "string" &&
    key[5] === "blame"
  )
}

function countBlameLines(data: unknown): number {
  const fileBlames = (data as Partial<BlameResult> | undefined)?.fileBlames
  if (!Array.isArray(fileBlames)) return 0
  let lines = 0
  for (const fileBlame of fileBlames) lines += fileBlame.lines.length
  return lines
}

function enforceBlameLineBudget(
  queryClient: QueryClient,
  budgetLines: number,
): void {
  const blameQueries = queryClient.getQueryCache().findAll({
    predicate: isBlameResultQuery,
  })
  let retainedLines = 0
  for (const query of blameQueries) {
    retainedLines += countBlameLines(query.state.data)
  }
  if (retainedLines <= budgetLines) return

  const inactiveOldestFirst = blameQueries
    .filter((query) => query.getObserversCount() === 0)
    .sort(
      (left, right) =>
        left.state.dataUpdatedAt - right.state.dataUpdatedAt ||
        left.queryHash.localeCompare(right.queryHash),
    )

  for (const query of inactiveOldestFirst) {
    if (retainedLines <= budgetLines) return
    retainedLines -= countBlameLines(query.state.data)
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
  }
}

export function createRendererQueryClient(
  options: RendererQueryClientOptions = {},
): QueryClient {
  const retainedBlameLineBudget =
    options.retainedBlameLineBudget ?? RETAINED_BLAME_LINE_BUDGET
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  })

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "added" && event.type !== "updated") return
    if (!isBlameResultQuery(event.query)) return
    if (event.query.state.status !== "success") return
    enforceBlameLineBudget(queryClient, retainedBlameLineBudget)
  })

  return queryClient
}

/** Clear cached values without detaching mounted observers or starting work. */
export function clearAnalysisQueries(
  queryClient: QueryClient,
  filters: QueryFilters,
): void {
  for (const query of queryClient.getQueryCache().findAll(filters)) {
    if (query.getObserversCount() > 0) query.reset()
    else queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
  }
}

export function refreshSourceSnapshotHeadQueries(
  queryClient: QueryClient,
  source: AnalysisSourceKeyParts,
): void {
  clearAnalysisQueries(queryClient, {
    predicate: (query) =>
      queryKeyMatchesSourceSnapshotHead(query.queryKey, source),
  })
}
