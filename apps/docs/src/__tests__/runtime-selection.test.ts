import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createDocsDemoRuntime, mountDocsDemoApp } from "../demo-runtime.js"

describe("docs runtime fixture selection", () => {
  it("defaults to canvas fixtures with 67 students", async () => {
    const runtime = createDocsDemoRuntime()
    assert.deepEqual(runtime.fixtureSelection, {
      source: "canvas",
    })

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    assert.equal(course.roster.students.length, 67)
    assert.equal(course.roster.staff.length, 3)
  })

  it("applies fixed task group layout with asymmetric group counts", async () => {
    const runtime = createDocsDemoRuntime()

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
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

    const [webApiSet, pipelineSet] = nonSystemGroupSets
    assert.ok(webApiSet.groupIds.length > pipelineSet.groupIds.length)
    assert.ok(webApiSet.groupIds.length > 0)
    assert.ok(pipelineSet.groupIds.length > 0)
  })

  it("keeps nextGroupSeq ahead of all existing group ids", async () => {
    const runtime = createDocsDemoRuntime()
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })

    const maxGroupSequence = course.roster.groups.reduce((max, group) => {
      const sequence = Number.parseInt(group.id.replace(/^g_/, ""), 10)
      return Number.isNaN(sequence) ? max : Math.max(max, sequence)
    }, 0)

    assert.equal(course.idSequences.nextGroupSeq > maxGroupSequence, true)
  })

  it("mount options thread source into runtime selection", () => {
    const fakeMountNode = { id: "app" }
    const runtime = mountDocsDemoApp({
      queryMountNode: () => fakeMountNode,
      appRootComponent: () => null,
      source: "moodle",
      createRoot() {
        return {
          render() {},
        }
      },
    })

    assert.deepEqual(runtime.fixtureSelection, {
      source: "moodle",
    })
  })

  it("applies canvas source overlay to fixture", async () => {
    const runtime = createDocsDemoRuntime({ source: "canvas" })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })

    assert.equal(course.lmsConnectionName, "Canvas Demo")
    assert.equal(course.roster.connection?.kind, "canvas")

    const nonSystemGroups = course.roster.groups.filter(
      (g) => g.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((g) => g.origin === "lms"))
    assert.ok(nonSystemGroups.every((g) => g.lmsGroupId !== null))

    const nonSystemGroupSets = course.roster.groupSets.filter(
      (gs) => gs.connection?.kind !== "system",
    )
    assert.ok(
      nonSystemGroupSets.every((gs) => gs.connection?.kind === "canvas"),
    )
  })

  it("applies moodle source overlay to fixture", async () => {
    const runtime = createDocsDemoRuntime({ source: "moodle" })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })

    assert.equal(course.lmsConnectionName, "Moodle Demo")
    assert.equal(course.roster.connection?.kind, "moodle")

    const nonSystemGroups = course.roster.groups.filter(
      (g) => g.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((g) => g.origin === "lms"))
    assert.ok(nonSystemGroups.every((g) => g.lmsGroupId !== null))

    const nonSystemGroupSets = course.roster.groupSets.filter(
      (gs) => gs.connection?.kind !== "system",
    )
    assert.ok(
      nonSystemGroupSets.every((gs) => gs.connection?.kind === "moodle"),
    )
    assert.ok(
      nonSystemGroupSets.every(
        (gs) =>
          gs.connection?.kind === "moodle" && "groupingId" in gs.connection,
      ),
    )
  })

  it("applies file source overlay with no LMS connection", async () => {
    const runtime = createDocsDemoRuntime({ source: "file" })
    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })

    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
    assert.equal(course.roster.connection?.kind, "import")
    assert.equal(course.roster.students.length, 0)
    assert.equal(course.roster.staff.length, 0)
    assert.equal(course.roster.groups.length, 0)
    assert.equal(course.roster.assignments.length > 0, true)

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
})
