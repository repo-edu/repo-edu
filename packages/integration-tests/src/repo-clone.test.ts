import assert from "node:assert/strict"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, describe, it } from "node:test"
import { createRepositoryWorkflowHandlers } from "@repo-edu/application"
import type { PersistedAppSettings, PersistedCourse } from "@repo-edu/domain"
import {
  createNodeFileSystemPort,
  createNodeGitCommandPort,
  createNodeHttpPort,
} from "@repo-edu/host-node"
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
  seedOrganizationRepository,
} from "./gitea-harness.js"

const GITEA_URL = process.env.INTEGRATION_GITEA_URL ?? ""

const describeIntegration = GITEA_URL ? describe : describe.skip

describeIntegration("repo.clone integration (Gitea)", () => {
  let token: string
  let handlers: ReturnType<typeof createRepositoryWorkflowHandlers>

  before(async () => {
    await ensureGiteaReady(GITEA_URL)
    token = await createAdminToken(GITEA_URL)

    const http = createNodeHttpPort()
    const git = createGiteaClient(http)
    handlers = createRepositoryWorkflowHandlers({
      git,
      gitCommand: createNodeGitCommandPort(),
      fileSystem: createNodeFileSystemPort(),
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

  it("clones repositories to disk without auth tokens in git config", async () => {
    await withIsolatedOrg(async ({ course, settings }) => {
      const expected = collectExpectedRepoNames(course, "a1")
      assert.ok(expected.repoNames.length > 0, "fixture should plan repos")

      // First create repos so there is something to clone.
      const createResult = await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })
      assert.ok(
        createResult.repositoriesCreated > 0,
        "setup: should create repos",
      )

      const targetDirectory = path.join(
        tmpdir(),
        `repo-edu-clone-test-${Date.now()}`,
      )

      try {
        const cloneResult = await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })

        assert.ok(
          cloneResult.repositoriesCloned > 0,
          "should clone repositories",
        )
        assert.equal(cloneResult.repositoriesFailed, 0, "no failures expected")

        // Verify each cloned repo exists on disk and has no auth token in config.
        for (const repoName of expected.repoNames) {
          const repoPath = path.join(targetDirectory, repoName)
          const configPath = path.join(repoPath, ".git", "config")
          const config = await readFile(configPath, "utf-8")

          assert.ok(
            !config.includes(settings.gitConnections[0].token),
            `token should not appear in ${repoName}/.git/config`,
          )

          assert.ok(
            config.includes('[remote "origin"]'),
            `${repoName} should have an origin remote`,
          )
        }
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })

  it("skips repositories that already exist locally", async () => {
    await withIsolatedOrg(async ({ course, settings }) => {
      await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })

      const targetDirectory = path.join(
        tmpdir(),
        `repo-edu-clone-test-${Date.now()}`,
      )

      try {
        const firstClone = await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })
        assert.ok(firstClone.repositoriesCloned > 0, "first clone should work")

        const secondClone = await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })
        assert.equal(
          secondClone.repositoriesCloned,
          0,
          "second clone should skip all (already exist)",
        )
        assert.equal(secondClone.repositoriesFailed, 0, "no failures expected")
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })

  it("errors on non-git path clashes in the target directory", async () => {
    await withIsolatedOrg(async ({ course, settings }) => {
      const expected = collectExpectedRepoNames(course, "a1")
      assert.ok(expected.repoNames.length > 0, "fixture should plan repos")
      await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })

      const targetDirectory = path.join(
        tmpdir(),
        `repo-edu-clone-test-${Date.now()}`,
      )
      const clashingRepoName = expected.repoNames[0]
      assert.ok(clashingRepoName, "expected at least one repository")
      const clashingPath = path.join(targetDirectory, clashingRepoName)

      try {
        await mkdir(clashingPath, { recursive: true })
        await writeFile(path.join(clashingPath, "note.txt"), "not a git repo")

        await assert.rejects(
          async () =>
            handlers["repo.clone"]({
              course,
              appSettings: settings,
              assignmentId: "a1",
              template: null,
              targetDirectory,
              directoryLayout: "flat",
            }),
          (error: unknown) => {
            const appError = error as { type?: string; message?: string }
            assert.equal(appError.type, "validation")
            assert.match(appError.message ?? "", /non-git entries/)
            return true
          },
        )
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })

  it("treats empty remote repositories as successful clones", async () => {
    await withIsolatedOrg(async ({ orgName, course, settings }) => {
      const expected = collectExpectedRepoNames(course, "a1")
      assert.ok(expected.repoNames.length > 0, "fixture should plan repos")
      for (const repoName of expected.repoNames) {
        await seedOrganizationRepository(GITEA_URL, token, orgName, repoName, {
          autoInit: false,
        })
      }

      const targetDirectory = path.join(
        tmpdir(),
        `repo-edu-clone-test-${Date.now()}`,
      )
      try {
        const cloneResult = await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })

        assert.equal(
          cloneResult.repositoriesCloned,
          expected.repoNames.length,
          "all empty repositories should be treated as cloned",
        )
        assert.equal(cloneResult.repositoriesFailed, 0, "no failures expected")
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })

  it("does not clobber contents of already-cloned repositories", async () => {
    await withIsolatedOrg(async ({ course, settings }) => {
      const expected = collectExpectedRepoNames(course, "a1")
      assert.ok(expected.repoNames.length > 0, "fixture should plan repos")

      await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })

      const targetDirectory = path.join(
        tmpdir(),
        `repo-edu-clone-test-${Date.now()}`,
      )

      try {
        await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })

        // Drop a sentinel file into each cloned repo.
        const sentinelName = "clone-test-sentinel.txt"
        for (const repoName of expected.repoNames) {
          await writeFile(
            path.join(targetDirectory, repoName, sentinelName),
            repoName,
          )
        }

        // Clone again — should skip all repos.
        const secondClone = await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })
        assert.equal(secondClone.repositoriesCloned, 0)

        // Verify sentinel files are still present (contents not clobbered).
        for (const repoName of expected.repoNames) {
          const sentinel = await readFile(
            path.join(targetDirectory, repoName, sentinelName),
            "utf-8",
          )
          assert.equal(
            sentinel,
            repoName,
            `sentinel in ${repoName} should be untouched after second clone`,
          )
        }
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })

  it("reports partial failures when some remotes do not exist", async () => {
    await withIsolatedOrg(async ({ orgName, course, settings }) => {
      const expected = collectExpectedRepoNames(course, "a1")
      assert.ok(expected.repoNames.length >= 2, "need at least 2 planned repos")

      // Only seed the first repo on the server — the rest will be missing.
      await seedOrganizationRepository(
        GITEA_URL,
        token,
        orgName,
        expected.repoNames[0],
      )

      const targetDirectory = path.join(
        tmpdir(),
        `repo-edu-clone-test-${Date.now()}`,
      )

      try {
        const cloneResult = await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "flat",
        })

        assert.equal(
          cloneResult.repositoriesCloned,
          1,
          "only the seeded repo should be cloned",
        )
        assert.ok(
          cloneResult.repositoriesFailed >= 1,
          "missing remotes should count as failed",
        )

        // Verify the successfully cloned repo exists on disk.
        const clonedRepoPath = path.join(targetDirectory, expected.repoNames[0])
        const configPath = path.join(clonedRepoPath, ".git", "config")
        const config = await readFile(configPath, "utf-8")
        assert.ok(
          config.includes('[remote "origin"]'),
          "cloned repo should have an origin remote",
        )
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })

  it("organizes cloned repositories into team subdirectories with by-team layout", async () => {
    await withIsolatedOrg(async ({ course, settings }) => {
      const expected = collectExpectedRepoNames(course, "a1")
      assert.ok(expected.repoNames.length > 0, "fixture should plan repos")

      await handlers["repo.create"]({
        course,
        appSettings: settings,
        assignmentId: "a1",
        template: null,
      })

      const targetDirectory = path.join(
        tmpdir(),
        `repo-edu-clone-test-${Date.now()}`,
      )

      try {
        const cloneResult = await handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory,
          directoryLayout: "by-team",
        })

        assert.ok(
          cloneResult.repositoriesCloned > 0,
          "should clone repositories",
        )
        assert.equal(cloneResult.repositoriesFailed, 0, "no failures expected")

        // Verify each repo lives under its group name subdirectory.
        for (const group of expected.groups) {
          const repoPath = path.join(
            targetDirectory,
            group.groupName,
            group.repoName,
          )
          const configPath = path.join(repoPath, ".git", "config")
          const config = await readFile(configPath, "utf-8")
          assert.ok(
            config.includes('[remote "origin"]'),
            `${group.groupName}/${group.repoName} should have an origin remote`,
          )
        }

        // Verify top-level entries are group-name directories, not repo names.
        const topLevelEntries = await readdir(targetDirectory)
        const expectedGroupNames = [
          ...new Set(expected.groups.map((g) => g.groupName)),
        ]
        for (const groupName of expectedGroupNames) {
          assert.ok(
            topLevelEntries.includes(groupName),
            `target directory should contain group subdirectory '${groupName}'`,
          )
        }
      } finally {
        await rm(targetDirectory, { recursive: true, force: true })
      }
    })
  })

  after(async () => {
    // Cleanup is handled per-test in withIsolatedOrg.
  })
})
