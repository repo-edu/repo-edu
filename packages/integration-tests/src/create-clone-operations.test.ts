import assert from "node:assert/strict"
import { before, describe, it } from "node:test"
import {
  buildTeamName,
  createGitProviderClient,
} from "@repo-edu/integrations-git"
import type {
  CreateTeamRequest,
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import { createIntegrationResourcePrefix } from "./fixture-adapter.js"
import type {
  GitProviderHarness,
  IntegrationTeam,
} from "./git-provider-harness.js"
import { createIntegrationHttpPort } from "./github-request-admission.js"
import { resolveHarnessesFromEnvironment } from "./provider-matrix.js"

type OperationContext = {
  organization: string
  resourcePrefix: string
}

const refusedRepositoryStatuses = {
  gitea: 422,
  github: 422,
  gitlab: 400,
} as const

const refusedRepositoryDetails = {
  gitea: /: \[Name\]: MaxSize$/,
  github:
    /: Repository creation failed\.: .*name cannot be more than 100 characters/,
  gitlab: /: .*"name":\["is too long \(maximum is 255 characters\)"\]/,
} as const

function one<T>(values: readonly T[], message: string): T {
  assert.equal(values.length, 1, message)
  const value = values[0]
  assert.ok(value !== undefined, message)
  return value
}

function findTeam(teams: readonly IntegrationTeam[], name: string) {
  const matches = teams.filter((team) => team.name === name)
  return one(matches, `expected exactly one team named '${name}'`)
}

function createTeamRequests(
  organization: string,
  resourcePrefix: string,
  memberUsernames: string[],
): CreateTeamRequest[] {
  const common = {
    organization,
    groupName: `${resourcePrefix} Gróúp Álpha`,
    memberUsernames: [],
    permission: "push" as const,
  }
  return [
    {
      ...common,
      courseId: `${resourcePrefix}-course-a`,
      groupId: "g_0001",
      memberUsernames,
    },
    {
      ...common,
      courseId: `${resourcePrefix}-course-a`,
      groupId: "g_0002",
    },
    {
      ...common,
      courseId: `${resourcePrefix}-course-b`,
      groupId: "g_0001",
    },
    {
      ...common,
      courseId: `${resourcePrefix}-course-a`,
      groupId: "g_0003",
      groupName: `${resourcePrefix} ${"l".repeat(400)}`,
    },
  ]
}

function presentUsername(
  harness: GitProviderHarness,
  resourcePrefix: string,
): string {
  if (harness.supportsUserProvisioning) {
    return `${resourcePrefix}-member`
  }
  return one(
    harness.fixtureGitUsernames,
    `${harness.label} should expose its authenticated owner`,
  )
}

async function withIsolatedOrganization(
  harness: GitProviderHarness,
  test: (context: OperationContext) => Promise<void>,
): Promise<void> {
  const resourcePrefix = createIntegrationResourcePrefix()
  const organization = await harness.createOrganization(resourcePrefix)
  try {
    await test({ organization, resourcePrefix })
  } finally {
    await harness.cleanupOrganization(organization, resourcePrefix)
  }
}

const harnesses = resolveHarnessesFromEnvironment()

for (const harness of harnesses) {
  describe(`Create and Clone provider operations (${harness.label})`, () => {
    let client: GitProviderClient
    let draft: GitConnectionDraft

    before(async () => {
      await harness.ensureReady()
      draft = harness.getConnectionDraft()
      client = createGitProviderClient(
        draft.provider,
        createIntegrationHttpPort(draft.provider),
      )
    })

    it("reads created, existing, refused, resolved and missing repository replies", async () => {
      await withIsolatedOrganization(
        harness,
        async ({ organization, resourcePrefix }) => {
          const repositoryName = `${resourcePrefix}-assignment-team-1`
          const refusedName = `${resourcePrefix}-${"x".repeat(256)}`

          const created = await client.createRepositories(draft, {
            organization,
            repositoryNames: [repositoryName, refusedName],
            visibility: "private",
            autoInit: false,
          })

          assert.deepEqual(
            created.created.map((repository) => repository.repositoryName),
            [repositoryName],
          )
          assert.deepEqual(created.alreadyExisted, [])
          const refused = one(
            created.failed,
            "one refused repository should be reported",
          )
          assert.equal(refused.repositoryName, refusedName)
          assert.match(
            refused.reason,
            new RegExp(
              `^POST .* answered ${refusedRepositoryStatuses[draft.provider]}: `,
            ),
          )
          assert.match(refused.reason, refusedRepositoryDetails[draft.provider])
          assert.deepEqual(
            await harness.verifyRepositoriesExist(organization, [
              repositoryName,
            ]),
            [repositoryName],
          )

          const existing = await client.createRepositories(draft, {
            organization,
            repositoryNames: [repositoryName],
            visibility: "private",
            autoInit: false,
          })
          assert.deepEqual(existing.created, [])
          assert.deepEqual(existing.failed, [])
          assert.equal(
            one(
              existing.alreadyExisted,
              "the existing repository should be adopted",
            ).repositoryName,
            repositoryName,
          )

          const missingName = `${resourcePrefix}-missing`
          const cloneUrls = await client.resolveRepositoryCloneUrls(draft, {
            organization,
            repositoryNames: [repositoryName, missingName],
          })
          const resolved = one(
            cloneUrls.resolved,
            "one clone URL should be resolved",
          )
          assert.equal(resolved.repositoryName, repositoryName)
          assert.ok(resolved.cloneUrl.includes(draft.token))
          assert.deepEqual(cloneUrls.missing, [missingName])
        },
      )
    })

    it("reads team creation, membership, identity and assignment replies", async () => {
      await withIsolatedOrganization(
        harness,
        async ({ organization, resourcePrefix }) => {
          const username = presentUsername(harness, resourcePrefix)
          if (harness.supportsUserProvisioning) {
            await harness.seedUsers([username])
          }
          const missingUsername = `${resourcePrefix}-absent`
          const requests = createTeamRequests(organization, resourcePrefix, [
            username,
            missingUsername,
          ])
          const firstRequest = requests[0]
          assert.ok(firstRequest !== undefined)

          const first = await client.createTeam(draft, firstRequest)
          assert.equal(first.created, true)
          assert.deepEqual(first.membersAdded, [username])
          assert.deepEqual(first.membersNotFound, [missingUsername])

          const existing = await client.createTeam(draft, firstRequest)
          assert.equal(existing.created, false)
          assert.equal(existing.teamSlug, first.teamSlug)
          assert.deepEqual(existing.membersAdded, [username])
          assert.deepEqual(existing.membersNotFound, [missingUsername])

          for (const request of requests.slice(1)) {
            const result = await client.createTeam(draft, request)
            assert.equal(result.created, true)
          }

          const expectedNames = requests.map(buildTeamName)
          assert.equal(new Set(expectedNames).size, requests.length)
          assert.match(expectedNames[0] ?? "", /^team-[a-z0-9_-]+$/)
          assert.equal(`${organization}/${expectedNames.at(-1)}`.length, 255)

          const teams = await harness.verifyTeams(organization)
          for (const expectedName of expectedNames) {
            findTeam(teams, expectedName)
          }

          const repositoryName = `${resourcePrefix}-assignment-team-1`
          const repositoryResult = await client.createRepositories(draft, {
            organization,
            repositoryNames: [repositoryName],
            visibility: "private",
            autoInit: false,
          })
          assert.equal(repositoryResult.created.length, 1)

          const assignment = {
            organization,
            teamSlug: first.teamSlug,
            repositoryNames: [repositoryName],
            permission: "push" as const,
          }
          await client.assignRepositoriesToTeam(draft, assignment)
          await client.assignRepositoriesToTeam(draft, assignment)

          const team = findTeam(teams, expectedNames[0] ?? "")
          const members = await harness.verifyTeamMembers(organization, team)
          assert.ok(members.includes(username))
          const repositories = await harness.verifyTeamRepos(organization, team)
          assert.ok(repositories.includes(repositoryName))
        },
      )
    })
  })
}
