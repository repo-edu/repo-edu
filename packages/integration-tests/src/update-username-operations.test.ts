import assert from "node:assert/strict"
import { before, describe, it } from "node:test"
import { createGitProviderClient } from "@repo-edu/integrations-git"
import type {
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import {
  collectExpectedRepoNames,
  createGitFixture,
  createIntegrationResourcePrefix,
} from "./fixture-adapter.js"
import type { GitProviderHarness } from "./git-provider-harness.js"
import { createIntegrationHttpPort } from "./github-request-admission.js"
import { resolveHarnessesFromEnvironment } from "./provider-matrix.js"

type OperationContext = {
  organization: string
  resourcePrefix: string
}

function one<T>(values: readonly T[], message: string): T {
  assert.equal(values.length, 1, message)
  const value = values[0]
  assert.ok(value !== undefined, message)
  return value
}

function two<T>(values: readonly T[], message: string): [T, T] {
  assert.equal(values.length, 2, message)
  const first = values[0]
  const second = values[1]
  assert.ok(first !== undefined && second !== undefined, message)
  return [first, second]
}

function presentUsername(
  harness: GitProviderHarness,
  resourcePrefix: string,
): string {
  if (harness.supportsUserProvisioning) {
    return `${resourcePrefix}-student`
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
  describe(`Update and username import provider operations (${harness.label})`, () => {
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

    it("reads present and absent username replies", async () => {
      const resourcePrefix = createIntegrationResourcePrefix()
      const username = presentUsername(harness, resourcePrefix)
      if (harness.supportsUserProvisioning) {
        await harness.seedUsers([username])
      }
      const absentUsername = `${resourcePrefix}-absent`

      assert.deepEqual(
        await client.verifyGitUsernames(draft, [username, absentUsername]),
        [
          { username, exists: true },
          { username: absentUsername, exists: false },
        ],
      )
    })

    it("reads repository heads and writes an update branch and pull request", async () => {
      await withIsolatedOrganization(
        harness,
        async ({ organization, resourcePrefix }) => {
          const { course } = createGitFixture({
            provider: draft.provider,
            baseUrl: draft.baseUrl,
            token: draft.token,
            organization,
            resourcePrefix,
            fixtureGitUsernames: harness.fixtureGitUsernames,
          })
          const [repositoryName, emptyRepositoryName] = two(
            collectExpectedRepoNames(course, "a1").repoNames,
            "the product fixture should plan two student repositories",
          )
          await harness.seedOrganizationRepository(organization, repositoryName)
          await harness.seedOrganizationRepository(
            organization,
            emptyRepositoryName,
            { autoInit: false },
          )

          const head = await client.getRepositoryDefaultBranchHead(draft, {
            owner: organization,
            repositoryName,
          })
          assert.ok(head !== null)
          assert.notEqual(head.sha, "")
          assert.notEqual(head.branchName, "")

          assert.equal(
            await client.getRepositoryDefaultBranchHead(draft, {
              owner: organization,
              repositoryName: `${resourcePrefix}-missing-student`,
            }),
            null,
          )
          assert.equal(
            await client.getRepositoryDefaultBranchHead(draft, {
              owner: organization,
              repositoryName: emptyRepositoryName,
            }),
            null,
          )

          const branchName = `${resourcePrefix}-template-update`
          const readme = "Updated student repository\n"
          const summary = "Plain-file update verified\n"
          const branchRequest = {
            owner: organization,
            repositoryName,
            branchName,
            baseSha: head.sha,
            commitMessage: "Update student repository",
            files: [
              {
                path: "README.md",
                previousPath: null,
                status: "modified" as const,
                contentBase64: Buffer.from(readme).toString("base64"),
              },
              {
                path: "feedback/summary.txt",
                previousPath: null,
                status: "added" as const,
                contentBase64: Buffer.from(summary).toString("base64"),
              },
              {
                path: "obsolete.txt",
                previousPath: null,
                status: "removed" as const,
                contentBase64: null,
              },
            ],
          }

          await client.createBranch(draft, branchRequest)
          assert.equal(
            await harness.readRepositoryFile(
              organization,
              repositoryName,
              branchName,
              "README.md",
            ),
            readme,
          )
          assert.equal(
            await harness.readRepositoryFile(
              organization,
              repositoryName,
              branchName,
              "feedback/summary.txt",
            ),
            summary,
          )
          assert.equal(
            await harness.readRepositoryFile(
              organization,
              repositoryName,
              branchName,
              "obsolete.txt",
            ),
            null,
          )

          await client.createBranch(draft, { ...branchRequest, files: [] })
          await assert.rejects(
            client.createBranch(draft, {
              ...branchRequest,
              branchName: `${resourcePrefix} invalid branch`,
              files: [],
            }),
            { type: "git-effect", disposition: "completed" },
          )

          const pullRequest = {
            owner: organization,
            repositoryName,
            headBranch: branchName,
            baseBranch: head.branchName,
            title: "Update student repository",
            body: "Apply the plain-file template update.",
          }
          await assert.rejects(
            client.createPullRequest(draft, {
              ...pullRequest,
              headBranch: `${resourcePrefix}-missing-branch`,
            }),
            { type: "git-effect", disposition: "completed" },
          )
          const created = await client.createPullRequest(draft, pullRequest)
          assert.equal(created.created, true)
          if (created.created) {
            assert.notEqual(created.url, "")
          }

          const openPull = one(
            (
              await harness.listPullRequests(organization, repositoryName)
            ).filter(
              (pull) =>
                pull.headBranch === branchName &&
                pull.baseBranch === head.branchName,
            ),
            "the provider should expose the opened pull request",
          )
          if (created.created) {
            assert.equal(openPull.url, created.url)
          }
          assert.deepEqual(await client.createPullRequest(draft, pullRequest), {
            created: false,
          })

          if (draft.provider === "github") {
            const unchangedBranch = `${resourcePrefix}-unchanged`
            await client.createBranch(draft, {
              ...branchRequest,
              branchName: unchangedBranch,
              files: [],
            })
            assert.deepEqual(
              await client.createPullRequest(draft, {
                ...pullRequest,
                headBranch: unchangedBranch,
              }),
              { created: false },
            )
          }
        },
      )
    })
  })
}
