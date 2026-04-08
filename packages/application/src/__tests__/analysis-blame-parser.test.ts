import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseBlameOutput } from "../analysis-workflows/blame-parser.js"

describe("blame-parser parseBlameOutput", () => {
  it("returns empty lines for empty output", () => {
    const result = parseBlameOutput("test.ts", "")
    assert.equal(result.path, "test.ts")
    assert.equal(result.lines.length, 0)
  })

  it("parses a single blame entry", () => {
    const stdout = [
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 1 1 1",
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-mail <alice@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary Initial commit",
      "filename test.ts",
      "\tconst x = 1",
    ].join("\n")

    const result = parseBlameOutput("test.ts", stdout)
    assert.equal(result.lines.length, 1)
    assert.equal(
      result.lines[0].sha,
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    )
    assert.equal(result.lines[0].authorName, "Alice")
    assert.equal(result.lines[0].authorEmail, "alice@example.com")
    assert.equal(result.lines[0].timestamp, 1700000000)
    assert.equal(result.lines[0].lineNumber, 1)
    assert.equal(result.lines[0].content, "const x = 1")
    assert.equal(result.lines[0].message, "Initial commit")
  })

  it("handles multiple lines from same commit (metadata reuse)", () => {
    const oid = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    const stdout = [
      `${oid} 1 1 2`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-mail <alice@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary Initial",
      "filename test.ts",
      "\tline one",
      `${oid} 2 2`,
      "filename test.ts",
      "\tline two",
    ].join("\n")

    const result = parseBlameOutput("test.ts", stdout)
    assert.equal(result.lines.length, 2)
    assert.equal(result.lines[0].content, "line one")
    assert.equal(result.lines[0].lineNumber, 1)
    assert.equal(result.lines[1].content, "line two")
    assert.equal(result.lines[1].lineNumber, 2)
    // Both should share the same author metadata
    assert.equal(result.lines[1].authorName, "Alice")
  })

  it("handles multiple commits in one file", () => {
    const oid1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const oid2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    const stdout = [
      `${oid1} 1 1 1`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-mail <alice@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary First",
      "filename test.ts",
      "\tline from alice",
      `${oid2} 2 2 1`,
      "author Bob",
      "author-mail <bob@example.com>",
      "author-time 1700000100",
      "author-tz +0000",
      "committer Bob",
      "committer-mail <bob@example.com>",
      "committer-time 1700000100",
      "committer-tz +0000",
      "summary Second",
      "filename test.ts",
      "\tline from bob",
    ].join("\n")

    const result = parseBlameOutput("test.ts", stdout)
    assert.equal(result.lines.length, 2)
    assert.equal(result.lines[0].authorName, "Alice")
    assert.equal(result.lines[1].authorName, "Bob")
  })

  it("strips angle brackets from email", () => {
    const oid = "cccccccccccccccccccccccccccccccccccccccc"
    const stdout = [
      `${oid} 1 1 1`,
      "author Carol",
      "author-mail <carol@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Carol",
      "committer-mail <carol@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary Commit",
      "filename test.ts",
      "\tcode",
    ].join("\n")

    const result = parseBlameOutput("test.ts", stdout)
    assert.equal(result.lines[0].authorEmail, "carol@example.com")
  })

  it("uses final line number from porcelain header", () => {
    const oid = "dddddddddddddddddddddddddddddddddddddddd"
    const stdout = [
      `${oid} 50 7 1`,
      "author Dana",
      "author-mail <dana@example.com>",
      "author-time 1700000000",
      "summary Move line",
      "filename test.ts",
      "\tconst moved = true",
    ].join("\n")

    const result = parseBlameOutput("test.ts", stdout)
    assert.equal(result.lines.length, 1)
    assert.equal(result.lines[0].lineNumber, 7)
  })
})
