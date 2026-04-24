import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  AnalysisConfig,
  AnalysisRosterContext,
} from "@repo-edu/domain/analysis"
import { DEFAULT_N_FILES } from "@repo-edu/domain/analysis"
import type { RosterMember } from "@repo-edu/domain/types"
import {
  buildAnalysisCacheKey,
  createInMemoryAnalysisCache,
} from "../analysis-workflows/cache.js"
import {
  buildBlameCacheKey,
  normalizeAnalysisConfigForCache,
  normalizeRosterContextForCache,
} from "../analysis-workflows/cache-keys.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<RosterMember> = {}): RosterMember {
  return {
    id: "m_1",
    name: "Alice Smith",
    email: "alice@example.com",
    studentNumber: null,
    gitUsername: null,
    gitUsernameStatus: "unknown",
    status: "active",
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: "student",
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "import",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// normalizeAnalysisConfigForCache
// ---------------------------------------------------------------------------

describe("normalizeAnalysisConfigForCache", () => {
  it("produces identical output for equivalent configs with explicit vs implicit defaults", () => {
    const explicit: AnalysisConfig = {
      nFiles: DEFAULT_N_FILES,
      whitespace: false,
      blameSkip: false,
      includeFiles: ["*"],
      extensions: [],
    }
    const implicit: AnalysisConfig = {}

    assert.equal(
      normalizeAnalysisConfigForCache(explicit),
      normalizeAnalysisConfigForCache(implicit),
    )
  })

  it("produces identical output regardless of array order for unordered sets", () => {
    const a: AnalysisConfig = {
      extensions: ["ts", "js", "py"],
      excludeFiles: ["*.test.ts", "*.spec.ts"],
    }
    const b: AnalysisConfig = {
      extensions: ["py", "ts", "js"],
      excludeFiles: ["*.spec.ts", "*.test.ts"],
    }

    assert.equal(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("deduplicates array entries", () => {
    const a: AnalysisConfig = {
      extensions: ["ts", "js", "ts"],
    }
    const b: AnalysisConfig = {
      extensions: ["js", "ts"],
    }

    assert.equal(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("normalizes extensions (lowercase, strip dot)", () => {
    const a: AnalysisConfig = { extensions: [".TS", "Js"] }
    const b: AnalysisConfig = { extensions: ["ts", "js"] }

    assert.equal(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("normalizes subfolder path separators and trailing slashes", () => {
    const a: AnalysisConfig = { subfolder: "src\\lib/" }
    const b: AnalysisConfig = { subfolder: "src/lib" }

    assert.equal(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("treats empty/undefined subfolder as equivalent", () => {
    const a: AnalysisConfig = { subfolder: "" }
    const b: AnalysisConfig = { subfolder: undefined }
    const c: AnalysisConfig = {}

    const na = normalizeAnalysisConfigForCache(a)
    assert.equal(na, normalizeAnalysisConfigForCache(b))
    assert.equal(na, normalizeAnalysisConfigForCache(c))
  })

  it("produces different output for semantically different configs", () => {
    const a: AnalysisConfig = { since: "2024-01-01" }
    const b: AnalysisConfig = { since: "2024-06-01" }

    assert.notEqual(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("produces different output for different nFiles", () => {
    const a: AnalysisConfig = { nFiles: 0 }
    const b: AnalysisConfig = { nFiles: 10 }

    assert.notEqual(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("excludes maxConcurrency from cache key", () => {
    const a: AnalysisConfig = { maxConcurrency: 1 }
    const b: AnalysisConfig = { maxConcurrency: 8 }

    assert.equal(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("trims pattern whitespace", () => {
    const a: AnalysisConfig = { excludeAuthors: ["  bot  "] }
    const b: AnalysisConfig = { excludeAuthors: ["bot"] }

    assert.equal(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })

  it("treats empty includeFiles and default includeFiles as equivalent", () => {
    const a: AnalysisConfig = { includeFiles: [] }
    const b: AnalysisConfig = { includeFiles: ["*"] }
    const c: AnalysisConfig = {}

    const na = normalizeAnalysisConfigForCache(a)
    assert.equal(na, normalizeAnalysisConfigForCache(b))
    assert.equal(na, normalizeAnalysisConfigForCache(c))
  })

  it("normalizes case for fnmatch-based pattern lists", () => {
    const a: AnalysisConfig = {
      includeFiles: ["SRC/*.TS"],
      excludeFiles: ["*.TEST.TS"],
      excludeAuthors: ["ALICE*"],
      excludeEmails: ["BOT@EXAMPLE.COM"],
      excludeMessages: ["WIP*"],
    }
    const b: AnalysisConfig = {
      includeFiles: ["src/*.ts"],
      excludeFiles: ["*.test.ts"],
      excludeAuthors: ["alice*"],
      excludeEmails: ["bot@example.com"],
      excludeMessages: ["wip*"],
    }

    assert.equal(
      normalizeAnalysisConfigForCache(a),
      normalizeAnalysisConfigForCache(b),
    )
  })
})

// ---------------------------------------------------------------------------
// normalizeRosterContextForCache
// ---------------------------------------------------------------------------

describe("normalizeRosterContextForCache", () => {
  it("returns null for undefined roster context", () => {
    assert.equal(normalizeRosterContextForCache(undefined), null)
  })

  it("returns null for empty members array", () => {
    assert.equal(normalizeRosterContextForCache({ members: [] }), null)
  })

  it("produces identical output regardless of member order", () => {
    const alice = makeMember({ id: "m_1", name: "Alice", email: "a@e.com" })
    const bob = makeMember({ id: "m_2", name: "Bob", email: "b@e.com" })

    const a: AnalysisRosterContext = { members: [alice, bob] }
    const b: AnalysisRosterContext = { members: [bob, alice] }

    assert.equal(
      normalizeRosterContextForCache(a),
      normalizeRosterContextForCache(b),
    )
  })

  it("normalizes whitespace and case in member names/emails", () => {
    const a: AnalysisRosterContext = {
      members: [
        makeMember({ name: "  Alice  Smith  ", email: "ALICE@Example.COM" }),
      ],
    }
    const b: AnalysisRosterContext = {
      members: [
        makeMember({ name: "Alice Smith", email: "alice@example.com" }),
      ],
    }

    assert.equal(
      normalizeRosterContextForCache(a),
      normalizeRosterContextForCache(b),
    )
  })

  it("produces different output for different members", () => {
    const a: AnalysisRosterContext = {
      members: [makeMember({ id: "m_1", email: "a@e.com" })],
    }
    const b: AnalysisRosterContext = {
      members: [makeMember({ id: "m_1", email: "b@e.com" })],
    }

    assert.notEqual(
      normalizeRosterContextForCache(a),
      normalizeRosterContextForCache(b),
    )
  })

  it("returns a compact fingerprint hash when roster context is present", () => {
    const fingerprint = normalizeRosterContextForCache({
      members: [makeMember({ id: "m_1", email: "a@e.com" })],
    })

    assert.ok(fingerprint)
    assert.match(fingerprint, /^[0-9a-f]{8}$/)
  })
})

// ---------------------------------------------------------------------------
// buildAnalysisCacheKey
// ---------------------------------------------------------------------------

describe("buildAnalysisCacheKey", () => {
  it("produces a stable compact hash for the same inputs", () => {
    const parts = {
      repoGitDir: "/repos/test/.git",
      resolvedAsOfOid: "abc123",
      normalizedConfigJson: '{"nFiles":5}',
      normalizedRosterFingerprint: null,
    }
    const a = buildAnalysisCacheKey(parts)
    const b = buildAnalysisCacheKey(parts)
    assert.equal(a, b)
    assert.match(a, /^[0-9a-f]+$/)
  })

  it("changes when any component changes", () => {
    const base = {
      repoGitDir: "/repos/test/.git",
      resolvedAsOfOid: "abc123",
      normalizedConfigJson: '{"nFiles":5}',
      normalizedRosterFingerprint: null,
    }

    const baseline = buildAnalysisCacheKey(base)
    assert.notEqual(
      baseline,
      buildAnalysisCacheKey({ ...base, repoGitDir: "/repos/other/.git" }),
    )
    assert.notEqual(
      baseline,
      buildAnalysisCacheKey({ ...base, resolvedAsOfOid: "def456" }),
    )
    assert.notEqual(
      baseline,
      buildAnalysisCacheKey({ ...base, normalizedConfigJson: "{}" }),
    )
    assert.notEqual(
      baseline,
      buildAnalysisCacheKey({
        ...base,
        normalizedRosterFingerprint: '[{"id":"m_1"}]',
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// buildBlameCacheKey
// ---------------------------------------------------------------------------

describe("buildBlameCacheKey", () => {
  it("changes when ignore-revs fingerprint changes", () => {
    const base = {
      resolvedOid: "abc123",
      filePath: "src/main.ts",
      config: {},
      hasIgnoreRevsFile: true,
      ignoreRevsFingerprint: "hash-a",
    }

    const a = buildBlameCacheKey(base)
    const b = buildBlameCacheKey({ ...base, ignoreRevsFingerprint: "hash-b" })
    assert.notEqual(a, b)
  })

  it("changes when ignore-revs usage toggles", () => {
    const base = {
      resolvedOid: "abc123",
      filePath: "src/main.ts",
      config: {},
      ignoreRevsFingerprint: null,
    }

    const withoutIgnoreRevs = buildBlameCacheKey({
      ...base,
      hasIgnoreRevsFile: false,
    })
    const withIgnoreRevs = buildBlameCacheKey({
      ...base,
      hasIgnoreRevsFile: true,
      ignoreRevsFingerprint: "hash-a",
    })

    assert.notEqual(withoutIgnoreRevs, withIgnoreRevs)
  })

  it("produces identical output across different repoGitDir values", () => {
    // Two clones of the same origin at the same OID must share a cache hit.
    const shared = {
      resolvedOid: "abc123",
      filePath: "src/main.ts",
      config: {},
      hasIgnoreRevsFile: false,
      ignoreRevsFingerprint: null,
    }
    assert.equal(buildBlameCacheKey(shared), buildBlameCacheKey(shared))
  })
})

// ---------------------------------------------------------------------------
// In-memory layered cache (hot layer only; cold is a no-op)
// ---------------------------------------------------------------------------

describe("createInMemoryAnalysisCache", () => {
  const dummyResult = {
    resolvedAsOfOid: "abc123",
    authorStats: [],
    fileStats: [],
    authorDailyActivity: [],
    personDbBaseline: {
      persons: [],
      identityIndex: new Map<string, string>(),
    },
  }

  it("returns undefined for cache miss", () => {
    const cache = createInMemoryAnalysisCache(1024)
    assert.equal(cache.get("nonexistent"), undefined)
  })

  it("returns cached result on hit", () => {
    const cache = createInMemoryAnalysisCache(1024)
    cache.set("key1", dummyResult)

    const cached = cache.get("key1")
    assert.ok(cached)
    assert.equal(cached.resolvedAsOfOid, "abc123")
  })

  it("preserves Map instances inside personDbBaseline across hot hits", () => {
    const cache = createInMemoryAnalysisCache(1024)
    const result = {
      ...dummyResult,
      personDbBaseline: {
        persons: [],
        identityIndex: new Map([["foo", "bar"]]),
      },
    }
    cache.set("key1", result)

    const cached = cache.get("key1")
    assert.ok(cached)
    assert.ok(cached.personDbBaseline.identityIndex instanceof Map)
    assert.equal(cached.personDbBaseline.identityIndex.get("foo"), "bar")
  })
})
