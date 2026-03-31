import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createDocsDemoRuntime, mountDocsDemoApp } from "../demo-runtime.js"

describe("docs runtime fixture selection", () => {
  it("defaults to medium/shared-teams/canvas fixtures", async () => {
    const runtime = createDocsDemoRuntime()
    assert.deepEqual(runtime.fixtureSelection, {
      tier: "medium",
      preset: "shared-teams",
      source: "canvas",
    })

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })
    assert.equal(course.roster.students.length, 72)
    assert.equal(course.roster.staff.length, 4)
  })

  it("supports explicit tier/preset runtime options", async () => {
    const runtime = createDocsDemoRuntime({
      tier: "small",
      preset: "assignment-scoped",
    })

    assert.deepEqual(runtime.fixtureSelection, {
      tier: "small",
      preset: "assignment-scoped",
      source: "canvas",
    })

    const course = await runtime.workflowClient.run("course.load", {
      courseId: runtime.seedCourseEntityId,
    })

    assert.equal(course.roster.students.length, 24)
    assert.equal(course.roster.staff.length, 2)
    assert.equal(
      course.roster.assignments.every((assignment) =>
        assignment.groupSetId.startsWith("gs_"),
      ),
      true,
    )
  })

  it("mount options thread tier/preset/source into runtime selection", () => {
    const fakeMountNode = { id: "app" }
    const runtime = mountDocsDemoApp({
      queryMountNode: () => fakeMountNode,
      appRootComponent: () => null,
      tier: "stress",
      preset: "shared-teams",
      source: "moodle",
      createRoot() {
        return {
          render() {},
        }
      },
    })

    assert.deepEqual(runtime.fixtureSelection, {
      tier: "stress",
      preset: "shared-teams",
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

    const nonSystemGroups = course.roster.groups.filter(
      (g) => g.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((g) => g.origin === "local"))
    assert.ok(nonSystemGroups.every((g) => g.lmsGroupId === null))

    const nonSystemGroupSets = course.roster.groupSets.filter(
      (gs) => gs.connection?.kind !== "system",
    )
    assert.ok(
      nonSystemGroupSets.every((gs) => gs.connection?.kind === "import"),
    )
  })
})
