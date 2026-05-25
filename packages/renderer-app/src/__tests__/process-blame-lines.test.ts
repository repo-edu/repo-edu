import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { FileBlame, PersonDbSnapshot } from "@repo-edu/domain/analysis"
import { processBlameLines } from "../components/tabs/analysis/process-blame-lines.js"

const personDb: PersonDbSnapshot = {
  persons: [
    {
      id: "p1",
      canonicalName: "Ada",
      canonicalEmail: "ada@example.test",
      aliases: [],
      commitCount: 2,
    },
    {
      id: "p2",
      canonicalName: "Bob",
      canonicalEmail: "bob@example.test",
      aliases: [],
      commitCount: 1,
    },
  ],
  identityIndex: new Map([
    ["ada@example.test\0ada", "p1"],
    ["bob@example.test\0bob", "p2"],
  ]),
}

function line(
  lineNumber: number,
  content: string,
  authorName = "Ada",
  authorEmail = "ada@example.test",
) {
  return {
    sha: `sha-${lineNumber}`,
    authorName,
    authorEmail,
    timestamp: 1_700_000_000,
    lineNumber,
    content,
    message: "message",
  }
}

describe("processBlameLines", () => {
  it("looks up comment classification by original file-blame index", () => {
    const fileBlame: FileBlame = {
      path: "src/example.ts",
      lines: [
        line(1, "/* start", "Bob", "bob@example.test"),
        line(2, " * hidden by author filter", "Bob", "bob@example.test"),
        line(3, " * visible"),
        line(4, " */"),
      ],
    }

    const processed = processBlameLines(
      fileBlame,
      personDb,
      new Map(),
      new Set([0, 1, 2, 3]),
      { excludeAuthors: ["Bob"], excludeEmails: [] },
    )

    assert.deepEqual(
      processed.map((entry) => [entry.line.lineNumber, entry.isComment]),
      [
        [3, true],
        [4, true],
      ],
    )
  })

  it("does not derive comment classification from line numbers", () => {
    const fileBlame: FileBlame = {
      path: "src/example.ts",
      lines: [
        line(10, "const value = 1"),
        line(20, "// comment"),
        line(30, "const next = 2"),
      ],
    }

    const processed = processBlameLines(
      fileBlame,
      personDb,
      new Map(),
      new Set([1]),
      { excludeAuthors: [], excludeEmails: [] },
    )

    assert.deepEqual(
      processed.map((entry) => [entry.line.lineNumber, entry.isComment]),
      [
        [10, false],
        [20, true],
        [30, false],
      ],
    )
  })

  it("marks every rendered line as non-comment without classification", () => {
    const fileBlame: FileBlame = {
      path: "src/example.ts",
      lines: [line(1, "// comment")],
    }

    const processed = processBlameLines(fileBlame, personDb, new Map(), null, {
      excludeAuthors: [],
      excludeEmails: [],
    })

    assert.equal(processed[0].isComment, false)
  })
})
