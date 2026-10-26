import assert from "node:assert/strict"
import { before, describe, it } from "node:test"
import { createRepositoryWorkflowHandlers } from "@repo-edu/application"
import { splitAppSettings } from "@repo-edu/domain/settings"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeProcessPort,
} from "@repo-edu/host-node"
import { createChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import type { GitCommandPort } from "@repo-edu/host-runtime-contract"
import { createGitProviderClient } from "@repo-edu/integrations-git"
import type {
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import {
  collectExpectedRepoNames,
  collectFixtureGitUsernames,
  createGitFixture,
  createIntegrationResourcePrefix,
  prefixIntegrationResource,
} from "./fixture-adapter.js"
import { createIntegrationHttpPort } from "./github-request-admission.js"
import { resolveHarnessesFromEnvironment } from "./provider-matrix.js"

/** The commit the server's HEAD points at, read through git itself so the
 * check does not depend on the server's branch records catching up with the
 * push. */
async function readRemoteHead(
  gitCommand: GitCommandPort,
  cloneUrl: string,
): Promise<string> {
  const result = await gitCommand.run({
    args: ["ls-remote", cloneUrl, "HEAD"],
  })
  assert.equal(result.exitCode, 0, result.stderr)
  const head = /^([0-9a-f]{40})\tHEAD$/m.exec(result.stdout)
  assert.ok(head?.[1] !== undefined, `no HEAD in: ${result.stdout}`)
  return head[1]
}

const harnesses = resolveHarnessesFromEnvironment()

for (const harness of harnesses) {
  describe(`repo.create integration (${harness.label})`, () => {
    let draft: GitConnectionDraft
    let git: GitProviderClient
    let gitCommand: GitCommandPort
    let handlers: ReturnType<typeof createRepositoryWorkflowHandlers>

    before(async () => {
      await harness.ensureReady()
      draft = harness.getConnectionDraft()
      git = createGitProviderClient(
        draft.provider,
        createIntegrationHttpPort(draft.provider),
      )
      gitCommand = createNodeGitCommandPort(
        createNodeProcessPort(
          createChildProcessLifetimeController({
            diagnosticSink() {},
            warnUnconfirmedTree(error): never {
              throw error
            },
          }),
        ),
      )
      handlers = createRepositoryWorkflowHandlers({
        git,
        gitCommand,
        fileSystem: createNodeFileSystemPort(),
      })
    })

    it("clones a remote template and pushes its commit to every created repository", async () => {
      const resourcePrefix = createIntegrationResourcePrefix()
      const organization = await harness.createOrganization(resourcePrefix)

      try {
        const { course, settings } = createGitFixture({
          provider: draft.provider,
          baseUrl: draft.baseUrl,
          token: draft.token,
          organization,
          resourcePrefix,
          fixtureGitUsernames: harness.fixtureGitUsernames,
        })
        if (harness.supportsUserProvisioning) {
          await harness.seedUsers(collectFixtureGitUsernames(course))
        }
        const expected = collectExpectedRepoNames(course, "a1")
        const templateRepoName = prefixIntegrationResource(
          resourcePrefix,
          "starter-template",
        )
        await harness.seedTemplateRepository(organization, templateRepoName)

        const result = await handlers["repo.create"]({
          course,
          credentials: splitAppSettings(settings).credentials,
          assignmentId: "a1",
          template: {
            kind: "remote",
            owner: organization,
            name: templateRepoName,
            visibility: "private",
          },
        })

        assert.equal(result.repositoriesCreated, expected.repoNames.length)
        assert.equal(result.repositoriesFailed, 0)
        const templateCommitSha = result.templateCommitShas.a1
        assert.match(
          templateCommitSha ?? "",
          /^[0-9a-f]{40}$/,
          "the create should record the template commit it pushed",
        )

        const cloneUrls = await git.resolveRepositoryCloneUrls(draft, {
          organization,
          repositoryNames: expected.repoNames,
        })
        assert.deepEqual(cloneUrls.missing, [])
        for (const { repositoryName, cloneUrl } of cloneUrls.resolved) {
          assert.equal(
            await readRemoteHead(gitCommand, cloneUrl),
            templateCommitSha,
            `${repositoryName} should hold the pushed template commit at its HEAD`,
          )
        }
      } finally {
        await harness.cleanupOrganization(organization, resourcePrefix)
      }
    })
  })
}
