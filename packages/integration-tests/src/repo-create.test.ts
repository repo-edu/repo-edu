import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { promisify } from "node:util"
import { createRepositoryWorkflowHandlers } from "@repo-edu/application"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
} from "@repo-edu/host-node"
import { createGitProviderClient } from "@repo-edu/integrations-git"
import {
  collectExpectedRepoNames,
  collectFixtureGitUsernames,
  createGitFixture,
} from "./fixture-adapter.js"
import type { IntegrationTeam } from "./git-provider-harness.js"
import { resolveHarnessesFromEnvironment } from "./provider-matrix.js"

function plannedTeamsForExpected(
  teams: IntegrationTeam[],
  expectedGroupNames: string[],
): IntegrationTeam[] {
  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

  const expectedByName = new Set(expectedGroupNames)
  const expectedBySlug = new Set(expectedGroupNames.map(normalize))
  return teams.filter(
    (team) =>
      expectedByName.has(team.name) || expectedBySlug.has(normalize(team.name)),
  )
}

const harnesses = resolveHarnessesFromEnvironment()

for (const harness of harnesses) {
  const describeIntegration = harness.isConfigured ? describe : describe.skip

  describeIntegration(`repo.create integration (${harness.label})`, () => {
    let handlers: ReturnType<typeof createRepositoryWorkflowHandlers>

    before(async () => {
      await harness.ensureReady()
      const draft = harness.getConnectionDraft()
      const http = createNodeHttpPort()
      const git = createGitProviderClient(draft.provider, http)
      handlers = createRepositoryWorkflowHandlers({
        git,
        gitCommand: createNodeGitCommandPort(),
        fileSystem: createNodeFileSystemPort(),
      })
    })

    async function withIsolatedOrg(
      fn: (ctx: {
        organization: string
        course: PersistedCourse
        settings: PersistedAppSettings
      }) => Promise<void>,
    ): Promise<void> {
      const scopeSuffix = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
      const requestedOrg = `test-${scopeSuffix}`
      const organization = await harness.createOrganization(requestedOrg)

      const draft = harness.getConnectionDraft()
      const { course, settings } = createGitFixture({
        provider: draft.provider,
        baseUrl: draft.baseUrl,
        token: draft.token,
        organization,
        scopeSuffix,
        fixtureGitUsernames: harness.fixtureGitUsernames,
      })
      const usernames = collectFixtureGitUsernames(course)

      if (harness.supportsUserProvisioning) {
        await harness.seedUsers(usernames)
      }

      try {
        await fn({ organization, course, settings })
      } finally {
        await harness.cleanupOrganization(organization)
      }
    }

    it("creates repositories and teams", async () => {
      await withIsolatedOrg(async ({ organization, course, settings }) => {
        const expected = collectExpectedRepoNames(course, "a1")
        assert.ok(expected.repoNames.length > 0, "fixture should plan repos")

        const result = await handlers["repo.create"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
        })

        assert.ok(
          result.repositoriesCreated + result.repositoriesAdopted > 0,
          "should create or discover repositories",
        )
        assert.equal(result.repositoriesFailed, 0, "no failures expected")

        const existing = await harness.verifyRepositoriesExist(
          organization,
          expected.repoNames,
        )
        assert.deepEqual(
          existing.sort(),
          expected.repoNames.sort(),
          "all planned repos should exist",
        )

        const teams = await harness.verifyTeams(organization)
        const plannedTeams = plannedTeamsForExpected(teams, expected.groupNames)
        assert.ok(plannedTeams.length > 0, "planned teams should be created")

        const team = plannedTeams[0] as IntegrationTeam
        if (harness.assertTeamMemberAssignments) {
          const members = await harness.verifyTeamMembers(organization, team)
          assert.ok(members.length > 0, "team should have members")
        }

        const repos = await harness.verifyTeamRepos(organization, team)
        assert.ok(
          repos.some((repoName) => expected.repoNames.includes(repoName)),
          "team should have repo assignments",
        )
      })
    })

    it("records accepted repository names on the create result", async () => {
      await withIsolatedOrg(async ({ course, settings }) => {
        const expected = collectExpectedRepoNames(course, "a1")
        assert.ok(expected.repoNames.length > 0, "fixture should plan repos")

        const result = await handlers["repo.create"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
        })

        const recorded = result.recordedRepositories?.a1 ?? {}
        const recordedNames = Object.values(recorded).sort()
        assert.deepEqual(
          recordedNames,
          [...expected.repoNames].sort(),
          "every accepted name should be recorded under its groupId on the result",
        )

        for (const group of expected.groups) {
          assert.equal(
            recorded[group.groupId],
            group.repoName,
            `record for group ${group.groupId} should match planner's repo name`,
          )
        }
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
        assert.ok(
          firstResult.repositoriesCreated + firstResult.repositoriesAdopted > 0,
          "first run should process planned repositories",
        )

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
          secondResult.repositoriesAdopted > 0,
          "second run should report existing",
        )
        assert.equal(secondResult.repositoriesFailed, 0, "no failures expected")
      })
    })

    it("self-heals when a recorded repository was deleted out-of-band", async () => {
      await withIsolatedOrg(async ({ organization, course, settings }) => {
        const expected = collectExpectedRepoNames(course, "a1")
        assert.ok(
          expected.repoNames.length >= 2,
          "fixture should plan at least two repos",
        )

        // First run: creates every repo and populates records.
        const firstResult = await handlers["repo.create"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
        })
        assert.equal(
          firstResult.repositoriesCreated,
          expected.repoNames.length,
          "first run should create every planned repo fresh",
        )
        assert.equal(firstResult.repositoriesFailed, 0)

        // Apply the records onto the course exactly as the renderer/CLI
        // would after a successful run.
        const assignment = course.roster.assignments.find((a) => a.id === "a1")
        assert.ok(assignment)
        const recordedAfterFirst = firstResult.recordedRepositories?.a1 ?? {}
        assignment.repositories = { ...recordedAfterFirst }

        // Delete one server repo out-of-band, leaving the stale record in place.
        const victimName = expected.repoNames[0]
        assert.ok(victimName)
        await harness.deleteOrganizationRepository(organization, victimName)

        // Second run: the victim should be re-created fresh, and the record
        // for its group should still point at the same name.
        const secondResult = await handlers["repo.create"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
        })
        assert.equal(
          secondResult.repositoriesCreated,
          1,
          "only the deleted repo should be re-created on the second run",
        )
        assert.equal(
          secondResult.repositoriesAdopted,
          expected.repoNames.length - 1,
          "all other repos should come back as adopted",
        )
        assert.equal(secondResult.repositoriesFailed, 0)

        const recordedAfterSecond = secondResult.recordedRepositories?.a1 ?? {}
        const victimGroup = expected.groups.find(
          (group) => group.repoName === victimName,
        )
        assert.ok(victimGroup)
        assert.equal(
          recordedAfterSecond[victimGroup.groupId],
          victimName,
          "record for the recreated group should be refreshed to the same name",
        )

        // Confirm the victim actually came back on the server.
        const existing = await harness.verifyRepositoriesExist(organization, [
          victimName,
        ])
        assert.deepEqual(
          existing,
          [victimName],
          "deleted repo should exist on the server again after self-heal",
        )
      })
    })

    it("creates from template and captures commit SHA", async () => {
      await withIsolatedOrg(async ({ organization, course, settings }) => {
        const templateRepoName = "starter-template"
        await harness.seedTemplateRepository(organization, templateRepoName)

        const template = {
          kind: "remote" as const,
          owner: organization,
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
          result.repositoriesCreated + result.repositoriesAdopted > 0,
          "should process repos from template",
        )
        assert.equal(result.repositoriesFailed, 0, "no failures expected")
        assert.ok(
          result.templateCommitShas.a1 !== undefined &&
            result.templateCommitShas.a1 !== "",
          "should capture template commit SHA for assignment",
        )
      })
    })

    it("creates from local template and captures commit SHA", async () => {
      const exec = promisify(execFile)
      const localTemplatePath = await mkdtemp(join(tmpdir(), "repo-edu-tpl-"))

      try {
        await exec("git", ["init"], { cwd: localTemplatePath })
        await exec(
          "git",
          [
            "-c",
            "user.name=Test",
            "-c",
            "user.email=t@t",
            "commit",
            "--allow-empty",
            "-m",
            "init",
          ],
          { cwd: localTemplatePath },
        )
        await writeFile(join(localTemplatePath, "README.md"), "# Template\n")
        await exec("git", ["add", "."], { cwd: localTemplatePath })
        await exec(
          "git",
          [
            "-c",
            "user.name=Test",
            "-c",
            "user.email=t@t",
            "commit",
            "-m",
            "add readme",
          ],
          { cwd: localTemplatePath },
        )

        await withIsolatedOrg(async ({ course, settings }) => {
          const template = {
            kind: "local" as const,
            path: localTemplatePath,
            visibility: "private" as const,
          }

          const result = await handlers["repo.create"]({
            course,
            appSettings: settings,
            assignmentId: "a1",
            template,
          })

          assert.ok(
            result.repositoriesCreated + result.repositoriesAdopted > 0,
            "should process repos from local template",
          )
          assert.equal(result.repositoriesFailed, 0, "no failures expected")
          assert.ok(
            result.templateCommitShas.a1 !== undefined &&
              result.templateCommitShas.a1 !== "",
            "should capture template commit SHA for assignment",
          )
          assert.match(
            result.templateCommitShas.a1,
            /^[0-9a-f]{40}$/,
            "SHA should be a 40-char hex string",
          )
        })
      } finally {
        await rm(localTemplatePath, { recursive: true, force: true })
      }
    })

    after(async () => {
      // Cleanup is handled per-test in withIsolatedOrg.
    })
  })
}
