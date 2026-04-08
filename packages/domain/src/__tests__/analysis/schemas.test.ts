import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  validateAnalysisConfig,
  validateAnalysisBlameConfig,
} from "../../analysis/schemas.js"

describe("validateAnalysisConfig", () => {
  it("accepts empty config with defaults", () => {
    const result = validateAnalysisConfig({})
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.nFiles, 5)
    assert.equal(result.value.whitespace, false)
    assert.equal(result.value.maxConcurrency, 1)
    assert.equal(result.value.blameSkip, false)
    assert.deepStrictEqual(result.value.includeFiles, ["*"])
  })

  it("accepts valid date range", () => {
    const result = validateAnalysisConfig({
      since: "2024-01-01",
      until: "2024-12-31",
    })
    assert.equal(result.ok, true)
  })

  it("accepts single-day range (since === until)", () => {
    const result = validateAnalysisConfig({
      since: "2024-06-15",
      until: "2024-06-15",
    })
    assert.equal(result.ok, true)
  })

  it("rejects since > until", () => {
    const result = validateAnalysisConfig({
      since: "2024-12-31",
      until: "2024-01-01",
    })
    assert.equal(result.ok, false)
  })

  it("rejects invalid calendar date", () => {
    const result = validateAnalysisConfig({ since: "2024-02-30" })
    assert.equal(result.ok, false)
  })

  it("rejects non-YYYY-MM-DD format", () => {
    const result = validateAnalysisConfig({ since: "01/15/2024" })
    assert.equal(result.ok, false)
  })

  it("normalizes extensions to lowercase with dedup", () => {
    const result = validateAnalysisConfig({
      extensions: [".TS", "ts", ".Js", "  py  "],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepStrictEqual(result.value.extensions, ["ts", "js", "py"])
  })

  it("normalizes pattern arrays with trim and dedup", () => {
    const result = validateAnalysisConfig({
      excludeAuthors: ["  Alice  ", "Bob", "Alice"],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepStrictEqual(result.value.excludeAuthors, ["Alice", "Bob"])
  })

  it("rejects empty pattern entries after trim", () => {
    const result = validateAnalysisConfig({
      excludeFiles: ["*.log", "  ", "*.tmp"],
    })
    assert.equal(result.ok, false)
  })

  it("rejects fully empty pattern entries", () => {
    const result = validateAnalysisConfig({
      excludeFiles: ["*.log", "", "*.tmp"],
    })
    assert.equal(result.ok, false)
  })

  it("accepts valid fnmatch patterns that match nothing", () => {
    const result = validateAnalysisConfig({
      includeFiles: ["nonexistent-pattern-*"],
    })
    assert.equal(result.ok, true)
  })

  it("rejects absolute subfolder path", () => {
    const result = validateAnalysisConfig({ subfolder: "/absolute/path" })
    assert.equal(result.ok, false)
  })

  it("rejects subfolder with .. escape", () => {
    const result = validateAnalysisConfig({ subfolder: "src/../secret" })
    assert.equal(result.ok, false)
  })

  it("normalizes subfolder to POSIX with trailing slash removed", () => {
    const result = validateAnalysisConfig({ subfolder: "src\\lib\\" })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.subfolder, "src/lib")
  })

  it("accepts empty subfolder", () => {
    const result = validateAnalysisConfig({ subfolder: "  " })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.subfolder, "")
  })

  it("clamps maxConcurrency to [1, 16]", () => {
    const tooLow = validateAnalysisConfig({ maxConcurrency: 0 })
    assert.equal(tooLow.ok, false)

    const tooHigh = validateAnalysisConfig({ maxConcurrency: 100 })
    assert.equal(tooHigh.ok, false)

    const valid = validateAnalysisConfig({ maxConcurrency: 8 })
    assert.equal(valid.ok, true)
    if (!valid.ok) return
    assert.equal(valid.value.maxConcurrency, 8)
  })

  it("rejects non-integer maxConcurrency", () => {
    const result = validateAnalysisConfig({ maxConcurrency: 2.5 })
    assert.equal(result.ok, false)
  })

  it("accepts nFiles = 0 (all files)", () => {
    const result = validateAnalysisConfig({ nFiles: 0 })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.nFiles, 0)
  })

  it("rejects negative nFiles", () => {
    const result = validateAnalysisConfig({ nFiles: -1 })
    assert.equal(result.ok, false)
  })

  it("rejects malformed subfolder shapes (array) with path-level issue", () => {
    const result = validateAnalysisConfig({ subfolder: ["src"] })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.ok(result.issues.some((i) => i.path.includes("subfolder")))
  })

  it("rejects malformed subfolder shapes (object) with path-level issue", () => {
    const result = validateAnalysisConfig({ subfolder: { path: "src" } })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.ok(result.issues.some((i) => i.path.includes("subfolder")))
  })
})

describe("validateAnalysisBlameConfig", () => {
  it("accepts empty config with defaults", () => {
    const result = validateAnalysisBlameConfig({})
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.copyMove, 1)
    assert.equal(result.value.includeEmptyLines, false)
    assert.equal(result.value.includeComments, false)
    assert.equal(result.value.blameExclusions, "hide")
    assert.equal(result.value.ignoreRevsFile, true)
    assert.equal(result.value.whitespace, false)
    assert.equal(result.value.maxConcurrency, 1)
    assert.deepStrictEqual(result.value.includeFiles, ["*"])
  })

  it("rejects date-range keys (since)", () => {
    const result = validateAnalysisBlameConfig({ since: "2024-01-01" })
    assert.equal(result.ok, false)
  })

  it("rejects date-range keys (until)", () => {
    const result = validateAnalysisBlameConfig({ until: "2024-12-31" })
    assert.equal(result.ok, false)
  })

  it("rejects log-only keys (excludeRevisions)", () => {
    const result = validateAnalysisBlameConfig({ excludeRevisions: ["abc123"] })
    assert.equal(result.ok, false)
  })

  it("rejects log-only keys (excludeMessages)", () => {
    const result = validateAnalysisBlameConfig({ excludeMessages: ["*merge*"] })
    assert.equal(result.ok, false)
  })

  it("clamps copyMove to [0, 4]", () => {
    const tooLow = validateAnalysisBlameConfig({ copyMove: -1 })
    assert.equal(tooLow.ok, false)

    const tooHigh = validateAnalysisBlameConfig({ copyMove: 5 })
    assert.equal(tooHigh.ok, false)

    const valid = validateAnalysisBlameConfig({ copyMove: 3 })
    assert.equal(valid.ok, true)
    if (!valid.ok) return
    assert.equal(valid.value.copyMove, 3)
  })

  it("rejects non-integer copyMove", () => {
    const result = validateAnalysisBlameConfig({ copyMove: 1.5 })
    assert.equal(result.ok, false)
  })

  it("accepts blameExclusions enum values", () => {
    for (const mode of ["hide", "show", "remove"] as const) {
      const result = validateAnalysisBlameConfig({ blameExclusions: mode })
      assert.equal(result.ok, true)
      if (!result.ok) return
      assert.equal(result.value.blameExclusions, mode)
    }
  })

  it("shares excludeAuthors/excludeEmails normalization with AnalysisConfig", () => {
    const result = validateAnalysisBlameConfig({
      excludeAuthors: ["  Alice  ", "Bob", "Alice"],
      excludeEmails: [" alice@test.com ", "alice@test.com"],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepStrictEqual(result.value.excludeAuthors, ["Alice", "Bob"])
    assert.deepStrictEqual(result.value.excludeEmails, ["alice@test.com"])
  })
})
