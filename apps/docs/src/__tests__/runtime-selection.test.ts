import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createDocsDemoRuntime, mountDocsDemoApp } from "../demo-runtime.js"

describe("docs runtime seeded documents", () => {
  it("seeds an LMS course with 67 students under a Canvas connection", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })

    assert.equal(course.courseKind, "lms")
    assert.equal(course.lmsConnectionName, "Canvas Demo")
    assert.equal(course.roster.connection?.kind, "canvas")
    assert.equal(course.roster.students.length, 67)
    assert.equal(course.roster.staff.length, 3)

    const nonSystemGroupSets = course.roster.groupSets.filter(
      (gs) => gs.connection?.kind !== "system",
    )
    assert.ok(nonSystemGroupSets.length > 0)
    assert.ok(
      nonSystemGroupSets.every((gs) => gs.connection?.kind === "canvas"),
    )
  })

  it("applies the fixed task group layout on the LMS course", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })

    assert.deepEqual(
      course.roster.assignments.map((assignment) => assignment.id),
      ["a1", "a2", "a3"],
    )
    const [a1, a2, a3] = course.roster.assignments
    assert.equal(a1.groupSetId, a2.groupSetId)
    assert.notEqual(a1.groupSetId, a3.groupSetId)

    const nonSystemGroupSets = course.roster.groupSets.filter(
      (groupSet) => groupSet.connection?.kind !== "system",
    )
    assert.equal(
      nonSystemGroupSets.map((groupSet) => groupSet.name).join("|"),
      "Web API Teams|Data Pipeline Teams",
    )
  })

  it("seeds a RepoBee course with no LMS connection and unnamed teams", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.repobeeCourseEntityId,
    })

    assert.equal(course.courseKind, "repobee")
    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
    assert.equal(course.roster.connection?.kind, "import")

    const importedRepoBeeSets = course.roster.groupSets.filter(
      (groupSet) =>
        groupSet.connection?.kind === "import" &&
        groupSet.nameMode === "unnamed",
    )
    assert.equal(importedRepoBeeSets.length > 0, true)
    assert.equal(
      importedRepoBeeSets.every((groupSet) => groupSet.teams.length > 0),
      true,
    )
  })

  it("lists both seeded courses plus the seeded analysis", async () => {
    const runtime = createDocsDemoRuntime()
    const documents = await runtime.workflowClient.run(
      "documents.list",
      undefined,
    )

    const courseIds = documents
      .filter((doc) => doc.kind === "course")
      .map((doc) => doc.id)
      .sort()
    assert.deepEqual(
      courseIds,
      [runtime.lmsCourseEntityId, runtime.repobeeCourseEntityId].sort(),
    )

    const analysisIds = documents
      .filter((doc) => doc.kind === "analysis")
      .map((doc) => doc.id)
    assert.deepEqual(analysisIds, [runtime.analysisId])
  })

  it("seeds the analysis as the active document", async () => {
    const runtime = createDocsDemoRuntime()
    const settings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(settings.activeDocumentKind, "analysis")
    assert.equal(settings.activeAnalysisId, runtime.analysisId)
    assert.equal(settings.activeCourseId, runtime.lmsCourseEntityId)
  })

  it("mountDocsDemoApp wires the runtime into the provided root", () => {
    const fakeMountNode = { id: "app" }
    const runtime = mountDocsDemoApp({
      queryMountNode: () => fakeMountNode,
      appRootComponent: () => null,
      createRoot() {
        return {
          render() {},
        }
      },
    })

    assert.ok(runtime.lmsCourseEntityId)
    assert.ok(runtime.repobeeCourseEntityId)
    assert.ok(runtime.analysisId)
  })
})
