import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GitProviderKind } from "@repo-edu/domain/connection"
import type { GitProviderHarness } from "./git-provider-harness.js"
import { runWithRunFixtures } from "./run-fixture.js"

function createHarness(
  provider: GitProviderKind,
  cleanupCalls: GitProviderKind[],
  options: {
    readyFailure?: Error
    cleanupFailure?: Error
  } = {},
): GitProviderHarness {
  return {
    label: provider,
    missingConfiguration: [],
    supportsUserProvisioning: false,
    fixtureGitUsernames: [],
    async ensureReady() {
      if (options.readyFailure !== undefined) {
        throw options.readyFailure
      }
    },
    getConnectionDraft: () => ({
      provider,
      baseUrl: `https://${provider}.example.test`,
      token: "token",
    }),
    async createOrganization(orgName) {
      return orgName
    },
    async cleanupOrganization() {
      cleanupCalls.push(provider)
      if (options.cleanupFailure !== undefined) {
        throw options.cleanupFailure
      }
    },
    async seedUsers() {},
    async seedTemplateRepository() {},
    async seedOrganizationRepository() {},
    async readRepositoryFile() {
      return null
    },
    async listPullRequests() {
      return []
    },
    async verifyRepositoriesExist() {
      return []
    },
    async verifyTeams() {
      return []
    },
    async verifyTeamMembers() {
      return []
    },
    async verifyTeamRepos() {
      return []
    },
  }
}

describe("run fixture lifecycle", () => {
  it("cleans seeded providers when a later provider cannot start", async () => {
    const cleanupCalls: GitProviderKind[] = []
    const seedFailure = new Error("GitLab did not start")
    let bodyRan = false

    await assert.rejects(
      runWithRunFixtures(async () => {
        bodyRan = true
      }, [
        createHarness("gitea", cleanupCalls),
        createHarness("gitlab", cleanupCalls, { readyFailure: seedFailure }),
      ]),
      (error) => error === seedFailure,
    )

    assert.equal(bodyRan, false)
    assert.deepEqual(cleanupCalls, ["gitea"])
  })

  it("tries every provider cleanup and rethrows the first failure", async () => {
    const cleanupCalls: GitProviderKind[] = []
    const firstFailure = new Error("Gitea cleanup failed")
    const secondFailure = new Error("GitLab cleanup failed")

    await assert.rejects(
      runWithRunFixtures(async () => {}, [
        createHarness("gitea", cleanupCalls, {
          cleanupFailure: firstFailure,
        }),
        createHarness("gitlab", cleanupCalls, {
          cleanupFailure: secondFailure,
        }),
      ]),
      (error) => error === firstFailure,
    )

    assert.deepEqual(cleanupCalls, ["gitea", "gitlab"])
    await runWithRunFixtures(async () => {}, [])
    assert.deepEqual(cleanupCalls, ["gitea", "gitlab"])
  })
})
