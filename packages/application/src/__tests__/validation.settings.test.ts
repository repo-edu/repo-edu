import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createInMemoryAppSettingsStore } from "../core.js"
import { createSettingsWorkflowHandlers } from "../settings-workflows.js"
import { getSettingsScenario } from "./helpers/fixture-scenarios.js"
import { makeInvalidSettingsWrongKind } from "./helpers/test-builders.js"

describe("application settings workflow helpers", () => {
  it("returns default settings when store is empty and saves validated settings", async () => {
    const handlers = createSettingsWorkflowHandlers(
      createInMemoryAppSettingsStore(),
    )

    const loadedDefault = await handlers["settings.loadApp"](undefined)
    assert.equal(loadedDefault.kind, "repo-edu.app-settings.v1")

    const saved = await handlers["settings.saveApp"]({
      ...getSettingsScenario({ tier: "small", preset: "shared-teams" }),
      activeCourseId: "course-1",
    })
    assert.equal(saved.activeCourseId, "course-1")

    const reloaded = await handlers["settings.loadApp"](undefined)
    assert.equal(reloaded.activeCourseId, "course-1")
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
})
