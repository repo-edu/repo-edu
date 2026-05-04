import type {
  AnalysisBlameConfig,
  AnalysisConfig,
  AnalysisRosterContext,
} from "@repo-edu/domain/analysis"
import { DEFAULT_N_FILES } from "@repo-edu/domain/analysis"
import { fnv1a32Hex, hashCacheKey } from "../cache/layered-cache.js"

// ---------------------------------------------------------------------------
// Stable-key JSON serialization
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const entries = keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
    )
    .join(",")
  return `{${entries}}`
}

// ---------------------------------------------------------------------------
// Config canonicalization
// ---------------------------------------------------------------------------

function canonicalizeStringArray(
  values: string[] | undefined,
  options: { sorted: boolean; lowercase?: boolean } = { sorted: false },
): string[] {
  if (!values || values.length === 0) return []
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => (options.lowercase ? value.toLowerCase() : value))
  const deduped = [...new Set(normalized)]
  return options.sorted ? deduped.sort() : deduped
}

/**
 * Produces a canonical JSON string for an `AnalysisConfig` such that
 * semantically equivalent configs yield identical output.
 *
 * - Expands defaults for omitted optional fields.
 * - Normalizes extensions (lowercase, strip leading dot, dedup, sort).
 * - Sorts unordered-set arrays; preserves order for ordered lists.
 * - Trims strings; normalizes POSIX paths.
 * - Canonicalizes empty equivalents to a single representation.
 * - Excludes non-semantic/transient fields (`maxConcurrency`).
 */
export function normalizeAnalysisConfigForCache(
  config: AnalysisConfig,
): string {
  const extensions = canonicalizeStringArray(
    (config.extensions ?? []).map((e) =>
      e.trim().toLowerCase().replace(/^\./, ""),
    ),
    { sorted: true },
  )

  const subfolder = config.subfolder
    ? config.subfolder.trim().replace(/\\/g, "/").replace(/\/+$/, "")
    : ""

  const includeFiles = canonicalizeStringArray(config.includeFiles ?? ["*"], {
    sorted: true,
    lowercase: true,
  })

  const canonical = {
    since: config.since ?? null,
    until: config.until ?? null,
    subfolder: subfolder || null,
    extensions: extensions.length > 0 ? extensions : null,
    includeFiles:
      includeFiles.length === 0 ||
      (includeFiles.length === 1 && includeFiles[0] === "*")
        ? ["*"]
        : includeFiles,
    excludeFiles: canonicalizeStringArray(config.excludeFiles, {
      sorted: true,
      lowercase: true,
    }),
    excludeAuthors: canonicalizeStringArray(config.excludeAuthors, {
      sorted: true,
      lowercase: true,
    }),
    excludeEmails: canonicalizeStringArray(config.excludeEmails, {
      sorted: true,
      lowercase: true,
    }),
    excludeRevisions: canonicalizeStringArray(config.excludeRevisions, {
      sorted: true,
    }),
    excludeMessages: canonicalizeStringArray(config.excludeMessages, {
      sorted: true,
      lowercase: true,
    }),
    nFiles: config.nFiles ?? DEFAULT_N_FILES,
    whitespace: config.whitespace ?? false,
    blameSkip: config.blameSkip ?? false,
  }

  return stableStringify(canonical)
}

// ---------------------------------------------------------------------------
// Roster context canonicalization
// ---------------------------------------------------------------------------

function normalizeForBridge(value: string): string {
  return value.trim().split(/\s+/).join(" ").toLowerCase()
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
 * previously persisted blame entries no longer collide with new keys. Lives
 * separately from the analysis schema version because the two pipelines
 * evolve independently — a change in author-stat aggregation should not
 * invalidate the (very expensive) cold blame cache.
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

/**
 * Fingerprint of the full analysis cache key — exposed so the renderer can
 * detect whether a per-repo cached result was computed under the same
 * (config, roster, OID) tuple as the current run without duplicating the
 * normalization logic.
 */
export function getAnalysisConfigFingerprint(
  config: AnalysisConfig,
  rosterContext: AnalysisRosterContext | undefined,
): string {
  return `${normalizeAnalysisConfigForCache(config)}\0${
    normalizeRosterContextForCache(rosterContext) ?? "no-roster"
  }`
}

/**
 * Produces a compact deterministic roster fingerprint for cache-key
 * material. Canonicalizes member identities using the same normalization
 * as bridge semantics, then sorts for stable ordering before hashing.
 *
 * Returns `null` when the roster context is absent or empty (no-context
 * and unmatched states are canonicalized to the same representation).
 */
export function normalizeRosterContextForCache(
  rosterContext: AnalysisRosterContext | undefined,
): string | null {
  if (!rosterContext || rosterContext.members.length === 0) return null

  const entries = rosterContext.members
    .map((m) => ({
      id: m.id,
      name: normalizeForBridge(m.name),
      email: normalizeForBridge(m.email),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  return fnv1a32Hex(stableStringify(entries))
}
