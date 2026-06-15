import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { defaultAppPreferences } from "@repo-edu/domain/settings"
import { resolveDesktopPreferencesSavePayload } from "../trpc"

const originalRepoParallelism = process.env.REPO_EDU_REPO_PARALLELISM
const originalFilesPerRepo = process.env.REPO_EDU_FILES_PER_REPO

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

afterEach(() => {
  restoreEnv("REPO_EDU_REPO_PARALLELISM", originalRepoParallelism)
  restoreEnv("REPO_EDU_FILES_PER_REPO", originalFilesPerRepo)
})

describe("resolveDesktopPreferencesSavePayload", () => {
  it("does not read persisted preferences when no env override is active", async () => {
    delete process.env.REPO_EDU_REPO_PARALLELISM
    delete process.env.REPO_EDU_FILES_PER_REPO
    let readCalls = 0
    const next = {
      ...defaultAppPreferences,
      analysisConcurrency: {
        repoParallelism: 6,
        filesPerRepo: 7,
      },
    }

    const resolved = await resolveDesktopPreferencesSavePayload(next, {
      readPreferencesWithoutRecovery: () => {
        readCalls += 1
        throw new Error("raw preferences should not be read")
      },
    })

    assert.equal(readCalls, 0)
    assert.deepStrictEqual(resolved, next)
  })

  it("falls back to defaults when raw override state is corrupt", async () => {
    process.env.REPO_EDU_REPO_PARALLELISM = "8"
    delete process.env.REPO_EDU_FILES_PER_REPO
    const next = {
      ...defaultAppPreferences,
      analysisConcurrency: {
        repoParallelism: 8,
        filesPerRepo: 7,
      },
    }

    const resolved = await resolveDesktopPreferencesSavePayload(next, {
      readPreferencesWithoutRecovery: () => {
        throw new Error("Invalid persisted preferences")
      },
    })

    assert.deepStrictEqual(resolved.analysisConcurrency, {
      repoParallelism:
        defaultAppPreferences.analysisConcurrency.repoParallelism,
      filesPerRepo: 7,
    })
  })
})
