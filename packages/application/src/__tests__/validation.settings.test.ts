import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { splitAppSettings } from "@repo-edu/domain/settings"
import {
  createInMemoryAppSettingsStore,
  createPersistenceWriteError,
} from "../core.js"
import { createSettingsWorkflowHandlers } from "../settings-workflows.js"
import { getSettingsScenario } from "./helpers/fixture-scenarios.js"

describe("application settings workflow helpers", () => {
  it("substitutes section defaults and preserves recovery entries", async () => {
    const handlers = createSettingsWorkflowHandlers({
      credentials: {
        load: () => ({
          value: null,
          recovery: [
            {
              unit: "credentials",
              reason: "invalid",
              backupPath: "/tmp/credentials.invalid-1.json",
            },
          ],
        }),
        save: () => undefined,
      },
      preferences: {
        load: () => ({
          value: null,
          recovery: [
            {
              unit: "preferences",
              reason: "unparseable",
              backupPath: "/tmp/preferences.unparseable-1.json",
            },
          ],
        }),
        save: () => undefined,
      },
      recoverUnsupportedComposite: () => [
        {
          unit: "unsupported-composite",
          reason: "unsupported",
          backupPath: "/tmp/app-settings.unsupported-1.json",
        },
      ],
    })

    const loaded = await handlers["settings.loadApp"](undefined)

    assert.equal(loaded.credentials.kind, "repo-edu.app-credentials.v1")
    assert.equal(loaded.preferences.kind, "repo-edu.app-preferences.v1")
    assert.deepStrictEqual(loaded.recovery, [
      {
        unit: "unsupported-composite",
        reason: "unsupported",
        backupPath: "/tmp/app-settings.unsupported-1.json",
      },
      {
        unit: "credentials",
        reason: "invalid",
        backupPath: "/tmp/credentials.invalid-1.json",
      },
      {
        unit: "preferences",
        reason: "unparseable",
        backupPath: "/tmp/preferences.unparseable-1.json",
      },
    ])
  })

  it("preserves completed recovery paths when a later load fails", async () => {
    const handlers = createSettingsWorkflowHandlers({
      credentials: {
        load: () => ({
          value: null,
          recovery: [
            {
              unit: "credentials",
              reason: "invalid",
              backupPath: "/tmp/credentials.invalid-1.json",
            },
          ],
        }),
        save: () => undefined,
      },
      preferences: {
        load: () => {
          throw new Error("Preferences disk is unavailable.")
        },
        save: () => undefined,
      },
      recoverUnsupportedComposite: () => [
        {
          unit: "unsupported-composite",
          reason: "unsupported",
          backupPath: "/tmp/app-settings.unsupported-1.json",
        },
      ],
    })

    await assert.rejects(
      handlers["settings.loadApp"](undefined),
      /Settings recovery already completed: unsupported-composite unsupported: \/tmp\/app-settings\.unsupported-1\.json; credentials invalid: \/tmp\/credentials\.invalid-1\.json\./,
    )
  })

  it("returns default sections when store is empty and saves validated preferences", async () => {
    const handlers = createSettingsWorkflowHandlers(
      createInMemoryAppSettingsStore(),
    )

    const loadedDefault = await handlers["settings.loadApp"](undefined)
    assert.equal(loadedDefault.credentials.kind, "repo-edu.app-credentials.v1")
    assert.equal(loadedDefault.preferences.kind, "repo-edu.app-preferences.v1")
    assert.deepEqual(loadedDefault.recovery, [])

    const sections = splitAppSettings(
      getSettingsScenario({ tier: "small", preset: "shared-teams" }),
    )
    await handlers["settings.savePreferences"]({
      ...sections.preferences,
      activeSurface: { kind: "course", courseId: "course-1" },
    })

    const reloaded = await handlers["settings.loadApp"](undefined)
    assert.deepStrictEqual(reloaded.preferences.activeSurface, {
      kind: "course",
      courseId: "course-1",
    })
    assert.deepStrictEqual(reloaded.credentials.lmsConnections, [])
  })

  it("returns a validation AppError when a section save receives invalid data", async () => {
    const handlers = createSettingsWorkflowHandlers(
      createInMemoryAppSettingsStore(),
    )
    const sections = splitAppSettings(
      getSettingsScenario({ tier: "small", preset: "shared-teams" }),
    )

    await assert.rejects(
      handlers["settings.savePreferences"]({
        ...sections.preferences,
        kind: "wrong-kind" as typeof sections.preferences.kind,
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("normalizes retryable write failures from settings.savePreferences", async () => {
    const handlers = createSettingsWorkflowHandlers({
      credentials: {
        load: () => ({ value: null, recovery: [] }),
        save: () => undefined,
      },
      preferences: {
        load: () => ({ value: null, recovery: [] }),
        save: () => {
          throw createPersistenceWriteError(
            "locked",
            "Preferences file is locked.",
          )
        },
      },
    })
    const sections = splitAppSettings(
      getSettingsScenario({ tier: "small", preset: "shared-teams" }),
    )

    await assert.rejects(
      handlers["settings.savePreferences"](sections.preferences),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "persistence" &&
        "retryable" in error &&
        error.retryable === true,
    )
  })
})
