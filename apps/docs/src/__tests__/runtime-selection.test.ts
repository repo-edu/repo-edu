import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createDocsDemoRuntime, mountDocsDemoApp } from "../demo-runtime.js"

describe("docs runtime fixture selection", () => {
  it("defaults to medium/canvas fixtures", async () => {
    const runtime = createDocsDemoRuntime()
    assert.deepEqual(runtime.fixtureSelection, {
      tier: "medium",
      source: "canvas",
    })

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    assert.equal(course.roster.students.length, 72)
    assert.equal(course.roster.staff.length, 4)
  })

  it("supports explicit tier runtime options and fixed task group layout", async () => {
    const runtime = createDocsDemoRuntime({
      tier: "small",
    })

    assert.deepEqual(runtime.fixtureSelection, {
      tier: "small",
      source: "canvas",
    })

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })

    assert.equal(course.roster.students.length, 24)
    assert.equal(course.roster.staff.length, 2)
    assert.deepEqual(
      course.roster.assignments.map((assignment) => assignment.id),
      ["task1a", "task1b", "task2"],
    )
    const [task1a, task1b, task2] = course.roster.assignments
    assert.equal(task1a.groupSetId, task1b.groupSetId)
    assert.notEqual(task1a.groupSetId, task2.groupSetId)
    assert.equal(
      course.roster.groupSets
        .filter((groupSet) => groupSet.connection?.kind !== "system")
        .map((groupSet) => groupSet.name)
        .join("|"),
      "Task 1 Teams|Task 2 Teams",
    )
  })

  it("mount options thread tier/source into runtime selection", () => {
    const fakeMountNode = { id: "app" }
    const runtime = mountDocsDemoApp({
      queryMountNode: () => fakeMountNode,
      appRootComponent: () => null,
      tier: "stress",
      source: "moodle",
      createRoot() {
        return {
          render() {},
        }
      },
    })

    assert.deepEqual(runtime.fixtureSelection, {
      tier: "stress",
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
