import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { describe, it } from "node:test"
import { createSettingsWorkflowHandlers } from "@repo-edu/application"
import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import { createDesktopAppSettingsStore } from "../settings-store"

async function pathExists(path: string): Promise<boolean> {
  return await stat(path)
    .then(() => true)
    .catch(() => false)
}

describe("createDesktopAppSettingsStore", () => {
  it("loads credentials when preferences are invalid and backs preferences aside", async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), "repo-edu-desktop-"))
    try {
      const settingsDirectory = join(storageRoot, "settings")
      const store = createDesktopAppSettingsStore(storageRoot)
      const handlers = createSettingsWorkflowHandlers(store)
      const credentials = {
        ...defaultAppCredentials,
        activeGitConnectionId: "github-1",
        gitConnections: [
          {
            id: "github-1",
            provider: "github" as const,
            baseUrl: "https://github.com",
            token: "ghp_test",
          },
        ],
      }
      const invalidPreferences = {
        ...defaultAppPreferences,
        activeSurface: { kind: "submission", path: "relative/path" },
      }

      await store.credentials.save(credentials)
      await mkdir(settingsDirectory, { recursive: true })
      await writeFile(
        join(settingsDirectory, "preferences.json"),
        JSON.stringify(invalidPreferences),
        "utf8",
      )

      const loaded = await handlers["settings.loadApp"](undefined)

      assert.deepStrictEqual(loaded.credentials, credentials)
      assert.deepStrictEqual(loaded.preferences, defaultAppPreferences)
      assert.equal(loaded.recovery.length, 1)
      assert.equal(loaded.recovery[0]?.unit, "preferences")
      assert.equal(loaded.recovery[0]?.reason, "invalid")
      assert.match(
        basename(loaded.recovery[0]?.backupPath ?? ""),
        /^preferences\.invalid-\d+\.json$/,
      )
      assert.equal(
        await pathExists(join(settingsDirectory, "preferences.json")),
        false,
      )
      assert.equal(
        await readFile(loaded.recovery[0]?.backupPath ?? "", "utf8"),
        JSON.stringify(invalidPreferences),
      )
    } finally {
      await rm(storageRoot, { recursive: true, force: true })
    }
  })

  it("backs aside unsupported app settings during recovery-aware load", async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), "repo-edu-desktop-"))
    try {
      const settingsDirectory = join(storageRoot, "settings")
      const store = createDesktopAppSettingsStore(storageRoot)
      const handlers = createSettingsWorkflowHandlers(store)
      await mkdir(settingsDirectory, { recursive: true })
      await writeFile(
        join(settingsDirectory, "app-settings.json"),
        '{"kind":"repo-edu.app-settings.v1"}',
        "utf8",
      )

      const loaded = await handlers["settings.loadApp"](undefined)

      assert.deepStrictEqual(loaded.credentials, defaultAppCredentials)
      assert.deepStrictEqual(loaded.preferences, defaultAppPreferences)
      assert.equal(loaded.recovery.length, 1)
      assert.equal(loaded.recovery[0]?.unit, "unsupported-composite")
      assert.equal(loaded.recovery[0]?.reason, "unsupported")
      assert.match(
        basename(loaded.recovery[0]?.backupPath ?? ""),
        /^app-settings\.unsupported-\d+\.json$/,
      )
      assert.equal(
        await pathExists(join(settingsDirectory, "app-settings.json")),
        false,
      )
    } finally {
      await rm(storageRoot, { recursive: true, force: true })
    }
  })

  it("preserves cancellation from in-flight credential saves", async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), "repo-edu-desktop-"))
    try {
      const handlers = createSettingsWorkflowHandlers(
        createDesktopAppSettingsStore(storageRoot),
      )
      const controller = new AbortController()
      const save = handlers["settings.saveCredentials"](defaultAppCredentials, {
        signal: controller.signal,
      })
      controller.abort()

      await assert.rejects(
        save,
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "type" in error &&
          error.type === "cancelled",
      )
    } finally {
      await rm(storageRoot, { recursive: true, force: true })
    }
  })
})
