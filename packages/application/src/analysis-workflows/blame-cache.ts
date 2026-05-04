import type { AnalysisBlameConfig, FileBlame } from "@repo-edu/domain/analysis"
import type { PersistentCache } from "@repo-edu/host-runtime-contract"
import {
  createByteBudgetedLru,
  createLayeredCache,
  hashCacheKey,
  type LayeredCache,
  structuredJsonSerde,
} from "../cache/layered-cache.js"

// ---------------------------------------------------------------------------
// Blame file cache
// ---------------------------------------------------------------------------

export type BlameFileCache = LayeredCache<FileBlame>

export type BlameFileCacheOptions = {
  cache: PersistentCache
  hotBytes: number
  disabled?: boolean
}

export function createBlameFileCache(
  options: BlameFileCacheOptions,
): BlameFileCache {
  return createLayeredCache<FileBlame>({
    hot: createByteBudgetedLru(options.hotBytes),
    cold: options.cache,
    serde: structuredJsonSerde<FileBlame>(),
    disabled: options.disabled,
  })
}

// ---------------------------------------------------------------------------
// Blame cache key builder
// ---------------------------------------------------------------------------

/**
 * Copy-move flag mapping (must match `blame-handler.ts::COPY_MOVE_FLAGS`).
 */
const BLAME_COPY_MOVE_FLAGS: Record<number, string[]> = {
  0: [],
  1: ["-M"],
  2: ["-C"],
  3: ["-C", "-C"],
  4: ["-C", "-C", "-C"],
}

/**
 * Produces the blame `git` argv for a given `(config, OID sentinel, path
 * sentinel)` tuple. The argv shape is canonical cache-key material: any
 * future flag added to blame automatically participates in the key, and
 * removed flags stop participating. Kept in sync with `buildBlameArgs`
 * (see comment in `blame-handler.ts`).
 *
 * The real commit OID and file path contribute to the key separately, so
 * we substitute sentinels here to avoid double-counting and to keep the
 * canonical form stable across different OID/path values.
 */
export function buildBlameKeyArgv(
  config: AnalysisBlameConfig,
  hasIgnoreRevsFile: boolean,
): string[] {
  const args = ["blame", "--follow", "--porcelain"]
  const copyMoveLevel = config.copyMove ?? 1
  const flags = BLAME_COPY_MOVE_FLAGS[copyMoveLevel] ?? BLAME_COPY_MOVE_FLAGS[1]
  args.push(...flags)
  if (!config.whitespace) args.push("-w")
  if (hasIgnoreRevsFile && (config.ignoreRevsFile ?? true)) {
    args.push("--ignore-revs-file=_git-blame-ignore-revs.txt")
  }
  args.push("<OID>", "--", "<FILE>")
  return args
}

/**
 * Bump when the blame parsing/aggregation pipeline changes shape so that
 * previously persisted blame entries no longer collide with new keys.
 */
export const BLAME_CACHE_SCHEMA_VERSION = 1

/**
 * Blame output is a deterministic function of `(resolved OID, file path,
 * git argv, working-tree ignore-revs file)`. `repoGitDir` deliberately does
 * NOT participate: two clones of the same origin at the same OID produce
 * byte-identical blame, so keying by path would lose the entire win of the
 * cold cache for cohorts of student forks.
 */
export function buildBlameCacheKey(parts: {
  resolvedOid: string
  filePath: string
  config: AnalysisBlameConfig
  hasIgnoreRevsFile: boolean
  ignoreRevsFingerprint: string | null
}): string {
  const argv = buildBlameKeyArgv(parts.config, parts.hasIgnoreRevsFile)
  const raw = [
    "blame",
    `v${BLAME_CACHE_SCHEMA_VERSION}`,
    parts.resolvedOid,
    parts.filePath,
    parts.ignoreRevsFingerprint ?? "no-ignore-revs",
    JSON.stringify(argv),
  ].join("\0")
  return hashCacheKey(raw)
}
