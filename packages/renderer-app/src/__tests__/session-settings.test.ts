import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  defaultAppCredentials,
  defaultAppPreferences,
} from "@repo-edu/domain/settings"
import {
  credentialRemovalFromEvent,
  reduceCredentials,
  reducePreferences,
} from "../session/session-settings.js"

describe("session settings reducers", () => {
  it("normalizes analysis inputs, extensions, and recent folders", () => {
    let preferences = reducePreferences(defaultAppPreferences, {
      type: "set-folder-analysis-inputs",
      patch: { includeFiles: ["src/**"], since: undefined },
    })
    preferences = reducePreferences(preferences, {
      type: "set-default-extensions",
      extensions: [".TS", " ts ", "py", ""],
    })
    preferences = reducePreferences(preferences, {
      type: "push-recent-folder",
      path: "/repo/a/",
    })
    assert.deepEqual(preferences.folderViewAnalysisInputs, {
      includeFiles: ["src/**"],
    })
    assert.deepEqual(preferences.defaultExtensions, ["ts", "py"])
    assert.deepEqual(preferences.recentAnalysisFolders, ["/repo/a"])
  })

  it("keeps submission recents and selection state in one reduction boundary", () => {
    const recent = { path: "/submissions/a", courseId: "course-a" }
    let preferences = reducePreferences(defaultAppPreferences, {
      type: "push-recent-submission",
      recent,
    })
    preferences = reducePreferences(preferences, {
      type: "set-submission-state",
      recent,
      state: { includedFiles: ["src/a.ts"] },
    })
    assert.deepEqual(preferences.recentSubmissionFolders, [recent])
    assert.deepEqual(Object.values(preferences.submissionSurfaceStates), [
      { includedFiles: ["src/a.ts"] },
    ])

    preferences = reducePreferences(preferences, {
      type: "prune-submissions-for-courses",
      courses: [],
    })
    assert.deepEqual(preferences.recentSubmissionFolders, [])
    assert.deepEqual(preferences.submissionSurfaceStates, {})
  })

  it("reduces the complete scalar preference vocabulary", () => {
    let preferences = defaultAppPreferences
    const events = [
      { type: "set-theme", theme: "dark" },
      { type: "set-date-format", dateFormat: "MDY" },
      { type: "set-time-format", timeFormat: "12h" },
      { type: "set-syntax-theme", syntaxTheme: "github" },
      { type: "set-examination-model", provider: "claude", code: "opus" },
      { type: "set-roster-column-visibility", visibility: { email: false } },
      { type: "set-roster-column-sizing", sizing: { email: 120 } },
      { type: "set-groups-sidebar-size", size: 280 },
      { type: "set-analysis-sidebar-size", size: 290 },
      { type: "set-analysis-detail-list-size", size: 300 },
      { type: "set-examination-submission-sidebar-size", size: 310 },
      {
        type: "set-analysis-concurrency",
        concurrency: { repoParallelism: 2, filesPerRepo: 5 },
      },
    ] as const
    for (const event of events)
      preferences = reducePreferences(preferences, event)
    assert.equal(preferences.appearance.theme, "dark")
    assert.equal(preferences.appearance.dateFormat, "MDY")
    assert.equal(preferences.appearance.timeFormat, "12h")
    assert.equal(preferences.examinationModelsByProvider.claude, "opus")
    assert.equal(preferences.groupsSidebarSize, 280)
    assert.deepEqual(preferences.analysisConcurrency, {
      repoParallelism: 2,
      filesPerRepo: 5,
    })
  })

  it("derives credential cleanup identity and clears matching active ids", () => {
    const git = {
      id: "git-a",
      provider: "github" as const,
      baseUrl: "https://api.github.com",
      token: "token",
    }
    let credentials = reduceCredentials(defaultAppCredentials, {
      type: "add-git-connection",
      connection: git,
    })
    credentials = reduceCredentials(credentials, {
      type: "set-active-git-connection",
      id: git.id,
    })
    const removal = { type: "remove-git-connection", id: git.id } as const
    credentials = reduceCredentials(credentials, removal)
    assert.deepEqual(credentialRemovalFromEvent(removal), {
      kind: "git",
      id: git.id,
    })
    assert.equal(credentials.activeGitConnectionId, null)
    assert.deepEqual(credentials.gitConnections, [])
    assert.equal(
      credentialRemovalFromEvent({
        type: "set-active-git-connection",
        id: git.id,
      }),
      null,
    )
  })
})
