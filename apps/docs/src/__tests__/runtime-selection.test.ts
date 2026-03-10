import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createDocsDemoRuntime, mountDocsDemoApp } from "../demo-runtime.js"

describe("docs runtime fixture selection", () => {
  it("defaults to medium/shared-teams fixtures", async () => {
    const runtime = createDocsDemoRuntime()
    assert.deepEqual(runtime.fixtureSelection, {
      tier: "medium",
      preset: "shared-teams",
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

  it("mount options thread tier/preset into runtime selection", () => {
    const fakeMountNode = { id: "app" }
    const runtime = mountDocsDemoApp({
      queryMountNode: () => fakeMountNode,
      appRootComponent: () => null,
      tier: "stress",
      preset: "shared-teams",
      createRoot() {
        return {
          render() {},
        }
      },
    })

    assert.deepEqual(runtime.fixtureSelection, {
      tier: "stress",
      preset: "shared-teams",
    })
  })
})
