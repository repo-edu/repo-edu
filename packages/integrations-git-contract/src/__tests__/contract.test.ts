import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { gitProviderKinds } from "@repo-edu/domain/types"
import type {
  GitProviderClient,
  PatchFileStatus,
  TeamPermission,
} from "../index.js"
import { packageId, supportedGitProviders } from "../index.js"

describe("integrations-git-contract", () => {
  it("exports the correct packageId", () => {
    assert.equal(packageId, "@repo-edu/integrations-git-contract")
  })

  it("supportedGitProviders matches domain gitProviderKinds", () => {
    assert.deepEqual([...supportedGitProviders], [...gitProviderKinds])
  })

  it("supportedGitProviders contains github, gitlab, and gitea", () => {
    assert.ok(supportedGitProviders.includes("github"))
    assert.ok(supportedGitProviders.includes("gitlab"))
    assert.ok(supportedGitProviders.includes("gitea"))
    assert.equal(supportedGitProviders.length, 3)
  })

  it("TeamPermission covers push, pull, and admin", () => {
    const perms: TeamPermission[] = ["push", "pull", "admin"]
    assert.equal(perms.length, 3)
  })

  it("PatchFileStatus covers all expected values", () => {
    const statuses: PatchFileStatus[] = [
      "added",
      "modified",
      "removed",
      "renamed",
    ]
    assert.equal(statuses.length, 4)
  })

  it("GitProviderClient interface covers all expected operations", () => {
    const methodNames: (keyof GitProviderClient)[] = [
      "verifyConnection",
      "verifyGitUsernames",
      "createRepositories",
      "createTeam",
      "assignRepositoriesToTeam",
      "getRepositoryDefaultBranchHead",
      "getTemplateDiff",
      "createBranch",
      "createPullRequest",
      "resolveRepositoryCloneUrls",
      "listRepositories",
    ]
    assert.equal(methodNames.length, 11)

    // Verify the interface is structurally implementable
    const client: GitProviderClient = {
      verifyConnection: async () => ({ verified: true }),
      verifyGitUsernames: async () => [],
      createRepositories: async () => ({
        created: [],
        alreadyExisted: [],
        failed: [],
      }),
      createTeam: async () => ({
        created: true,
        teamSlug: "team",
        membersAdded: [],
        membersNotFound: [],
      }),
      assignRepositoriesToTeam: async () => {},
      getRepositoryDefaultBranchHead: async () => null,
      getTemplateDiff: async () => null,
      createBranch: async () => {},
      createPullRequest: async () => ({ url: "", created: true }),
      resolveRepositoryCloneUrls: async () => ({
        resolved: [],
        missing: [],
      }),
      listRepositories: async () => ({
        repositories: [],
      }),
    }
    assert.ok(client)
  })
})
