import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import {
  createRepoHarness,
  gitAnswer,
  readGitCall,
} from "./helpers/repo-workflow-harness.js"

describe("application repository bulk clone validation", () => {
  it("rejects relative target directories", async () => {
    const { settings, handlers } = createRepoHarness()

    await assert.rejects(
      async () =>
        handlers["repo.bulkClone"]({
          credentials: settings,
          namespace: "repo-edu",
          repositories: [{ name: "repo-a", identifier: "repo-a" }],
          targetDirectory: "repos",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CommandOutcomeError)
        assert.equal(error.outcome.disposition, "refused")
        if (error.outcome.disposition !== "refused") return false
        error = error.outcome.error
        const appError = error as {
          type?: string
          message?: string
          issues?: Array<{ path?: string }>
        }
        assert.equal(appError.type, "validation")
        assert.match(appError.message ?? "", /absolute target directory/i)
        assert.equal(appError.issues?.[0]?.path, "targetDirectory")
        return true
      },
    )
  })

  it("rejects entries whose leaf names collide into the same local folder", async () => {
    const { settings, handlers } = createRepoHarness()

    await assert.rejects(
      async () =>
        handlers["repo.bulkClone"]({
          credentials: settings,
          namespace: "repo-edu",
          repositories: [
            { name: "lab/1", identifier: "team-alpha/lab-1" },
            { name: "lab\\1", identifier: "team-beta/lab-1" },
          ],
          targetDirectory: "/tmp/repo-edu-bulk-clone-collision",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CommandOutcomeError)
        assert.equal(error.outcome.disposition, "refused")
        if (error.outcome.disposition !== "refused") return false
        error = error.outcome.error
        const appError = error as {
          type?: string
          message?: string
          issues?: Array<{ path?: string; message?: string }>
        }
        assert.equal(appError.type, "validation")
        assert.match(appError.message ?? "", /colliding local folder/i)
        assert.equal(appError.issues?.[0]?.path, "repositories")
        assert.match(
          appError.issues?.[0]?.message ?? "",
          /team-alpha\/lab-1.*team-beta\/lab-1/,
        )
        return true
      },
    )
  })

  it("clones through the shared clone execution, counts missing repositories as failed and records nothing", async () => {
    const targetDirectory = join(tmpdir(), "repo-edu-bulk-clone-target")
    const pulled: string[] = []
    const copied: string[] = []
    const { settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async () => ({
          resolved: [
            {
              repositoryName: "team-alpha/lab-1",
              cloneUrl:
                "https://x-access-token:token-1@github.com/course-group/lab-1.git",
            },
          ],
          missing: ["team-beta/lab-2"],
        }),
      },
      gitCommand: {
        run: async (request) => {
          const call = readGitCall(request)
          if (call.args[0] === "pull") pulled.push(call.args[1] ?? "")
          return gitAnswer("")
        },
      },
      fileSystem: {
        inspect: async (request) =>
          request.paths.map((path) => ({ path, kind: "missing" as const })),
        applyBatch: async (request) => {
          for (const operation of request.operations) {
            if (operation.kind === "copy-directory")
              copied.push(operation.destinationPath)
          }
          return { completed: [...request.operations] }
        },
      },
    })

    const result = await handlers["repo.bulkClone"]({
      credentials: settings,
      namespace: "course-group",
      repositories: [
        { name: "lab-1", identifier: "team-alpha/lab-1" },
        { name: "lab-2", identifier: "team-beta/lab-2" },
      ],
      targetDirectory,
    })

    assert.equal(result.repositoriesPlanned, 2)
    assert.equal(result.repositoriesCloned, 1)
    assert.equal(result.repositoriesFailed, 1)
    assert.deepEqual(result.recordedRepositories, {})
    assert.deepEqual(pulled, [
      "https://x-access-token:token-1@github.com/course-group/lab-1.git",
    ])
    assert.deepEqual(copied, [join(targetDirectory, "lab-1")])
  })
})
