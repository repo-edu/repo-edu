import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planRepositoryOperation } from "@repo-edu/domain"
import { createDocsDemoRuntime } from "../demo-runtime.js"

function isAppErrorWithType(
  error: unknown,
  type: "validation" | "not-found" | "provider" | "unexpected" | "cancelled",
) {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === type
  )
}

function plannedGroupIds(
  plan: ReturnType<typeof planRepositoryOperation>,
): string[] {
  assert.equal(plan.ok, true)
  if (!plan.ok) {
    return []
  }
  return plan.value.groups.map((group) => group.groupId).sort()
}

describe("docs fixture integration: source parity", () => {
  it("supports canvas source overlays and source-sensitive workflows", async () => {
    const runtime = createDocsDemoRuntime({
      tier: "small",
      preset: "shared-teams",
      source: "canvas",
    })
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(profile.lmsConnectionName, "Canvas Demo")
    assert.equal(profile.roster.connection?.kind, "canvas")

    const nonSystemGroupSets = profile.roster.groupSets.filter(
      (groupSet) => groupSet.connection?.kind !== "system",
    )
    assert.ok(nonSystemGroupSets.length > 0)
    assert.ok(
      nonSystemGroupSets.every(
        (groupSet) => groupSet.connection?.kind === "canvas",
      ),
    )

    const nonSystemGroups = profile.roster.groups.filter(
      (group) => group.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((group) => group.origin === "lms"))
    assert.ok(nonSystemGroups.every((group) => group.lmsGroupId !== null))

    const available = await runtime.workflowClient.run(
      "groupSet.fetchAvailableFromLms",
      { profile, appSettings },
    )
    assert.equal(available.length > 0, true)

    const imported = await runtime.workflowClient.run("roster.importFromLms", {
      profile,
      appSettings,
      courseId: runtime.seedCourseId,
    })
    assert.equal(imported.roster.connection?.kind, "canvas")
  })

  it("supports moodle source overlays and source-sensitive workflows", async () => {
    const runtime = createDocsDemoRuntime({
      tier: "small",
      preset: "shared-teams",
      source: "moodle",
    })
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(profile.lmsConnectionName, "Moodle Demo")
    assert.equal(profile.roster.connection?.kind, "moodle")

    const nonSystemGroupSets = profile.roster.groupSets.filter(
      (groupSet) => groupSet.connection?.kind !== "system",
    )
    assert.ok(nonSystemGroupSets.length > 0)
    assert.ok(
      nonSystemGroupSets.every(
        (groupSet) => groupSet.connection?.kind === "moodle",
      ),
    )
    assert.ok(
      nonSystemGroupSets.every(
        (groupSet) =>
          groupSet.connection?.kind === "moodle" &&
          "groupingId" in groupSet.connection,
      ),
    )

    const nonSystemGroups = profile.roster.groups.filter(
      (group) => group.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((group) => group.origin === "lms"))
    assert.ok(nonSystemGroups.every((group) => group.lmsGroupId !== null))

    const available = await runtime.workflowClient.run(
      "groupSet.fetchAvailableFromLms",
      { profile, appSettings },
    )
    assert.equal(available.length > 0, true)

    const imported = await runtime.workflowClient.run("roster.importFromLms", {
      profile,
      appSettings,
      courseId: runtime.seedCourseId,
    })
    assert.equal(imported.roster.connection?.kind, "moodle")
  })

  it("rejects LMS workflows for file source overlays", async () => {
    const runtime = createDocsDemoRuntime({
      tier: "small",
      preset: "shared-teams",
      source: "file",
    })
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    assert.equal(profile.lmsConnectionName, null)
    assert.equal(profile.courseId, null)
    assert.equal(profile.roster.connection?.kind, "import")

    const nonSystemGroupSets = profile.roster.groupSets.filter(
      (groupSet) => groupSet.connection?.kind !== "system",
    )
    assert.ok(nonSystemGroupSets.length > 0)
    assert.ok(
      nonSystemGroupSets.every(
        (groupSet) => groupSet.connection?.kind === "import",
      ),
    )

    const nonSystemGroups = profile.roster.groups.filter(
      (group) => group.origin !== "system",
    )
    assert.ok(nonSystemGroups.length > 0)
    assert.ok(nonSystemGroups.every((group) => group.origin === "local"))
    assert.ok(nonSystemGroups.every((group) => group.lmsGroupId === null))

    await assert.rejects(
      runtime.workflowClient.run("groupSet.fetchAvailableFromLms", {
        profile,
        appSettings,
      }),
      (error: unknown) => isAppErrorWithType(error, "not-found"),
    )

    await assert.rejects(
      runtime.workflowClient.run("roster.importFromLms", {
        profile,
        appSettings,
        courseId: "course-small-shared-teams",
      }),
      (error: unknown) => isAppErrorWithType(error, "not-found"),
    )
  })
})

describe("docs fixture integration: repository planning by preset", () => {
  it("shared-teams reuses assignment group populations and matches repo.create count", async () => {
    const runtime = createDocsDemoRuntime({
      tier: "small",
      preset: "shared-teams",
      source: "canvas",
    })
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    const a1Plan = planRepositoryOperation(profile.roster, "a1")
    const a2Plan = planRepositoryOperation(profile.roster, "a2")

    const a1GroupIds = plannedGroupIds(a1Plan)
    const a2GroupIds = plannedGroupIds(a2Plan)
    assert.deepEqual(a1GroupIds, a2GroupIds)
    assert.equal(a1GroupIds.length > 0, true)

    const a1Result = await runtime.workflowClient.run("repo.create", {
      profile,
      appSettings,
      assignmentId: "a1",
      template: null,
    })
    assert.equal(a1Result.repositoriesPlanned, a1GroupIds.length)

    const a2Result = await runtime.workflowClient.run("repo.create", {
      profile,
      appSettings,
      assignmentId: "a2",
      template: null,
    })
    assert.equal(a2Result.repositoriesPlanned, a2GroupIds.length)
  })

  it("assignment-scoped isolates assignment group populations and matches repo.create count", async () => {
    const runtime = createDocsDemoRuntime({
      tier: "small",
      preset: "assignment-scoped",
      source: "canvas",
    })
    const profile = await runtime.workflowClient.run("profile.load", {
      profileId: runtime.seedProfileId,
    })
    const appSettings = await runtime.workflowClient.run(
      "settings.loadApp",
      undefined,
    )

    const a1Plan = planRepositoryOperation(profile.roster, "a1")
    const a2Plan = planRepositoryOperation(profile.roster, "a2")

    const a1GroupIds = plannedGroupIds(a1Plan)
    const a2GroupIds = plannedGroupIds(a2Plan)
    const overlap = a1GroupIds.filter((groupId) => a2GroupIds.includes(groupId))
    assert.deepEqual(overlap, [])
    assert.equal(a1GroupIds.length > 0, true)
    assert.equal(a2GroupIds.length > 0, true)

    const a1Result = await runtime.workflowClient.run("repo.create", {
      profile,
      appSettings,
      assignmentId: "a1",
      template: null,
    })
    assert.equal(a1Result.repositoriesPlanned, a1GroupIds.length)

    const a2Result = await runtime.workflowClient.run("repo.create", {
      profile,
      appSettings,
      assignmentId: "a2",
      template: null,
    })
    assert.equal(a2Result.repositoriesPlanned, a2GroupIds.length)
  })
})
