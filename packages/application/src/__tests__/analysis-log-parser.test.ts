import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  COMMIT_DELIMITER,
  parseLogOutput,
  resolveRenamedPath,
} from "../analysis-workflows/log-parser.js"

describe("log-parser resolveRenamedPath", () => {
  it("returns plain path unchanged", () => {
    assert.equal(resolveRenamedPath("src/main.ts"), "src/main.ts")
  })

  it("resolves brace rename to new path", () => {
    assert.equal(resolveRenamedPath("src/{old.ts => new.ts}"), "src/new.ts")
  })

  it("resolves brace rename with directory change", () => {
    assert.equal(
      resolveRenamedPath("{src/old => lib/new}/file.ts"),
      "lib/new/file.ts",
    )
  })

  it("resolves simple rename to new path", () => {
    assert.equal(resolveRenamedPath("old.ts => new.ts"), "new.ts")
  })

  it("collapses double slashes from empty brace parts", () => {
    assert.equal(
      resolveRenamedPath("src/{ => subdir}/file.ts"),
      "src/subdir/file.ts",
    )
  })
})

describe("log-parser parseLogOutput", () => {
  it("returns empty array for empty output", () => {
    assert.deepEqual(parseLogOutput(""), [])
    assert.deepEqual(parseLogOutput("   "), [])
  })

  it("parses a single commit with one file", () => {
    const stdout = [
      `${COMMIT_DELIMITER}`,
      "\0abc1234\x001700000000\0Alice\0alice@example.com\0Initial commit",
      "\0" + "10\t5\0src/main.ts\0",
    ].join("")

    const commits = parseLogOutput(stdout)
    assert.equal(commits.length, 1)
    assert.equal(commits[0].sha, "abc1234")
    assert.equal(commits[0].timestamp, 1700000000)
    assert.equal(commits[0].authorName, "Alice")
    assert.equal(commits[0].authorEmail, "alice@example.com")
    assert.equal(commits[0].message, "Initial commit")
    assert.equal(commits[0].files.length, 1)
    assert.equal(commits[0].files[0].path, "src/main.ts")
    assert.equal(commits[0].files[0].insertions, 10)
    assert.equal(commits[0].files[0].deletions, 5)
  })

  it("handles binary numstat lines gracefully (insertions=-/deletions=-)", () => {
    const stdout = [
      `${COMMIT_DELIMITER}`,
      "\0def5678\x001700000100\0Bob\0bob@example.com\0Add binary",
      "\0-\t-\0image.png\0",
    ].join("")

    const commits = parseLogOutput(stdout)
    assert.equal(commits.length, 1)
    assert.equal(commits[0].files.length, 1)
    assert.equal(commits[0].files[0].path, "image.png")
    assert.equal(commits[0].files[0].insertions, 0)
    assert.equal(commits[0].files[0].deletions, 0)
  })

  it("parses multiple commits", () => {
    const stdout = [
      `${COMMIT_DELIMITER}`,
      "\0aaa1111\x001700000000\0Alice\0alice@example.com\0First",
      "\0" + "5\t0\0file1.ts\0",
      `${COMMIT_DELIMITER}`,
      "\0bbb2222\x001700000100\0Bob\0bob@example.com\0Second",
      "\0" + "3\t1\0file2.ts\0",
    ].join("")

    const commits = parseLogOutput(stdout)
    assert.equal(commits.length, 2)
    assert.equal(commits[0].sha, "aaa1111")
    assert.equal(commits[1].sha, "bbb2222")
  })

  it("handles commit with no files", () => {
    const stdout = [
      `${COMMIT_DELIMITER}`,
      "\0ccc3333\x001700000200\0Carol\0carol@example.com\0Empty commit",
    ].join("")

    const commits = parseLogOutput(stdout)
    assert.equal(commits.length, 1)
    assert.equal(commits[0].files.length, 0)
  })

  it("handles rename in numstat path", () => {
    const stdout = [
      `${COMMIT_DELIMITER}`,
      "\0ddd4444\x001700000300\0Dave\0dave@example.com\0Rename file",
      "\0" + "8\t2\0src/{old.ts => new.ts}\0",
    ].join("")

    const commits = parseLogOutput(stdout)
    assert.equal(commits.length, 1)
    assert.equal(commits[0].files[0].path, "src/new.ts")
  })

  it("parses full commit messages with embedded newlines", () => {
    const stdout = [
      `${COMMIT_DELIMITER}`,
      "\0eee5555\x001700000400\0Eve\0eve@example.com\0Subject line\n\nBody line",
      "\0" + "1\t0\0notes.md\0",
    ].join("")

    const commits = parseLogOutput(stdout)
    assert.equal(commits.length, 1)
    assert.equal(commits[0].message, "Subject line\n\nBody line")
    assert.equal(commits[0].files.length, 1)
    assert.equal(commits[0].files[0].path, "notes.md")
  })
})
