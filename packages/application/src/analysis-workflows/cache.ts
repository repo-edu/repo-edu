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

/**
 * Bump when the analysis aggregation pipeline changes shape so that previously
 * persisted entries (computed by older code) no longer collide with new keys.
 *
 * History:
 * - v1: per-file `--follow` drove every aggregate (commits/insertions/age/
 *   daily activity were silently bound by the `nFiles` cap).
 * - v2: split — repo-wide log feeds author-level aggregates and daily
 *   activity; per-file path only feeds `fileStats` and per-file breakdowns.
 */
export const ANALYSIS_CACHE_SCHEMA_VERSION = 2

export function buildAnalysisCacheKey(parts: {
  repoGitDir: string
  resolvedAsOfOid: string
  normalizedConfigJson: string
  normalizedRosterFingerprint: string | null
}): string {
  const raw = [
    "analysis",
    `v${ANALYSIS_CACHE_SCHEMA_VERSION}`,
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
