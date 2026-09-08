import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { createSettingsLoadWorkflowHandlers } from "@repo-edu/application"
import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import { createCliAppSettingsLoader } from "../state-store.js"

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-cli-settings-"))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function loadSettings(root: string, signal?: AbortSignal) {
  return createSettingsLoadWorkflowHandlers(createCliAppSettingsLoader(root))[
    "settings.loadApp"
  ](undefined, { signal })
}

describe("command-line settings loads", () => {
  it("returns defaults without creating the missing settings directory", async () => {
    await withRoot(async (root) => {
      assert.deepStrictEqual(await loadSettings(root), {
        credentials: defaultAppCredentials,
        preferences: defaultAppPreferences,
        recovery: [],
      })
      assert.deepStrictEqual(await readdir(root), [])
    })
  })

  it("loads hand-edited current documents without changing any files", async () => {
    await withRoot(async (root) => {
      const directory = join(root, "settings")
      await mkdir(directory)
      const preferences = {
        ...defaultAppPreferences,
        activeSurface: { kind: "course", courseId: "course-1" },
      }
      const files = {
        "credentials.json": JSON.stringify(defaultAppCredentials),
        "preferences.json": JSON.stringify(preferences),
        "app-settings.json": "unrelated file",
        ".old.tmp": "unrelated temporary file",
      }
      for (const [name, content] of Object.entries(files)) {
        await writeFile(join(directory, name), content)
      }
      assert.deepStrictEqual(await loadSettings(root), {
        credentials: defaultAppCredentials,
        preferences,
        recovery: [],
      })
      assert.deepStrictEqual(
        (await readdir(directory)).sort(),
        Object.keys(files).sort(),
      )
      for (const [name, content] of Object.entries(files)) {
        assert.equal(await readFile(join(directory, name), "utf8"), content)
      }
    })
  })

  for (const fileName of ["credentials.json", "preferences.json"]) {
    for (const content of ["{", "null", "{}", '{"version":-1}']) {
      it(`rejects ${fileName} containing ${content} without recovering it`, async () => {
        await withRoot(async (root) => {
          const directory = join(root, "settings")
          await mkdir(directory)
          await writeFile(join(directory, fileName), content)
          await assert.rejects(loadSettings(root))
          assert.deepStrictEqual(await readdir(directory), [fileName])
          assert.equal(
            await readFile(join(directory, fileName), "utf8"),
            content,
          )
        })
      })
    }
  }

  it("fails on unreadable settings without replacing them", async () => {
    await withRoot(async (root) => {
      await mkdir(join(root, "settings", "credentials.json"), {
        recursive: true,
      })
      await assert.rejects(loadSettings(root))
      assert.deepStrictEqual(await readdir(join(root, "settings")), [
        "credentials.json",
      ])
    })
  })

  it("cancels before reading without creating settings", async () => {
    await withRoot(async (root) => {
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(
        loadSettings(root, controller.signal),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "type" in error &&
          error.type === "cancelled",
      )
      assert.deepStrictEqual(await readdir(root), [])
    })
  })
})
