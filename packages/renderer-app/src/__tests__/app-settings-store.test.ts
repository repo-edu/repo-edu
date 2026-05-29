import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  defaultAppSettings,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import { persistedAppSettingsKind } from "@repo-edu/domain/types"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useConnectionsStore } from "../stores/connections-store.js"

function makeSettings(
  overrides: Partial<PersistedAppSettings> = {},
): PersistedAppSettings {
  return {
    ...defaultAppSettings,
    kind: persistedAppSettingsKind,
    ...overrides,
  }
}

beforeEach(() => {
  useAppSettingsStore.getState().reset()
  useConnectionsStore.getState().resetAllStatuses()
})

describe("app settings store", () => {
  it("hydrates settings without invoking persistence", () => {
    useAppSettingsStore.getState().hydrate(
      makeSettings({
        activeSurface: { kind: "course", courseId: "course-1" },
      }),
    )

    const state = useAppSettingsStore.getState()
    assert.deepStrictEqual(state.settings.activeSurface, {
      kind: "course",
      courseId: "course-1",
    })
  })

  it("round-trips a defaultExtensions update through the store with normalization", () => {
    useAppSettingsStore
      .getState()
      .setDefaultExtensions([".TS", "Js", " py ", "ts", ""])

    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.defaultExtensions,
      ["ts", "js", "py"],
    )
  })

  it("pushes recent folders with normalization, move-to-front, and cap", () => {
    const store = useAppSettingsStore.getState()

    for (const path of [
      "/repos/one",
      "/repos/two",
      "/repos/three",
      "/repos/four",
      "/repos/five",
      "/repos/six",
      "/repos/seven",
      "/repos/eight",
      "/repos/nine",
      " /repos\\three/ ",
    ]) {
      store.pushRecentFolder(path)
    }

    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentAnalysisFolders,
      [
        "/repos/three",
        "/repos/nine",
        "/repos/eight",
        "/repos/seven",
        "/repos/six",
        "/repos/five",
        "/repos/four",
        "/repos/two",
      ],
    )
  })

  it("removes recent folders by normalized path", () => {
    const store = useAppSettingsStore.getState()
    store.pushRecentFolder("/repos/one")
    store.pushRecentFolder("/repos/two")
    store.pushRecentFolder("/repos/three")

    store.removeRecentFolder(" /repos\\two/ ")

    assert.deepStrictEqual(
      useAppSettingsStore.getState().settings.recentAnalysisFolders,
      ["/repos/three", "/repos/one"],
    )
  })

  it("caps submission recents and prunes evicted setup state", () => {
    const store = useAppSettingsStore.getState()
    for (const path of [
      "/submissions/one",
      "/submissions/two",
      "/submissions/three",
      "/submissions/four",
      "/submissions/five",
      "/submissions/six",
      "/submissions/seven",
      "/submissions/eight",
    ]) {
      store.pushRecentSubmissionFolder({ path })
    }
    store.setSubmissionSurfaceState(
      { path: "/submissions/one" },
      {
        includedFiles: ["main.ts"],
      },
    )

    store.pushRecentSubmissionFolder({ path: "/submissions/nine" })

    assert.equal(
      useAppSettingsStore.getState().settings.recentSubmissionFolders.length,
      8,
    )
    assert.equal(
      Object.hasOwn(
        useAppSettingsStore.getState().settings.submissionSurfaceStates,
        "\0/submissions/one",
      ),
      false,
    )
  })
})
