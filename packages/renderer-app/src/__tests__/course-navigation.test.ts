import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createNewCourseDraft } from "../components/dialogs/NewCourseDialog.js"
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

  it("creates LMS course drafts with LMS binding", () => {
    const course = createNewCourseDraft({
      id: "course-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      backing: "lms",
      displayName: "LMS Course",
      selectedLmsConnection: "Canvas",
      selectedCourseId: "canvas-1",
    })

    assert.equal(course.backing, "lms")
    assert.equal(course.lmsConnectionName, "Canvas")
    assert.equal(course.lmsCourseId, "canvas-1")
  })

  it("creates RepoBee course drafts without LMS binding", () => {
    const course = createNewCourseDraft({
      id: "course-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      backing: "repobee",
      displayName: "RepoBee Course",
      selectedLmsConnection: "Canvas",
      selectedCourseId: "canvas-1",
    })

    assert.equal(course.backing, "repobee")
    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
  })
})
