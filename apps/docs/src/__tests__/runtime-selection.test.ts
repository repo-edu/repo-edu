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

    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })
    assert.equal(profile.roster.students.length, 72)
    assert.equal(profile.roster.staff.length, 4)
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

    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })

    assert.equal(profile.roster.students.length, 24)
    assert.equal(profile.roster.staff.length, 2)
    assert.equal(
      profile.roster.assignments.every((assignment) =>
        assignment.groupSetId.startsWith("gs-a"),
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
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })

    assert.equal(profile.lmsConnectionName, "Canvas Demo")
    assert.equal(profile.roster.connection?.kind, "canvas")

    const nonSystemGroups = profile.roster.groups.filter(
      (g) => g.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((g) => g.origin === "lms"))
    assert.ok(nonSystemGroups.every((g) => g.lmsGroupId !== null))

    const nonSystemGroupSets = profile.roster.groupSets.filter(
      (gs) => gs.connection?.kind !== "system",
    )
    assert.ok(
      nonSystemGroupSets.every((gs) => gs.connection?.kind === "canvas"),
    )
  })

  it("applies moodle source overlay to fixture", async () => {
    const runtime = createDocsDemoRuntime({ source: "moodle" })
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })

    assert.equal(profile.lmsConnectionName, "Moodle Demo")
    assert.equal(profile.roster.connection?.kind, "moodle")

    const nonSystemGroups = profile.roster.groups.filter(
      (g) => g.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((g) => g.origin === "lms"))
    assert.ok(nonSystemGroups.every((g) => g.lmsGroupId !== null))

    const nonSystemGroupSets = profile.roster.groupSets.filter(
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
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })

    assert.equal(profile.lmsConnectionName, null)
    assert.equal(profile.courseId, null)
    assert.equal(profile.roster.connection?.kind, "import")

    const nonSystemGroups = profile.roster.groups.filter(
      (g) => g.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((g) => g.origin === "local"))
    assert.ok(nonSystemGroups.every((g) => g.lmsGroupId === null))

    const nonSystemGroupSets = profile.roster.groupSets.filter(
      (gs) => gs.connection?.kind !== "system",
    )
    assert.ok(
      nonSystemGroupSets.every((gs) => gs.connection?.kind === "import"),
    )
  })
})
