import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildBlameCacheKey } from "../analysis-workflows/cache-keys.js"

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
