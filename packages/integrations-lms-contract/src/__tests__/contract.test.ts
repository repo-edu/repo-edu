import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { lmsProviderKinds } from "@repo-edu/domain/types"
import type { LmsClient } from "../index.js"
import { packageId, supportedLmsProviders } from "../index.js"

describe("integrations-lms-contract", () => {
  it("exports the correct packageId", () => {
    assert.equal(packageId, "@repo-edu/integrations-lms-contract")
  })

  it("supportedLmsProviders matches domain lmsProviderKinds", () => {
    assert.deepEqual([...supportedLmsProviders], [...lmsProviderKinds])
  })

  it("supportedLmsProviders contains canvas and moodle", () => {
    assert.ok(supportedLmsProviders.includes("canvas"))
    assert.ok(supportedLmsProviders.includes("moodle"))
    assert.equal(supportedLmsProviders.length, 2)
  })

  it("LmsClient interface covers all expected operations", () => {
    const methodNames: (keyof LmsClient)[] = [
      "verifyConnection",
      "listCourses",
      "fetchRoster",
      "listGroupSets",
      "fetchGroupSet",
    ]
    assert.equal(methodNames.length, 5)

    // Verify the interface is structurally implementable
    const client: LmsClient = {
      verifyConnection: async () => ({ verified: true }),
      listCourses: async () => [],
      fetchRoster: async () => [],
      listGroupSets: async () => [],
      fetchGroupSet: async () => ({
        groupSet: {
          id: "gs1",
          name: "Groups",
        },
        groups: [{ id: "g1", name: "Team 1", memberLmsUserIds: [] }],
      }),
    }
    assert.ok(client)
  })
})
