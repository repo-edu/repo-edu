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
import {
  flushTransport,
  startMessage,
  transportHarness,
} from "./desktop-transport-harness"

async function pathExists(path: string): Promise<boolean> {
  return await stat(path)
    .then(() => true)
    .catch(() => false)
}

describe("createDesktopAppSettingsStore", () => {
  it("orders section loads after queued saves on the shared writer", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-settings-"))
    try {
      const store = createDesktopAppSettingsStore(root)
      const dark = {
        ...defaultAppPreferences,
        appearance: {
          ...defaultAppPreferences.appearance,
          theme: "dark" as const,
        },
      }
      const light = {
        ...dark,
        appearance: { ...dark.appearance, theme: "light" as const },
      }
      const first = store.preferences.save(dark)
      const second = store.preferences.save(light)
      const loaded = store.preferences.load()
      const credentials = store.credentials.save(defaultAppCredentials)
      await Promise.all([first, second, credentials])
      assert.deepEqual((await loaded).value, light)
      assert.deepEqual(
        (await store.credentials.load()).value,
        defaultAppCredentials,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  for (const section of ["credentials", "preferences"] as const) {
    it(`makes a failed ${section} writer terminal without publishing a retryable result`, async () => {
      const root = await mkdtemp(join(tmpdir(), "repo-edu-settings-"))
      try {
        await writeFile(join(root, "settings"), "not a directory")
        const handlers = createSettingsWorkflowHandlers(
          createDesktopAppSettingsStore(root),
        )
        const finished = Promise.withResolvers<void>()
        const h = transportHarness(async () => {
          try {
            if (section === "credentials")
              return await handlers["settings.saveCredentials"](
                defaultAppCredentials,
              )
            return await handlers["settings.savePreferences"](
              defaultAppPreferences,
            )
          } finally {
            finished.resolve()
          }
        })
        h.admission.dispatch({ type: "bootstrap-acknowledged" })
        h.receive(
          section === "credentials"
            ? startMessage("settings.saveCredentials", defaultAppCredentials)
            : startMessage("settings.savePreferences", defaultAppPreferences),
        )
        await finished.promise
        await flushTransport()
        assert.equal(h.admission.getSnapshot().phase, "terminal")
        assert.equal(
          h.effects.filter((effect) => effect.type === "end-host").length,
          1,
        )
        assert.equal(
          h.responses.some(
            (response) =>
              "result" in response &&
              response.result.type === "data" &&
              response.result.data.type === "failed",
          ),
          false,
        )
        h.gateway.dispose()
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  }

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
