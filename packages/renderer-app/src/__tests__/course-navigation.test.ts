import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  resolveSupportedActiveTab,
  resolveTabVisibility,
} from "../utils/course-navigation.js"

describe("course navigation", () => {
  it("hides all tabs when no course is open", () => {
    assert.deepStrictEqual(resolveTabVisibility(undefined), {
      roster: false,
      groupsAssignments: false,
      analysis: false,
    })
  })

  it("shows only analysis for folder surfaces", () => {
    assert.deepStrictEqual(resolveTabVisibility("folder"), {
      roster: false,
      groupsAssignments: false,
      analysis: true,
    })
  })

  it("shows groups and analysis for RepoBee-backed courses", () => {
    assert.deepStrictEqual(resolveTabVisibility("repobee"), {
      roster: false,
      groupsAssignments: true,
      analysis: true,
    })
  })

  it("shows all tabs for LMS-backed courses", () => {
    assert.deepStrictEqual(resolveTabVisibility("lms"), {
      roster: true,
      groupsAssignments: true,
      analysis: true,
    })
  })

  it("redirects an unsupported roster tab to groups for RepoBee-backed courses", () => {
    assert.equal(
      resolveSupportedActiveTab("roster", "repobee"),
      "groups-assignments",
    )
  })

  it("redirects an unsupported groups tab to analysis for folder surfaces", () => {
    assert.equal(
      resolveSupportedActiveTab("groups-assignments", "folder"),
      "analysis",
    )
  })

  it("keeps the analysis tab active for LMS-backed courses", () => {
    assert.equal(resolveSupportedActiveTab("analysis", "lms"), "analysis")
  })
})
