import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { BlameLine, FileBlame } from "@repo-edu/domain/analysis"
import { buildBlameCommitNumberMap } from "../components/tabs/analysis/blame-commit-numbering.js"

function makeLine(sha: string, timestamp: number): BlameLine {
  return {
    sha,
    authorName: "Marisol Adeyemi",
    authorEmail: "marisol@example.test",
    timestamp,
    lineNumber: 1,
    content: "pass",
    message: "change",
  }
}

function makeFileBlame(path: string, lines: BlameLine[]): FileBlame {
  return { path, lines }
}

describe("buildBlameCommitNumberMap", () => {
  it("assigns one repo-wide ordinal per SHA across loaded blame files", () => {
    const first = "1111111111111111111111111111111111111111"
    const second = "2222222222222222222222222222222222222222"
    const third = "2e0135123456789012345678901234567890123"

    const result = buildBlameCommitNumberMap([
      makeFileBlame("parser.py", [makeLine(third, 30)]),
      makeFileBlame("test_calculator.py", [
        makeLine(second, 20),
        makeLine(third, 30),
      ]),
      makeFileBlame("main.py", [makeLine(first, 10), makeLine(third, 30)]),
    ])

    assert.equal(result.get(first), 1)
    assert.equal(result.get(second), 2)
    assert.equal(result.get(third), 3)
  })
})
