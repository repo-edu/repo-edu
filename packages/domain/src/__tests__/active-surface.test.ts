import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  activeCourseIdFromSurface,
  activeSurfaceEquals,
  activeSurfaceRecentSubmission,
  activeSurfaceSubmissionStateKey,
  activeTabSchema,
  normalizeActiveSurface,
  normalizeAnalysisFolderPath,
  normalizeSubmissionFolderPath,
  normalizeSubmissionFolderRecent,
  persistedActiveSurfaceSchema,
  submissionRecentKey,
} from "../active-surface.js"

describe("active surface paths", () => {
  it("normalizes analysis paths while preserving filesystem roots", () => {
    assert.equal(
      normalizeAnalysisFolderPath("  /tmp/course///  "),
      "/tmp/course",
    )
    assert.equal(normalizeAnalysisFolderPath("/"), "/")
    assert.equal(normalizeAnalysisFolderPath("C:\\"), "C:/")
    assert.equal(
      normalizeAnalysisFolderPath("courses/first/../second//submission/"),
      "courses/second/submission",
    )
    assert.equal(normalizeAnalysisFolderPath("   "), null)
  })

  it("requires submission paths to be absolute", () => {
    assert.equal(
      normalizeSubmissionFolderPath("/tmp/submission/"),
      "/tmp/submission",
    )
    assert.equal(
      normalizeSubmissionFolderPath(
        "C:\\course\\.\\submissions\\..\\submission\\",
      ),
      "C:/course/submission",
    )
    assert.equal(
      normalizeSubmissionFolderPath(
        "\\\\server\\share\\course\\..\\submission\\",
      ),
      "//server/share/submission",
    )
    assert.equal(normalizeSubmissionFolderPath("relative/path"), null)
  })
})

describe("active surface schemas", () => {
  it("accepts every active tab", () => {
    for (const tab of ["roster", "groups-assignments", "analysis"]) {
      assert.equal(activeTabSchema.safeParse(tab).success, true)
    }
  })

  it("normalizes persisted folder and submission surfaces", () => {
    assert.deepEqual(
      persistedActiveSurfaceSchema.parse({
        kind: "folder",
        path: " /tmp/course/ ",
      }),
      { kind: "folder", path: "/tmp/course" },
    )
    assert.deepEqual(
      persistedActiveSurfaceSchema.parse({
        kind: "submission",
        path: "C:\\submissions\\one\\",
        courseId: "course-1",
      }),
      { kind: "submission", path: "C:/submissions/one", courseId: "course-1" },
    )
  })
})

describe("active surface identity", () => {
  it("normalizes one recent and derives a stable identity", () => {
    assert.deepEqual(
      normalizeSubmissionFolderRecent({
        path: " /tmp/submission/ ",
        courseId: "course-1",
      }),
      { path: "/tmp/submission", courseId: "course-1" },
    )
    assert.equal(
      submissionRecentKey({
        path: "/tmp/course/../submission//",
        courseId: "course-1",
      }),
      "course-1\0/tmp/submission",
    )
    assert.equal(submissionRecentKey({ path: "relative" }), null)
  })

  it("compares each surface variant by its owned identity", () => {
    assert.equal(activeSurfaceEquals({ kind: "home" }, { kind: "home" }), true)
    assert.equal(
      activeSurfaceEquals(
        { kind: "course", courseId: "course-1" },
        { kind: "course", courseId: "course-2" },
      ),
      false,
    )
    assert.equal(
      activeSurfaceEquals(
        { kind: "submission", path: "/tmp/submission", courseId: "course-1" },
        { kind: "submission", path: "/tmp/submission", courseId: "course-1" },
      ),
      true,
    )
  })

  it("derives submission and course identities from a surface", () => {
    const surface = {
      kind: "submission",
      path: "/tmp/submission",
      courseId: "course-1",
    } as const
    assert.equal(
      activeSurfaceSubmissionStateKey(surface),
      "course-1\0/tmp/submission",
    )
    assert.deepEqual(activeSurfaceRecentSubmission(surface), {
      path: "/tmp/submission",
      courseId: "course-1",
    })
    assert.equal(activeCourseIdFromSurface(surface), "course-1")
    assert.equal(activeCourseIdFromSurface({ kind: "home" }), null)
  })

  it("normalizes invalid in-memory surfaces to home", () => {
    assert.deepEqual(
      normalizeActiveSurface({ kind: "submission", path: "relative" }),
      { kind: "home" },
    )
  })
})
