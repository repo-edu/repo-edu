import type {
  AnalysisConfig,
  AnalysisRosterContext,
} from "@repo-edu/domain/analysis"
import { DEFAULT_N_FILES } from "@repo-edu/domain/analysis"

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

function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
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
