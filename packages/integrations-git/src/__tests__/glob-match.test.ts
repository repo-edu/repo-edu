import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchesGlob } from "../glob-match.js"

describe("matchesGlob", () => {
  it("matches simple prefix glob patterns", () => {
    assert.equal(matchesGlob("lab1-alice", "lab1-*"), true)
    assert.equal(matchesGlob("lab2-alice", "lab1-*"), false)
  })

  it("allows * to cross directory separators", () => {
    assert.equal(matchesGlob("111_team/group-30-2iv60", "1*"), true)
    assert.equal(matchesGlob("211_team/group-30-2iv60", "1*"), false)
  })

  it("keeps slash-aware patterns working", () => {
    assert.equal(matchesGlob("students/alice/repo", "students/*"), true)
    assert.equal(matchesGlob("tas/alice/repo", "students/*"), false)
  })
})
