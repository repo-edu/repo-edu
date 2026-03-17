import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { createRepositoryWorkflowHandlers } from "@repo-edu/application"
import type { PersistedAppSettings, PersistedCourse } from "@repo-edu/domain"
import { createNodeHttpPort } from "@repo-edu/host-node"
import { createGiteaClient } from "@repo-edu/integrations-git"

import {
  collectExpectedRepoNames,
  collectFixtureGitUsernames,
  createGiteaFixture,
} from "./fixture-adapter.js"
import {
  cleanupOrganization,
  createAdminToken,
  ensureGiteaReady,
  seedGiteaOrganization,
  seedGiteaUsers,
  seedTemplateRepository,
  verifyRepositoriesExist,
  verifyTeamMembers,
  verifyTeamRepos,
  verifyTeams,
} from "./gitea-harness.js"
import { noopFileSystem, noopGitCommand } from "./noop-ports.js"

const GITEA_URL = process.env.INTEGRATION_GITEA_URL ?? ""

const describeIntegration = GITEA_URL ? describe : describe.skip

describeIntegration("repo.create integration (Gitea)", () => {
  let token: string
  let handlers: ReturnType<typeof createRepositoryWorkflowHandlers>

  before(async () => {
    await ensureGiteaReady(GITEA_URL)
    token = await createAdminToken(GITEA_URL)

    const http = createNodeHttpPort()
    const git = createGiteaClient(http)
    handlers = createRepositoryWorkflowHandlers({
      git,
      gitCommand: noopGitCommand,
      fileSystem: noopFileSystem,
    })
  })

  async function withIsolatedOrg(
    fn: (ctx: {
      orgName: string
      course: PersistedCourse
      settings: PersistedAppSettings
    }) => Promise<void>,
  ): Promise<void> {
    const orgName = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await seedGiteaOrganization(GITEA_URL, token, orgName)

    const { course, settings } = createGiteaFixture(GITEA_URL, token, orgName)
    const usernames = collectFixtureGitUsernames(course)
    await seedGiteaUsers(GITEA_URL, token, usernames)

    try {
      await fn({ orgName, course, settings })
    } finally {
      await cleanupOrganization(GITEA_URL, token, orgName)
    }
  }

  it("creates repositories and teams", async () => {
    await withIsolatedOrg(async ({ orgName, course, settings }) => {
      const expected = collectExpectedRepoNames(course, "a1")
      assert.ok(expected.repoNames.length > 0, "fixture should plan repos")

      const result = await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })

      assert.ok(result.repositoriesCreated > 0, "should create repositories")
      assert.equal(result.repositoriesFailed, 0, "no failures expected")
      assert.equal(
        result.repositoriesAlreadyExisted,
        0,
        "no pre-existing repos",
      )

      const existing = await verifyRepositoriesExist(
        GITEA_URL,
        token,
        orgName,
        expected.repoNames,
      )
      assert.deepEqual(
        existing.sort(),
        expected.repoNames.sort(),
        "all planned repos should exist in Gitea",
      )

      const teams = await verifyTeams(GITEA_URL, token, orgName)
      const nonOwnerTeams = teams.filter((team) => team.name !== "Owners")
      assert.ok(nonOwnerTeams.length > 0, "teams should be created")

      const teamWithMembers = nonOwnerTeams[0] as (typeof nonOwnerTeams)[number]
      const members = await verifyTeamMembers(
        GITEA_URL,
        token,
        teamWithMembers.id,
      )
      assert.ok(members.length > 0, "team should have members")

      const repos = await verifyTeamRepos(GITEA_URL, token, teamWithMembers.id)
      assert.ok(repos.length > 0, "team should have repo assignments")
    })
  })

  it("reports existing repositories on idempotent re-run", async () => {
    await withIsolatedOrg(async ({ course, settings }) => {
      const firstResult = await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })
      assert.ok(firstResult.repositoriesCreated > 0, "first run should create")

      const secondResult = await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })
      assert.equal(
        secondResult.repositoriesCreated,
        0,
        "second run should create nothing",
      )
      assert.ok(
        secondResult.repositoriesAlreadyExisted > 0,
        "second run should report existing",
      )
      assert.equal(secondResult.repositoriesFailed, 0, "no failures expected")
    })
  })

  it("creates from template and captures commit SHA", async () => {
    await withIsolatedOrg(async ({ orgName, course, settings }) => {
      const templateRepoName = "starter-template"
      await seedTemplateRepository(GITEA_URL, token, orgName, templateRepoName)

      const template = {
        owner: orgName,
        name: templateRepoName,
        visibility: "private" as const,
      }

      const result = await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template,
      })

      assert.ok(
        result.repositoriesCreated > 0,
        "should create repos from template",
      )
      assert.equal(result.repositoriesFailed, 0, "no failures expected")
      assert.ok(
        result.templateCommitShas.a1 !== undefined &&
          result.templateCommitShas.a1 !== "",
        "should capture template commit SHA for assignment",
      )
    })
  })

  after(async () => {
    // Cleanup is handled per-test in withIsolatedOrg.
  })
})
