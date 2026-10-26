import assert from "node:assert/strict"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
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
  describe(`repo.clone integration (${harness.label})`, () => {
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

    it("clones the student repositories through git, the empty one included, without the token in their config", async () => {
      const { course, settings } = fixture
      const targetDirectory = await mkdtemp(
        path.join(tmpdir(), "repo-edu-clone-"),
      )

      try {
        const cloneResult = await handlers["repo.clone"]({
          course,
          credentials: splitAppSettings(settings).credentials,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })

        assert.equal(cloneResult.repositoriesCloned, 2)
        assert.equal(cloneResult.repositoriesFailed, 0)

        for (const repoName of [
          fixture.initialisedRepositoryName,
          fixture.emptyRepositoryName,
        ]) {
          const config = await readFile(
            path.join(targetDirectory, repoName, ".git", "config"),
            "utf-8",
          )
          assert.ok(
            !config.includes(settings.gitConnections[0].token),
            `token should not appear in ${repoName}/.git/config`,
          )
          assert.ok(
            config.includes('[remote "origin"]'),
            `${repoName} should have an origin remote`,
          )
        }
        assert.ok(
          (
            await readdir(
              path.join(targetDirectory, fixture.initialisedRepositoryName),
            )
          ).includes("README.md"),
          "the initialised repository should check out the server's initial commit",
        )
        assert.deepEqual(
          await readdir(
            path.join(targetDirectory, fixture.emptyRepositoryName),
          ),
          [".git"],
          "the empty repository should check out nothing",
        )
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })
}
