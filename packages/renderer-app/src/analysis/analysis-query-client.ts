import { type Query, QueryClient } from "@tanstack/react-query"
import {
  type AnalysisSourceKeyParts,
  queryKeyMatchesSourceSnapshotHead,
} from "./analysis-query-keys.js"

const DEFAULT_ANALYSIS_QUERY_CACHE_BUDGET_BYTES = 1_000_000_000

type RendererQueryClientOptions = {
  readonly analysisDataCacheBudgetBytes?: number
}

function isManagedAnalysisDataQuery(query: Query): boolean {
  const key = query.queryKey
  return (
    key[0] === "analysis" &&
    key[1] === "source" &&
    Array.isArray(key[2]) &&
    key[3] === "repo" &&
    typeof key[4] === "string" &&
    (key[5] === "result" || key[5] === "blame")
  )
}

function estimateQueryDataSize(value: unknown): number {
  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "bigint") return currentValue.toString()
    if (currentValue instanceof Map) return [...currentValue.entries()]
    if (currentValue instanceof Set) return [...currentValue.values()]
    if (typeof currentValue === "object" && currentValue !== null) {
      if (seen.has(currentValue)) return "[Circular]"
      seen.add(currentValue)
    }
    return currentValue
  })
  return serialized === undefined ? 0 : serialized.length * 2
}

function findManagedAnalysisDataQueries(queryClient: QueryClient): Query[] {
  return queryClient.getQueryCache().findAll({
    predicate: isManagedAnalysisDataQuery,
  })
}

function enforceAnalysisQueryCacheBudget(
  queryClient: QueryClient,
  dataSizeByHash: Map<string, number>,
  budgetBytes: number,
): void {
  const queries = findManagedAnalysisDataQueries(queryClient)
  let totalBytes = 0
  for (const query of queries) {
    const size =
      dataSizeByHash.get(query.queryHash) ??
      estimateQueryDataSize(query.state.data)
    dataSizeByHash.set(query.queryHash, size)
    totalBytes += size
  }
  if (totalBytes <= budgetBytes) return

  const inactiveOldestFirst = queries
    .filter((query) => query.getObserversCount() === 0)
    .sort(
      (left, right) =>
        left.state.dataUpdatedAt - right.state.dataUpdatedAt ||
        left.queryHash.localeCompare(right.queryHash),
    )

  for (const query of inactiveOldestFirst) {
    if (totalBytes <= budgetBytes) return
    totalBytes -= dataSizeByHash.get(query.queryHash) ?? 0
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
  }
}

export function createRendererQueryClient(
  options: RendererQueryClientOptions = {},
): QueryClient {
  const analysisDataCacheBudgetBytes =
    options.analysisDataCacheBudgetBytes ??
    DEFAULT_ANALYSIS_QUERY_CACHE_BUDGET_BYTES
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

  const analysisQueryDataSizeByHash = new Map<string, number>()
  queryClient.getQueryCache().subscribe((event) => {
    if (!isManagedAnalysisDataQuery(event.query)) return
    if (event.type === "removed") {
      analysisQueryDataSizeByHash.delete(event.query.queryHash)
      return
    }
    if (event.type !== "added" && event.type !== "updated") return
    if (event.query.state.status !== "success") return
    analysisQueryDataSizeByHash.set(
      event.query.queryHash,
      estimateQueryDataSize(event.query.state.data),
    )
    enforceAnalysisQueryCacheBudget(
      queryClient,
      analysisQueryDataSizeByHash,
      analysisDataCacheBudgetBytes,
    )
  })

  return queryClient
}

export async function refreshSourceSnapshotHeadQueries(
  queryClient: QueryClient,
  source: AnalysisSourceKeyParts,
): Promise<void> {
  const snapshotHeadQueries = queryClient.getQueryCache().findAll({
    predicate: (query) =>
      queryKeyMatchesSourceSnapshotHead(query.queryKey, source),
  })
  const activeSnapshotHeadKeys: Query["queryKey"][] = []

  for (const query of snapshotHeadQueries) {
    if (query.getObserversCount() > 0) {
      activeSnapshotHeadKeys.push(query.queryKey)
      continue
    }
    queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
  }

  await Promise.all(
    activeSnapshotHeadKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, exact: true }),
    ),
  )
}
