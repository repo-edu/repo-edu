import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { fnmatchFilter } from "../analysis-workflows/filter-utils.js"

describe("fnmatchFilter", () => {
  it("matches wildcard patterns", () => {
    assert.ok(fnmatchFilter("test.ts", ["*.ts"]))
    assert.ok(!fnmatchFilter("test.js", ["*.ts"]))
  })

  it("matches case-insensitively", () => {
    assert.ok(fnmatchFilter("Test.TS", ["*.ts"]))
    assert.ok(fnmatchFilter("FILE.TXT", ["*.txt"]))
  })

  it("matches question mark for single character", () => {
    assert.ok(fnmatchFilter("test1.ts", ["test?.ts"]))
    assert.ok(!fnmatchFilter("test12.ts", ["test?.ts"]))
  })

  it("matches star pattern across path separators", () => {
    assert.ok(fnmatchFilter("src/deep/file.ts", ["*file.ts"]))
  })

  it("matches character classes", () => {
    assert.ok(fnmatchFilter("test1.ts", ["test[0-9].ts"]))
    assert.ok(!fnmatchFilter("testa.ts", ["test[0-9].ts"]))
  })

  it("matches negated character classes", () => {
    assert.ok(fnmatchFilter("testa.ts", ["test[!0-9].ts"]))
    assert.ok(!fnmatchFilter("test1.ts", ["test[!0-9].ts"]))
  })

  it("returns true if any pattern matches", () => {
    assert.ok(fnmatchFilter("test.py", ["*.ts", "*.py"]))
  })

  it("returns false for empty patterns list", () => {
    assert.ok(!fnmatchFilter("test.ts", []))
  })

  it("matches WIP* against WIP prefix (commit message exclusion)", () => {
    assert.ok(fnmatchFilter("WIP: temp changes", ["WIP*"]))
    assert.ok(!fnmatchFilter("Fix bug", ["WIP*"]))
  })
})
