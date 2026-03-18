import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { createGitProviderDispatch } from "../index.js"

const expectedDispatchMethods: Record<keyof GitProviderClient, true> = {
  verifyConnection: true,
  verifyGitUsernames: true,
  createRepositories: true,
  createTeam: true,
  assignRepositoriesToTeam: true,
  getRepositoryDefaultBranchHead: true,
  getTemplateDiff: true,
  createBranch: true,
  createPullRequest: true,
  resolveRepositoryCloneUrls: true,
}

const fakeHttpPort: HttpPort = {
  async fetch() {
    throw new Error("Not implemented in dispatch alignment test.")
  },
}

describe("git provider dispatch", () => {
  it("implements every GitProviderClient method from the contract", () => {
    const dispatch = createGitProviderDispatch(fakeHttpPort)
    const actualMethods = Object.keys(dispatch).sort()
    const expectedMethods = Object.keys(expectedDispatchMethods).sort()

    assert.deepEqual(actualMethods, expectedMethods)

    for (const method of expectedMethods) {
      assert.equal(
        typeof dispatch[method as keyof GitProviderClient],
        "function",
        `Expected ${method} to be a function.`,
      )
    }
  })
})
