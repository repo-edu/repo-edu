import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  compileAnalysisFilterPatterns,
  compileGroupNamePattern,
  compileRepoNamePattern,
} from "../pattern-matching.js"

function compiledAnalysis(patterns: readonly string[]) {
  const result = compileAnalysisFilterPatterns(patterns)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("Expected analysis patterns to compile")
  return result.value
}

function compiledGroup(pattern: string) {
  const result = compileGroupNamePattern(pattern)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error("Expected group pattern to compile")
  return result.value
}

describe("repo-name pattern matching", () => {
  it("treats undefined and empty patterns as reusable match-all predicates", () => {
    const undefinedPattern = compileRepoNamePattern(undefined)
    const emptyPattern = compileRepoNamePattern("")

    assert.equal(undefinedPattern(""), true)
    assert.equal(undefinedPattern("students/alice"), true)
    assert.equal(emptyPattern("anything"), true)
  })

  it("keeps the repository wildcard, separator and newline contract", () => {
    assert.equal(compileRepoNamePattern("lab1-*")("lab1-alice"), true)
    assert.equal(compileRepoNamePattern("lab1-*")("LAB1-alice"), false)
    assert.equal(
      compileRepoNamePattern("students/*")("students/alice/repo"),
      true,
    )
    assert.equal(compileRepoNamePattern("students/**")("students/alice"), true)
    assert.equal(compileRepoNamePattern("team?one")("team/one"), true)
    assert.equal(compileRepoNamePattern("team*one")("team\none"), false)
    assert.equal(compileRepoNamePattern("*")(".hidden"), true)
  })

  it("treats non-wildcard syntax and backslashes literally", () => {
    assert.equal(compileRepoNamePattern("[ab]")("[ab]"), true)
    assert.equal(compileRepoNamePattern("!team")("!team"), true)
    assert.equal(compileRepoNamePattern("team\\one")("team\\one"), true)
    assert.equal(compileRepoNamePattern("team-*")("team-one"), true)
  })
})

describe("analysis-filter pattern matching", () => {
  it("compiles an empty list to match-none, including for an empty value", () => {
    const predicate = compiledAnalysis([])
    assert.equal(predicate(""), false)
    assert.equal(predicate("anything"), false)
  })

  it("matches any pattern without case, separator, newline or dot limits", () => {
    const predicate = compiledAnalysis(["*.TS", "WIP*"])
    assert.equal(predicate("src/deep/file.ts"), true)
    assert.equal(predicate("WIP: first\nsecond"), true)
    assert.equal(compiledAnalysis(["?"])("/"), true)
    assert.equal(compiledAnalysis(["?"])("\n"), true)
    assert.equal(compiledAnalysis(["*"])(".hidden"), true)
    assert.equal(predicate("file.js"), false)
  })

  it("supports positive, ranged and both negated character classes", () => {
    assert.equal(compiledAnalysis(["test[abc].ts"])("testb.ts"), true)
    assert.equal(compiledAnalysis(["test[0-9].ts"])("test4.ts"), true)
    assert.equal(compiledAnalysis(["test[!0-9].ts"])("testa.ts"), true)
    assert.equal(compiledAnalysis(["test[^0-9].ts"])("testa.ts"), true)
  })

  it("preserves the analysis class boundary rules", () => {
    assert.equal(compiledAnalysis(["[]a]"])("]"), true)
    assert.equal(compiledAnalysis(["[]a]"])("a"), true)
    assert.equal(compiledAnalysis(["[]"])("[]"), true)
    assert.equal(compiledAnalysis(["[abc"])("[abc"), true)
    assert.equal(compiledAnalysis(["[!]"])("x"), true)
  })

  it("treats backslashes, leading negation and patched hyphens literally", () => {
    assert.equal(compiledAnalysis(["team\\one"])("team\\one"), true)
    assert.equal(compiledAnalysis(["!team"])("!team"), true)
    assert.equal(compiledAnalysis(["team-*"])("team-one"), true)
  })

  it("returns the failing pattern index for invalid engine syntax", () => {
    const result = compileAnalysisFilterPatterns(["valid*", "[z-a]"])
    assert.equal(result.ok, false)
    if (result.ok) throw new Error("Expected analysis compilation to fail")
    assert.equal(result.issues.length, 1)
    assert.equal(result.issues[0]?.path, "patterns.1")
    assert.match(result.issues[0]?.message ?? "", /range|character class/i)
  })
})

describe("group-name pattern matching", () => {
  it("keeps blank function input distinct from the dialog select-all rule", () => {
    const predicate = compiledGroup("")
    assert.equal(predicate(""), true)
    assert.equal(predicate("group"), false)
  })

  it("matches Unicode code points and crosses separators and newlines", () => {
    assert.equal(compiledGroup("?")("😀"), true)
    assert.equal(compiledGroup("team?one")("team/one"), true)
    assert.equal(compiledGroup("team*one")("team/one"), true)
    assert.equal(compiledGroup("team*one")("team\none"), true)
  })

  it("supports classes, ranges, negation and escaped class members", () => {
    assert.equal(compiledGroup("team-[abc]")("team-b"), true)
    assert.equal(compiledGroup("team-[a-c]")("team-b"), true)
    assert.equal(compiledGroup("team-[!a-c]")("team-z"), true)
    assert.equal(compiledGroup("team-[^a-c]")("team-z"), true)
    assert.equal(compiledGroup(String.raw`[\]]`)("]"), true)
    assert.equal(compiledGroup(String.raw`[a\-c]`)("-"), true)
  })

  it("supports escapes and the patched literal backslash and hyphen cases", () => {
    assert.equal(compiledGroup(String.raw`team\*`)("team*"), true)
    assert.equal(compiledGroup(String.raw`team\\one`)("team\\one"), true)
    assert.equal(compiledGroup("team-*")("team-one"), true)
  })

  it("returns stable validation issues for malformed group patterns", () => {
    const cases = [
      ["[]", "empty bracket expression '[]' is not allowed"],
      ["[abc", "unclosed '[' bracket"],
      ["[]]", "empty bracket expression '[]' is not allowed"],
      ["[!]]", "empty bracket expression '[]' is not allowed"],
      ["[z-a]", "descending character range 'z-a' is not allowed"],
      ["trailing\\", "pattern ends with unescaped backslash"],
      ["**", "recursive glob '**' is not allowed"],
      ["{a,b}", "brace expansion is not allowed"],
      ["@(*)", "extglob patterns are not allowed"],
      ["+(*)", "extglob patterns are not allowed"],
      ["!(*)", "extglob patterns are not allowed"],
      ["?(*)", "extglob patterns are not allowed"],
      ["*(*)", "extglob patterns are not allowed"],
    ] as const

    for (const [pattern, message] of cases) {
      const result = compileGroupNamePattern(pattern)
      assert.deepEqual(result, {
        ok: false,
        issues: [{ path: "pattern", message }],
      })
    }
  })
})
