import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createInMemoryAppSettingsStore,
  createPersistenceWriteError,
} from "../core.js"
import { createSettingsWorkflowHandlers } from "../settings-workflows.js"
import { getSettingsScenario } from "./helpers/fixture-scenarios.js"
import { makeInvalidSettingsWrongKind } from "./helpers/test-builders.js"

describe("application settings workflow helpers", () => {
  it("returns default settings when store is empty and saves validated settings", async () => {
    const handlers = createSettingsWorkflowHandlers(
      createInMemoryAppSettingsStore(),
    )

    const loadedDefault = await handlers["settings.loadApp"](undefined)
    assert.equal(loadedDefault.kind, "repo-edu.app-settings.v2")

    await handlers["settings.saveApp"]({
      ...getSettingsScenario({ tier: "small", preset: "shared-teams" }),
      activeSurface: { kind: "course", courseId: "course-1" },
    })

    const reloaded = await handlers["settings.loadApp"](undefined)
    assert.deepStrictEqual(reloaded.activeSurface, {
      kind: "course",
      courseId: "course-1",
    })
  })

  it("returns a validation AppError when settings.saveApp receives invalid data", async () => {
    const handlers = createSettingsWorkflowHandlers(
      createInMemoryAppSettingsStore(),
    )

    await assert.rejects(
      handlers["settings.saveApp"](
        makeInvalidSettingsWrongKind(
          getSettingsScenario({ tier: "small", preset: "shared-teams" }),
        ),
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("normalizes retryable write failures from settings.saveApp", async () => {
    const handlers = createSettingsWorkflowHandlers({
      loadSettings: () => null,
      saveSettings: () => {
        throw createPersistenceWriteError("locked", "Settings file is locked.")
      },
    })

    await assert.rejects(
      handlers["settings.saveApp"](
        getSettingsScenario({ tier: "small", preset: "shared-teams" }),
      ),
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
