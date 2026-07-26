import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { submissionSurfaceStateKey } from "../active-surface.js"
import {
  composeAppSettings,
  defaultAppCredentials,
  defaultAppPreferences,
  defaultAppSettings,
  normalizeRecentAnalysisFolders,
  normalizeRecentSubmissionFolders,
  persistedAppCredentialsKind,
  persistedAppPreferencesKind,
  persistedAppSettingsKind,
  pruneSubmissionStateForRecents,
  splitAppSettings,
} from "../settings.js"

describe("settings defaults", () => {
  it("builds credentials and preferences with their owned kinds", () => {
    assert.equal(defaultAppCredentials.kind, persistedAppCredentialsKind)
    assert.equal(defaultAppPreferences.kind, persistedAppPreferencesKind)
    assert.equal(defaultAppSettings.kind, persistedAppSettingsKind)
    assert.deepEqual(defaultAppCredentials, {
      kind: persistedAppCredentialsKind,
      lmsConnections: [],
      gitConnections: [],
      activeGitConnectionId: null,
      llmConnections: [],
      activeLlmConnectionId: null,
    })
    assert.deepEqual(defaultAppPreferences.examinationModelsByProvider, {})
  })
})

describe("settings section composition", () => {
  it("round-trips the default sections", () => {
    assert.deepEqual(
      composeAppSettings(defaultAppCredentials, defaultAppPreferences),
      defaultAppSettings,
    )
    assert.deepEqual(splitAppSettings(defaultAppSettings), {
      credentials: defaultAppCredentials,
      preferences: defaultAppPreferences,
    })
  })
})

describe("recent collection policy", () => {
  it("normalizes, de-duplicates, and limits analysis folders", () => {
    const inputs = [
      " /one/ ",
      "/one",
      "/two",
      "/three",
      "/four",
      "/five",
      "/six",
      "/seven",
      "/eight",
      "/nine",
    ]
    assert.deepEqual(normalizeRecentAnalysisFolders(inputs), [
      "/one",
      "/two",
      "/three",
      "/four",
      "/five",
      "/six",
      "/seven",
      "/eight",
    ])
  })

  it("de-duplicates submission folders by course and normalized path", () => {
    assert.deepEqual(
      normalizeRecentSubmissionFolders([
        { path: "/tmp/submission/", courseId: "course-1" },
        { path: "/tmp/submission", courseId: "course-1" },
        { path: "/tmp/submission", courseId: "course-2" },
        { path: "relative" },
      ]),
      [
        { path: "/tmp/submission", courseId: "course-1" },
        { path: "/tmp/submission", courseId: "course-2" },
      ],
    )
  })

  it("prunes saved submission state outside the recent collection", () => {
    const kept = { path: "/tmp/kept", courseId: "course-1" }
    const removed = { path: "/tmp/removed", courseId: "course-1" }
    const keptKey = submissionSurfaceStateKey(kept)
    const removedKey = submissionSurfaceStateKey(removed)
    assert.notEqual(keptKey, null)
    assert.notEqual(removedKey, null)
    assert.deepEqual(
      pruneSubmissionStateForRecents({
        recentSubmissionFolders: [kept],
        submissionSurfaceStates: {
          [keptKey as string]: { includedFiles: ["src/main.ts"] },
          [removedKey as string]: { includedFiles: null },
        },
      }),
      {
        recentSubmissionFolders: [kept],
        submissionSurfaceStates: {
          [keptKey as string]: { includedFiles: ["src/main.ts"] },
        },
      },
    )
  })
})
