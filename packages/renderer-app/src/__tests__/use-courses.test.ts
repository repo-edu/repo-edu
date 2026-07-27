import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { defaultAppPreferences } from "@repo-edu/domain/settings"
import type { CourseBacking, CourseSummary } from "@repo-edu/domain/types"
import { clearWorkflowClient } from "../contexts/workflow-client.js"
import { resolveActiveSurfaceRedirectForCourses } from "../hooks/use-courses.js"
import { reducePreferences } from "../session/session-settings.js"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"

function courseSummary(id: string, backing: CourseBacking): CourseSummary {
  return {
    id,
    backing,
    displayName: id,
    updatedAt: "2026-05-25T00:00:00.000Z",
  }
}

beforeEach(() => {
  clearWorkflowClient()
  useCourseStore.getState().clear()
  useUiStore.getState().reset()
})

describe("course refresh submission pruning", () => {
  it("marks the course list ready when an empty list has loaded", () => {
    assert.equal(useUiStore.getState().courseListLoaded, false)

    useUiStore.getState().setCourseList([])

    assert.equal(useUiStore.getState().courseListLoaded, true)
  })

  it("redirects active submissions whose attached course is stale", () => {
    assert.deepStrictEqual(
      resolveActiveSurfaceRedirectForCourses(
        {
          kind: "submission",
          path: "/submissions/ada",
          courseId: "course-1",
        },
        [courseSummary("course-1", "repobee")],
      ),
      {
        surface: { kind: "course", courseId: "course-1" },
        courseBacking: "repobee",
      },
    )

    assert.deepStrictEqual(
      resolveActiveSurfaceRedirectForCourses(
        {
          kind: "submission",
          path: "/submissions/ada",
          courseId: "missing",
        },
        [courseSummary("course-2", "lms")],
      ),
      {
        surface: { kind: "course", courseId: "course-2" },
        courseBacking: "lms",
      },
    )
  })

  it("keeps valid attached submissions on the submission surface", () => {
    assert.equal(
      resolveActiveSurfaceRedirectForCourses(
        {
          kind: "submission",
          path: "/submissions/ada",
          courseId: "course-1",
        },
        [courseSummary("course-1", "lms")],
      ),
      null,
    )
  })

  it("does not change submission recents when all attached courses remain valid", () => {
    const next = reducePreferences(defaultAppPreferences, {
      type: "prune-submissions-for-courses",
      courses: [courseSummary("course-1", "lms")],
    })
    assert.equal(next, defaultAppPreferences)
  })

  it("prunes stale submission recents", () => {
    const recent = reducePreferences(defaultAppPreferences, {
      type: "push-recent-submission",
      recent: { path: "/submissions/ada", courseId: "course-1" },
    })
    const unchanged = reducePreferences(recent, {
      type: "prune-submissions-for-courses",
      courses: [courseSummary("course-1", "lms")],
    })
    assert.equal(unchanged, recent)
    const pruned = reducePreferences(recent, {
      type: "prune-submissions-for-courses",
      courses: [],
    })
    assert.deepStrictEqual(pruned.recentSubmissionFolders, [])
  })
})
