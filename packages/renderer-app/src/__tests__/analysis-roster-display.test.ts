import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { IdentityMatch } from "@repo-edu/domain/analysis"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  ConfidenceBadge,
  getRosterMatchCell,
} from "../components/tabs/analysis/AuthorPanel.js"

function makeMatch(confidence: IdentityMatch["confidence"]): IdentityMatch {
  return {
    personId: "p_0001",
    canonicalName: "Ada Lovelace",
    canonicalEmail: "ada@example.edu",
    memberId: "m_0001",
    memberName: "Ada M. Lovelace",
    confidence,
  }
}

describe("analysis roster match display", () => {
  it("returns matched display fields when a roster match exists", () => {
    const cell = getRosterMatchCell(makeMatch("exact-email"))
    assert.equal(cell.memberName, "Ada M. Lovelace")
    assert.equal(cell.confidence, "exact-email")
  })

  it("returns unmatched display fields when no roster match exists", () => {
    const cell = getRosterMatchCell(undefined)
    assert.equal(cell.memberName, null)
    assert.equal(cell.confidence, null)
  })

  it("renders confidence badges for exact-email and fuzzy-name", () => {
    const exact = renderToStaticMarkup(
      React.createElement(ConfidenceBadge, { confidence: "exact-email" }),
    )
    const fuzzy = renderToStaticMarkup(
      React.createElement(ConfidenceBadge, { confidence: "fuzzy-name" }),
    )

    assert.match(exact, />email</)
    assert.match(exact, /text-emerald-700/)
    assert.match(fuzzy, />fuzzy</)
    assert.match(fuzzy, /text-amber-700/)
  })

  it("renders no badge for unmatched confidence", () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfidenceBadge, { confidence: "unmatched" }),
    )
    assert.equal(html, "")
  })
})
