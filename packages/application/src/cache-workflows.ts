import type {
  CacheClearAllResult,
  CacheStatsResult,
  CacheTypeId,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { BlameFileCache } from "./analysis-workflows/blame-cache.js"

export const CACHE_TYPES = ["blame"] as const satisfies readonly CacheTypeId[]

export type CacheType = (typeof CACHE_TYPES)[number]

export type CacheStats = CacheStatsResult

export type CacheWorkflowPorts = {
  blameCache: BlameFileCache
}

type CacheWorkflowId = "cache.getStats" | "cache.clearAll"

export function createCacheWorkflowHandlers(
  ports: CacheWorkflowPorts,
): Pick<WorkflowHandlerMap<CacheWorkflowId>, CacheWorkflowId> {
  return {
    "cache.getStats": async (): Promise<CacheStatsResult> => {
      const blameStats = ports.blameCache.stats()
      return {
        caches: [
          {
            type: "blame",
            coldBytes: blameStats.coldBytes,
            coldEntries: blameStats.coldEntries,
          },
        ],
      }
    },
    "cache.clearAll": async (): Promise<CacheClearAllResult> => {
      ports.blameCache.clear()
      return { cleared: [...CACHE_TYPES] }
    },
  }
}
