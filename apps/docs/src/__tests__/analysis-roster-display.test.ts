import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { IdentityMatch } from "@repo-edu/domain/analysis"
import {
  getConfidenceBadgeLabel,
  getRosterMatchCell,
} from "../../../../packages/renderer-app/src/components/tabs/analysis/AuthorPanel.js"

function makeMatch(confidence: IdentityMatch["confidence"]): IdentityMatch {
  return {
    personId: "p_0002",
    canonicalName: "Grace Hopper",
    canonicalEmail: "grace@example.edu",
    memberId: "m_0002",
    memberName: "Rear Admiral Grace Hopper",
    confidence,
  }
}

describe("docs analysis roster display contract", () => {
  it("supports matched and unmatched roster cell states", () => {
    const matched = getRosterMatchCell(makeMatch("fuzzy-name"))
    const unmatched = getRosterMatchCell(undefined)

    assert.equal(matched.memberName, "Rear Admiral Grace Hopper")
    assert.equal(matched.confidence, "fuzzy-name")
    assert.equal(unmatched.memberName, null)
    assert.equal(unmatched.confidence, null)
  })

  it("returns confidence badge labels used by renderer", () => {
    assert.equal(getConfidenceBadgeLabel("exact-email"), "email")
    assert.equal(getConfidenceBadgeLabel("fuzzy-name"), "fuzzy")
    assert.equal(getConfidenceBadgeLabel("unmatched"), null)
  })
})
