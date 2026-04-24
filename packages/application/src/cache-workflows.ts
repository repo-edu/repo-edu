import type {
  CacheClearAllResult,
  CacheStatsResult,
  CacheTypeId,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type {
  AnalysisResultCache,
  BlameFileCache,
} from "./analysis-workflows/cache.js"

export const CACHE_TYPES = [
  "analysis",
  "blame",
] as const satisfies readonly CacheTypeId[]

export type CacheType = (typeof CACHE_TYPES)[number]

export type CacheStats = CacheStatsResult

export type CacheWorkflowPorts = {
  analysisCache: AnalysisResultCache
  blameCache: BlameFileCache
}

type CacheWorkflowId = "cache.getStats" | "cache.clearAll"

export function createCacheWorkflowHandlers(
  ports: CacheWorkflowPorts,
): Pick<WorkflowHandlerMap<CacheWorkflowId>, CacheWorkflowId> {
  return {
    "cache.getStats": async (): Promise<CacheStatsResult> => {
      const analysisStats = ports.analysisCache.stats()
      const blameStats = ports.blameCache.stats()
      return {
        caches: [
          {
            type: "analysis",
            coldBytes: analysisStats.coldBytes,
            coldEntries: analysisStats.coldEntries,
          },
          {
            type: "blame",
            coldBytes: blameStats.coldBytes,
            coldEntries: blameStats.coldEntries,
          },
        ],
      }
    },
    "cache.clearAll": async (): Promise<CacheClearAllResult> => {
      ports.analysisCache.clear()
      ports.blameCache.clear()
      return { cleared: [...CACHE_TYPES] }
    },
  }
}
