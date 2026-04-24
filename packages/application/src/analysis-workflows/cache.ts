import type { AnalysisResult, FileBlame } from "@repo-edu/domain/analysis"
import type { PersistentCache } from "@repo-edu/host-runtime-contract"
import {
  createByteBudgetedLru,
  createLayeredCache,
  hashCacheKey,
  type LayeredCache,
  noopPersistentCache,
  structuredJsonSerde,
} from "../cache/layered-cache.js"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AnalysisResultCache = LayeredCache<AnalysisResult>
export type BlameFileCache = LayeredCache<FileBlame>

// ---------------------------------------------------------------------------
// Cache key builder
// ---------------------------------------------------------------------------

export function buildAnalysisCacheKey(parts: {
  repoGitDir: string
  resolvedAsOfOid: string
  normalizedConfigJson: string
  normalizedRosterFingerprint: string | null
}): string {
  const raw = [
    "analysis",
    parts.repoGitDir,
    parts.resolvedAsOfOid,
    parts.normalizedConfigJson,
    parts.normalizedRosterFingerprint ?? "no-roster",
  ].join("\0")
  return hashCacheKey(raw)
}

// ---------------------------------------------------------------------------
// Factories — produce hot/cold layered caches for analysis and blame
// ---------------------------------------------------------------------------

export type AnalysisCachesOptions = {
  cache: PersistentCache
  blameCache: PersistentCache
  hotAnalysisBytes: number
  hotBlameBytes: number
  disabled?: boolean
}

export function createAnalysisCaches(options: AnalysisCachesOptions): {
  analysis: AnalysisResultCache
  blame: BlameFileCache
} {
  const analysis = createLayeredCache<AnalysisResult>({
    hot: createByteBudgetedLru(options.hotAnalysisBytes),
    cold: options.cache,
    serde: structuredJsonSerde<AnalysisResult>(),
    disabled: options.disabled,
  })

  const blame = createLayeredCache<FileBlame>({
    hot: createByteBudgetedLru(options.hotBlameBytes),
    cold: options.blameCache,
    serde: structuredJsonSerde<FileBlame>(),
    disabled: options.disabled,
  })

  return { analysis, blame }
}

/**
 * In-memory-only analysis cache for environments that don't wire a
 * persistent store (CLI/docs). Shares the layered surface so handler
 * wiring is uniform.
 */
export function createInMemoryAnalysisCache(
  hotBytes = 200 * 1024 * 1024,
): AnalysisResultCache {
  return createLayeredCache<AnalysisResult>({
    hot: createByteBudgetedLru(hotBytes),
    cold: noopPersistentCache,
    serde: structuredJsonSerde<AnalysisResult>(),
  })
}
