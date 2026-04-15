import assert from "node:assert/strict"
import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { before, describe, it } from "node:test"
import { createRepositoryWorkflowHandlers } from "@repo-edu/application"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
} from "@repo-edu/host-node"
import { createGitProviderClient } from "@repo-edu/integrations-git"
import { createGitFixture } from "./fixture-adapter.js"
import { resolveHarnessesFromEnvironment } from "./provider-matrix.js"

const harnesses = resolveHarnessesFromEnvironment()

for (const harness of harnesses) {
  const describeIntegration = harness.isConfigured ? describe : describe.skip

  describeIntegration(`repo.discover integration (${harness.label})`, () => {
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

    async function withSeededOrg(
      seedNames: readonly string[],
      fn: (ctx: {
        organization: string
        settings: PersistedAppSettings
      }) => Promise<void>,
    ): Promise<void> {
      const scopeSuffix = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
      const requestedOrg = `test-${scopeSuffix}`
      const organization = await harness.createOrganization(requestedOrg)

      const draft = harness.getConnectionDraft()
      const { settings } = createGitFixture({
        provider: draft.provider,
        baseUrl: draft.baseUrl,
        token: draft.token,
        organization,
        scopeSuffix,
        fixtureGitUsernames: harness.fixtureGitUsernames,
      })

      try {
        for (const repoName of seedNames) {
          await harness.seedOrganizationRepository(organization, repoName, {
            autoInit: false,
          })
        }
        await fn({ organization, settings })
      } finally {
        await harness.cleanupOrganization(organization)
      }
    }

    it("lists every repository in a namespace when no filter is provided", async () => {
      const seedNames = ["alpha-repo", "beta-repo", "gamma-repo"]
      await withSeededOrg(seedNames, async ({ organization, settings }) => {
        const result = await handlers["repo.listNamespace"]({
          appSettings: settings,
          namespace: organization,
        })

        const listed = result.repositories.map((entry) => entry.name).sort()
        for (const expected of seedNames) {
          assert.ok(
            listed.includes(expected),
            `expected listing to include '${expected}', got ${listed.join(", ")}`,
          )
        }
      })
    })

    it("filters listing by glob pattern", async () => {
      const seedNames = ["lab1-alice", "lab1-bob", "lab2-carol"]
      await withSeededOrg(seedNames, async ({ organization, settings }) => {
        const result = await handlers["repo.listNamespace"]({
          appSettings: settings,
          namespace: organization,
          filter: "lab1-*",
        })

        const listed = result.repositories.map((entry) => entry.name).sort()
        assert.deepEqual(
          listed,
          ["lab1-alice", "lab1-bob"],
          "only lab1-* repositories should match the filter",
        )
      })
    })

    it("bulk-clones the listed repositories flat into the target directory", async () => {
      const seedNames = ["bulk-one", "bulk-two", "bulk-three"]
      await withSeededOrg(seedNames, async ({ organization, settings }) => {
        const targetDirectory = path.join(
          tmpdir(),
          `repo-edu-bulk-clone-${Date.now()}`,
        )

        try {
          const listResult = await handlers["repo.listNamespace"]({
            appSettings: settings,
            namespace: organization,
            filter: "bulk-*",
          })
          const cloneResult = await handlers["repo.bulkClone"]({
            appSettings: settings,
            namespace: organization,
            repositories: listResult.repositories.map(
              ({ name, identifier }) => ({ name, identifier }),
            ),
            targetDirectory,
          })

          assert.equal(
            cloneResult.repositoriesPlanned,
            seedNames.length,
            "planned should equal the number of repos passed in",
          )
          assert.equal(
            cloneResult.repositoriesCloned,
            seedNames.length,
            "every listed repo should clone successfully",
          )
          assert.equal(cloneResult.repositoriesFailed, 0)
          assert.deepEqual(
            cloneResult.recordedRepositories,
            {},
            "bulk clone must not write repository records",
          )

          for (const repoName of seedNames) {
            const configPath = path.join(
              targetDirectory,
              repoName,
              ".git",
              "config",
            )
            const config = await readFile(configPath, "utf-8")
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

    it("counts missing remotes as failed without aborting the batch", async () => {
      const seedNames = ["present-one", "present-two"]
      await withSeededOrg(seedNames, async ({ organization, settings }) => {
        const targetDirectory = path.join(
          tmpdir(),
          `repo-edu-bulk-clone-miss-${Date.now()}`,
        )

        try {
          const cloneResult = await handlers["repo.bulkClone"]({
            appSettings: settings,
            namespace: organization,
            repositories: [...seedNames, "not-a-real-repo"].map((repoName) => ({
              name: repoName,
              identifier: repoName,
            })),
            targetDirectory,
          })

          assert.equal(cloneResult.repositoriesPlanned, 3)
          assert.equal(cloneResult.repositoriesCloned, 2)
          assert.ok(
            cloneResult.repositoriesFailed >= 1,
            "at least the missing remote should be counted as failed",
          )
        } finally {
          await rm(targetDirectory, { recursive: true, force: true })
        }
      })
    })

    it("returns an empty result when the repository list is empty", async () => {
      await withSeededOrg([], async ({ organization, settings }) => {
        const result = await handlers["repo.bulkClone"]({
          appSettings: settings,
          namespace: organization,
          repositories: [],
          targetDirectory: path.join(tmpdir(), "repo-edu-bulk-clone-empty"),
        })

        assert.equal(result.repositoriesPlanned, 0)
        assert.equal(result.repositoriesCloned, 0)
        assert.equal(result.repositoriesFailed, 0)
        assert.deepEqual(result.recordedRepositories, {})
      })
    })
  })
}
