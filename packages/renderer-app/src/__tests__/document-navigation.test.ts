import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { groupCourseSummaries } from "../components/CourseSwitcher.js"
import { createNewCourseDraft } from "../components/dialogs/NewCourseDialog.js"
import {
  resolveDocumentTabVisibility,
  resolveSupportedActiveTab,
} from "../utils/document-navigation.js"

describe("document navigation", () => {
  it("shows only analysis for standalone analysis documents", () => {
    assert.deepStrictEqual(resolveDocumentTabVisibility("analysis", null), {
      roster: false,
      groupsAssignments: false,
      analysis: true,
    })
  })

  it("hides all tabs when no document is open", () => {
    assert.deepStrictEqual(resolveDocumentTabVisibility(null, null), {
      roster: false,
      groupsAssignments: false,
      analysis: false,
    })
  })

  it("shows groups and analysis for RepoBee courses", () => {
    assert.deepStrictEqual(resolveDocumentTabVisibility("course", "repobee"), {
      roster: false,
      groupsAssignments: true,
      analysis: true,
    })
  })

  it("redirects an unsupported roster tab to groups for RepoBee courses", () => {
    assert.equal(
      resolveSupportedActiveTab("roster", "course", "repobee"),
      "groups-assignments",
    )
  })

  it("keeps the analysis tab active for LMS courses", () => {
    assert.equal(
      resolveSupportedActiveTab("analysis", "course", "lms"),
      "analysis",
    )
  })

  it("keeps the analysis tab active for RepoBee courses", () => {
    assert.equal(
      resolveSupportedActiveTab("analysis", "course", "repobee"),
      "analysis",
    )
  })

  it("groups course summaries by course kind", () => {
    const grouped = groupCourseSummaries([
      {
        id: "lms-1",
        displayName: "LMS 1",
        courseKind: "lms",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "repobee-1",
        displayName: "RepoBee 1",
        courseKind: "repobee",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ])

    assert.deepStrictEqual(
      grouped.lms.map((course) => course.id),
      ["lms-1"],
    )
    assert.deepStrictEqual(
      grouped.repobee.map((course) => course.id),
      ["repobee-1"],
    )
  })

  it("creates LMS course drafts with LMS binding", () => {
    const course = createNewCourseDraft({
      id: "course-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      mode: "lms",
      displayName: "LMS Course",
      selectedLmsConnection: "Canvas",
      selectedCourseId: "canvas-1",
    })

    assert.equal(course.courseKind, "lms")
    assert.equal(course.lmsConnectionName, "Canvas")
    assert.equal(course.lmsCourseId, "canvas-1")
  })

  it("creates RepoBee course drafts without LMS binding", () => {
    const course = createNewCourseDraft({
      id: "course-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      mode: "repobee",
      displayName: "RepoBee Course",
      selectedLmsConnection: "Canvas",
      selectedCourseId: "canvas-1",
    })

    assert.equal(course.courseKind, "repobee")
    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
  })
})
