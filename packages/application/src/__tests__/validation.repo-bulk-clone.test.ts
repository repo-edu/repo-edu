import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createRepoHarness } from "./helpers/repo-workflow-harness.js"

describe("application repository bulk clone validation", () => {
  it("rejects relative target directories", async () => {
    const { settings, handlers } = createRepoHarness()

    await assert.rejects(
      async () =>
        handlers["repo.bulkClone"]({
          appSettings: settings,
          namespace: "repo-edu",
          repositories: [{ name: "repo-a", identifier: "repo-a" }],
          targetDirectory: "repos",
        }),
      (error: unknown) => {
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
          appSettings: settings,
          namespace: "repo-edu",
          repositories: [
            { name: "lab-1", identifier: "team-alpha/lab-1" },
            { name: "lab-1", identifier: "team-beta/lab-1" },
          ],
          targetDirectory: "/tmp/repo-edu-bulk-clone-collision",
        }),
      (error: unknown) => {
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
})
