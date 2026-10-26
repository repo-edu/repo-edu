import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, describe, it } from "node:test"
import { createRepositoryWorkflowHandlers } from "@repo-edu/application"
import { splitAppSettings } from "@repo-edu/domain/settings"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeProcessPort,
} from "@repo-edu/host-node"
import { createChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import { createGitProviderClient } from "@repo-edu/integrations-git"
import { createIntegrationHttpPort } from "./github-request-admission.js"
import { runFixtures } from "./run-fixture.js"

for (const fixture of runFixtures()) {
  const { harness } = fixture
  describe(`repo.discover integration (${harness.label})`, () => {
    let handlers: ReturnType<typeof createRepositoryWorkflowHandlers>

    before(() => {
      const draft = harness.getConnectionDraft()
      const http = createIntegrationHttpPort(draft.provider)
      const git = createGitProviderClient(draft.provider, http)
      handlers = createRepositoryWorkflowHandlers({
        git,
        gitCommand: createNodeGitCommandPort(
          createNodeProcessPort(
            createChildProcessLifetimeController({
              diagnosticSink() {},
              warnUnconfirmedTree(error): never {
                throw error
              },
            }),
          ),
        ),
        fileSystem: createNodeFileSystemPort(),
      })
    })

    it("lists the student repositories by pattern and bulk-clones them through git", async () => {
      const { organization, settings } = fixture
      const credentials = splitAppSettings(settings).credentials
      const studentRepositoryNames = [
        fixture.initialisedRepositoryName,
        fixture.emptyRepositoryName,
      ].sort()
      const targetDirectory = await mkdtemp(
        path.join(tmpdir(), "repo-edu-bulk-clone-"),
      )

      try {
        const listResult = await handlers["repo.listNamespace"]({
          credentials,
          namespace: organization,
          filter: `${fixture.resourcePrefix}.*`,
        })
        assert.deepEqual(
          listResult.repositories.map((entry) => entry.name).sort(),
          studentRepositoryNames,
          "the pattern should list exactly the course's student repositories",
        )

        const cloneResult = await handlers["repo.bulkClone"]({
          credentials,
          namespace: organization,
          repositories: listResult.repositories.map(({ name, identifier }) => ({
            name,
            identifier,
          })),
          targetDirectory,
        })

        assert.equal(cloneResult.repositoriesPlanned, 2)
        assert.equal(cloneResult.repositoriesCloned, 2)
        assert.equal(cloneResult.repositoriesFailed, 0)
        assert.deepEqual(
          cloneResult.recordedRepositories,
          {},
          "bulk clone must not write repository records",
        )

        for (const repoName of studentRepositoryNames) {
          const config = await readFile(
            path.join(targetDirectory, repoName, ".git", "config"),
            "utf-8",
          )
          assert.ok(
            config.includes('[remote "origin"]'),
            `${repoName} should have an origin remote after bulk clone`,
          )
          assert.ok(
            !config.includes(settings.gitConnections[0].token),
            `token should not appear in ${repoName}/.git/config`,
          )
        }
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })
}
