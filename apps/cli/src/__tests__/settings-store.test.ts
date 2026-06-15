import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { describe, it } from "node:test"
import { createSettingsWorkflowHandlers } from "@repo-edu/application"
import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import { createCliAppSettingsStore } from "../state-store.js"

async function pathExists(path: string): Promise<boolean> {
  return await stat(path)
    .then(() => true)
    .catch(() => false)
}

describe("createCliAppSettingsStore", () => {
  it("loads preferences when credentials are unparseable and backs credentials aside", async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), "repo-edu-cli-"))
    try {
      const settingsDirectory = join(storageRoot, "settings")
      const store = createCliAppSettingsStore(storageRoot)
      const handlers = createSettingsWorkflowHandlers(store)
      const preferences = {
        ...defaultAppPreferences,
        activeSurface: { kind: "course" as const, courseId: "course-1" },
      }

      await store.preferences.save(preferences)
      await mkdir(settingsDirectory, { recursive: true })
      await writeFile(join(settingsDirectory, "credentials.json"), "{", "utf8")

      const loaded = await handlers["settings.loadApp"](undefined)

      assert.deepStrictEqual(loaded.credentials, defaultAppCredentials)
      assert.deepStrictEqual(loaded.preferences, preferences)
      assert.equal(loaded.recovery.length, 1)
      assert.equal(loaded.recovery[0]?.unit, "credentials")
      assert.equal(loaded.recovery[0]?.reason, "unparseable")
      assert.match(
        basename(loaded.recovery[0]?.backupPath ?? ""),
        /^credentials\.unparseable-\d+\.json$/,
      )
      assert.equal(
        await pathExists(join(settingsDirectory, "credentials.json")),
        false,
      )
    } finally {
      await rm(storageRoot, { recursive: true, force: true })
    }
  })
})
