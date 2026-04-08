import type { AnalysisResult } from "@repo-edu/domain/analysis"

// ---------------------------------------------------------------------------
// Schema version — bump to invalidate all cached entries
// ---------------------------------------------------------------------------

export const ANALYSIS_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export type AnalysisResultCache = {
  get(key: string): AnalysisResult | undefined
  set(key: string, value: AnalysisResult): void
}

// ---------------------------------------------------------------------------
// Cache key builder
// ---------------------------------------------------------------------------

export function buildAnalysisCacheKey(parts: {
  repoGitDir: string
  resolvedAsOfOid: string
  normalizedConfigJson: string
  normalizedRosterFingerprint: string | null
}): string {
  const segments = [
    `v${ANALYSIS_SCHEMA_VERSION}`,
    parts.repoGitDir,
    parts.resolvedAsOfOid,
    parts.normalizedConfigJson,
    parts.normalizedRosterFingerprint ?? "no-roster",
  ]
  return segments.join("\0")
}

// ---------------------------------------------------------------------------
// Serializable result helpers
// ---------------------------------------------------------------------------

type SerializableAuthorBreakdown = {
  insertions: number
  deletions: number
  commits: number
  commitShas: string[]
}

type SerializableFileStats = Omit<
  AnalysisResult["fileStats"][number],
  "commitShas" | "authorBreakdown"
> & {
  commitShas: string[]
  authorBreakdown: [string, SerializableAuthorBreakdown][]
}

type SerializableAuthorStats = Omit<
  AnalysisResult["authorStats"][number],
  "commitShas"
> & {
  commitShas: string[]
}

type SerializablePersonDbSnapshot = Omit<
  AnalysisResult["personDbBaseline"],
  "identityIndex"
> & {
  identityIndex: [string, string][]
}

type SerializableAnalysisResult = Omit<
  AnalysisResult,
  "authorStats" | "fileStats" | "personDbBaseline"
> & {
  authorStats: SerializableAuthorStats[]
  fileStats: SerializableFileStats[]
  personDbBaseline: SerializablePersonDbSnapshot
}

function toSerializable(result: AnalysisResult): SerializableAnalysisResult {
  return {
    ...result,
    authorStats: result.authorStats.map((s) => ({
      ...s,
      commitShas: [...s.commitShas],
    })),
    fileStats: result.fileStats.map((f) => ({
      ...f,
      commitShas: [...f.commitShas],
      authorBreakdown: [...f.authorBreakdown.entries()].map(([k, v]) => [
        k,
        { ...v, commitShas: [...v.commitShas] },
      ]),
    })),
    personDbBaseline: {
      ...result.personDbBaseline,
      identityIndex: [...result.personDbBaseline.identityIndex.entries()],
    },
  }
}

function fromSerializable(s: SerializableAnalysisResult): AnalysisResult {
  return {
    ...s,
    authorStats: s.authorStats.map((a) => ({
      ...a,
      commitShas: new Set(a.commitShas),
    })),
    fileStats: s.fileStats.map((f) => ({
      ...f,
      commitShas: new Set(f.commitShas),
      authorBreakdown: new Map(
        f.authorBreakdown.map(([k, v]) => [
          k,
          { ...v, commitShas: new Set(v.commitShas) },
        ]),
      ),
    })),
    personDbBaseline: {
      ...s.personDbBaseline,
      identityIndex: new Map(s.personDbBaseline.identityIndex),
    },
  }
}

// ---------------------------------------------------------------------------
// LRU cache implementation
// ---------------------------------------------------------------------------

export function createLruAnalysisCache(
  maxEntries: number,
): AnalysisResultCache {
  const entries = new Map<string, SerializableAnalysisResult>()

  return {
    get(key) {
      const serialized = entries.get(key)
      if (!serialized) return undefined

      // Move to end (most recently used)
      entries.delete(key)
      entries.set(key, serialized)

      return fromSerializable(serialized)
    },

    set(key, value) {
      // Delete first so re-insertion moves to end
      entries.delete(key)

      if (entries.size >= maxEntries) {
        // Evict least recently used (first entry)
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }

      entries.set(key, toSerializable(value))
    },
  }
}
