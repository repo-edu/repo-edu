import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { LmsClient } from "@repo-edu/integrations-lms-contract"
import { createLmsProviderDispatch } from "../index.js"

const expectedDispatchMethods: Record<keyof LmsClient, true> = {
  verifyConnection: true,
  listCourses: true,
  fetchRoster: true,
  listGroupSets: true,
  fetchGroupSet: true,
}

const fakeHttpPort: HttpPort = {
  async fetch() {
    throw new Error("Not implemented in dispatch alignment test.")
  },
}

describe("lms provider dispatch", () => {
  it("implements every LmsClient method from the contract", () => {
    const dispatch = createLmsProviderDispatch(fakeHttpPort)
    const actualMethods = Object.keys(dispatch).sort()
    const expectedMethods = Object.keys(expectedDispatchMethods).sort()

    assert.deepEqual(actualMethods, expectedMethods)

    for (const method of expectedMethods) {
      assert.equal(
        typeof dispatch[method as keyof LmsClient],
        "function",
        `Expected ${method} to be a function.`,
      )
    }
  })
})
