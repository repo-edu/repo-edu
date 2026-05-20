import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createDocsDemoRuntime, mountDocsDemoApp } from "../demo-runtime.js"

describe("docs runtime seeded documents", () => {
  it("seeds an LMS course with 67 students from the committed cohort", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })

    assert.equal(course.courseKind, "lms")
    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.roster.connection, null)
    assert.equal(course.roster.students.length, 67)
    assert.equal(course.roster.staff.length, 3)

    assert.equal(course.roster.groupSets.length, 2)
    assert.ok(
      course.roster.groupSets.every((groupSet) => groupSet.connection === null),
    )
  })

  it("applies the fixed task group layout on the LMS course", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.lmsCourseEntityId,
    })

    assert.deepEqual(
      course.roster.assignments.map((assignment) => assignment.id),
      ["calculator", "topological-task-scheduler", "huffman-encoder"],
    )
    const [calculator, scheduler, huffman] = course.roster.assignments
    assert.equal(calculator.groupSetId, scheduler.groupSetId)
    assert.notEqual(calculator.groupSetId, huffman.groupSetId)

    assert.equal(
      course.roster.groupSets.map((groupSet) => groupSet.name).join("|"),
      "Shared Project Teams|Compression Project Teams",
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
    assert.equal(course.roster.connection, null)

    const repobeeSets = course.roster.groupSets.filter(
      (groupSet) => groupSet.nameMode === "unnamed",
    )
    assert.equal(repobeeSets.length > 0, true)
    assert.equal(
      repobeeSets.every((groupSet) => groupSet.teams.length > 0),
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
    assert.deepEqual(analysisIds, [
      "calculator",
      "topological-task-scheduler",
      "huffman-encoder",
    ])
  })

  it("seeds the LMS course as the active document", async () => {
    const runtime = createDocsDemoRuntime()
    const settings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(settings.activeDocumentKind, "course")
    assert.equal(settings.activeAnalysisId, runtime.analysisId)
    assert.equal(settings.activeCourseId, runtime.lmsCourseEntityId)
    assert.equal(settings.activeTab, "roster")
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
