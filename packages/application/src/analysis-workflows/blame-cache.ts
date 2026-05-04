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
// Blame argv builder (shared by handler invocation and cache keying)
// ---------------------------------------------------------------------------

/**
 * Copy-move flag mapping (Python parity):
 * 0 = no detection, 1 = -M, 2 = -C, 3 = -C -C, 4 = -C -C -C
 */
const BLAME_COPY_MOVE_FLAGS: Record<number, string[]> = {
  0: [],
  1: ["-M"],
  2: ["-C"],
  3: ["-C", "-C"],
  4: ["-C", "-C", "-C"],
}

/**
 * Sentinels substituted for the real OID and file path when the argv is
 * being hashed into a cache key. Kept as named constants so the cache-key
 * call site reads as a sentinel substitution rather than magic strings.
 */
export const BLAME_KEY_OID_SENTINEL = "<OID>"
export const BLAME_KEY_FILE_SENTINEL = "<FILE>"

/**
 * Builds the `git blame` argv for a given `(OID, file, config)` triple.
 * The argv shape is canonical cache-key material: any flag added here
 * automatically participates in the cache key when called with sentinels,
 * and removed flags stop participating. The real OID and file path
 * contribute to the key separately, so the cache-key call substitutes
 * `BLAME_KEY_OID_SENTINEL` / `BLAME_KEY_FILE_SENTINEL` to keep the
 * canonical form stable across different OID/path values.
 */
export function buildBlameArgs(
  commitOid: string,
  filePath: string,
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
  args.push(commitOid, "--", filePath)
  return args
}

// ---------------------------------------------------------------------------
// Blame cache key builder
// ---------------------------------------------------------------------------

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
  const argv = buildBlameArgs(
    BLAME_KEY_OID_SENTINEL,
    BLAME_KEY_FILE_SENTINEL,
    parts.config,
    parts.hasIgnoreRevsFile,
  )
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
