import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseRepoBeeStudentsText } from "../repobee-students-parser.js"

describe("parseRepoBeeStudentsText", () => {
  it("normalizes and sorts valid usernames per team", () => {
    const result = parseRepoBeeStudentsText("Bob-smith alice\nCHARLIE")
    assert.equal(result.ok, true)
    if (!result.ok) {
      return
    }

    assert.deepStrictEqual(result.teams, [["alice", "bob-smith"], ["charlie"]])
  })

  it("rejects usernames that violate GitHub username rules", () => {
    const result = parseRepoBeeStudentsText("alice.dev valid-user")
    assert.equal(result.ok, false)
    if (result.ok) {
      return
    }

    assert.equal(
      result.issues.some(
        (issue) =>
          issue.path === "line.1" &&
          issue.message.includes("Invalid username 'alice.dev'"),
      ),
      true,
    )
  })
})
