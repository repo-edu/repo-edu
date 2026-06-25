import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  validatePersistedAppCredentials,
  validatePersistedAppPreferences,
  validatePersistedAppSettings,
} from "../schemas.js"
import {
  defaultAppCredentials,
  defaultAppPreferences,
  defaultAppSettings,
} from "../settings.js"

describe("validatePersistedAppSettings", () => {
  it("accepts valid default settings", () => {
    const result = validatePersistedAppSettings(defaultAppSettings)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepStrictEqual(result.value, defaultAppSettings)
    }
  })

  it("accepts settings with populated connections", () => {
    const settings = {
      ...defaultAppSettings,
      activeSurface: { kind: "course", courseId: "abc-123" },
      lastOpenedAt: "2026-03-04T10:00:00Z",
      lmsConnections: [
        {
          id: "canvas-prod",
          name: "Canvas Prod",
          provider: "canvas",
          baseUrl: "https://canvas.example.com",
          token: "tok_canvas",
          userAgent: "Name / Organization / email@example.edu",
        },
      ],
      gitConnections: [
        {
          id: "github-1",
          provider: "github",
          baseUrl: "https://github.com",
          token: "ghp_abc",
          userAgent: "Name / Organization / email@example.edu",
        },
      ],
    }
    const result = validatePersistedAppSettings(settings)
    assert.equal(result.ok, true)
  })

  it("roundtrips the userAgent field on both persisted connection schemas", () => {
    for (const userAgent of [
      "Name / Organization / email@example.edu",
      "",
      "   ",
    ]) {
      const result = validatePersistedAppSettings({
        ...defaultAppSettings,
        lmsConnections: [
          {
            id: "canvas-1",
            name: "Canvas",
            provider: "canvas",
            baseUrl: "https://canvas.example.com",
            token: "tok",
            userAgent,
          },
        ],
        gitConnections: [
          {
            id: "gh-1",
            provider: "github",
            baseUrl: "https://github.com",
            token: "ghp",
            userAgent,
          },
        ],
      })
      assert.equal(result.ok, true, `user-agent "${userAgent}" must parse`)
      if (result.ok) {
        assert.equal(result.value.lmsConnections[0]?.userAgent, userAgent)
        assert.equal(result.value.gitConnections[0]?.userAgent, userAgent)
      }
    }
  })

  it("accepts persisted connections with omitted userAgent", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      lmsConnections: [
        {
          id: "canvas-1",
          name: "Canvas",
          provider: "canvas",
          baseUrl: "https://canvas.example.com",
          token: "tok",
        },
      ],
      gitConnections: [
        {
          id: "gh-1",
          provider: "github",
          baseUrl: "https://github.com",
          token: "ghp",
        },
      ],
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.lmsConnections[0]?.userAgent, undefined)
      assert.equal(result.value.gitConnections[0]?.userAgent, undefined)
    }
  })

  it("rejects non-object input", () => {
    const result = validatePersistedAppSettings("not an object")
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.issues.length > 0)
    }
  })

  it("rejects wrong kind", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      kind: "wrong-kind",
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      const kindIssue = result.issues.find((i) => i.path === "kind")
      assert.ok(kindIssue, "Expected an issue at path 'kind'")
    }
  })

  it("rejects invalid LMS connection provider", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      lmsConnections: [
        {
          name: "Bad",
          provider: "invalid",
          baseUrl: "https://x.com",
          token: "tok",
        },
      ],
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      const issue = result.issues.find((i) =>
        i.path.startsWith("lmsConnections"),
      )
      assert.ok(issue, "Expected an issue inside lmsConnections")
    }
  })

  it("rejects invalid Git connection provider", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      gitConnections: [
        {
          id: "bad-1",
          provider: "bitbucket",
          baseUrl: "https://example.com",
          token: "tok",
        },
      ],
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      const issue = result.issues.find((i) =>
        i.path.startsWith("gitConnections"),
      )
      assert.ok(issue, "Expected an issue inside gitConnections")
    }
  })

  it("rejects missing appearance", () => {
    const { appearance: _, ...withoutAppearance } = defaultAppSettings
    const result = validatePersistedAppSettings(withoutAppearance)
    assert.equal(result.ok, false)
  })

  it("preserves omitted last-used course backing and rejects null", () => {
    const omitted = validatePersistedAppSettings(defaultAppSettings)
    assert.equal(omitted.ok, true)
    if (omitted.ok) {
      assert.equal(omitted.value.lastUsedCourseBacking, undefined)
    }

    const noBacking = validatePersistedAppSettings({
      ...defaultAppSettings,
      lastUsedCourseBacking: null,
    })
    assert.equal(noBacking.ok, false)
  })

  it("normalizes active folder surfaces and recent analysis folders", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      activeSurface: { kind: "folder", path: " /tmp/repos\\course/ " },
      recentAnalysisFolders: [
        " /tmp/repos\\course/ ",
        "/tmp/repos/course",
        "",
        "/tmp/repos/other",
      ],
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepStrictEqual(result.value.activeSurface, {
        kind: "folder",
        path: "/tmp/repos/course",
      })
      assert.deepStrictEqual(result.value.recentAnalysisFolders, [
        "/tmp/repos/course",
        "/tmp/repos/other",
      ])
    }
  })

  it("normalizes submission surfaces and rejects relative submission paths", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      activeSurface: {
        kind: "submission",
        path: " /tmp/submissions\\ada/ ",
        courseId: "course-1",
      },
      recentSubmissionFolders: [
        { path: " /tmp/submissions\\ada/ ", courseId: "course-1" },
        { path: "/tmp/submissions/ada", courseId: "course-1" },
        { path: "/tmp/submissions/bob" },
      ],
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepStrictEqual(result.value.activeSurface, {
        kind: "submission",
        path: "/tmp/submissions/ada",
        courseId: "course-1",
      })
      assert.deepStrictEqual(result.value.recentSubmissionFolders, [
        { path: "/tmp/submissions/ada", courseId: "course-1" },
        { path: "/tmp/submissions/bob" },
      ])
    }

    const relative = validatePersistedAppSettings({
      ...defaultAppSettings,
      activeSurface: { kind: "submission", path: "submissions/ada" },
    })
    assert.equal(relative.ok, false)
  })

  it("prunes submission setup state without a matching recent", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      recentSubmissionFolders: [{ path: "/tmp/submissions/ada" }],
      submissionSurfaceStates: {
        "\0/tmp/submissions/ada": {
          includedFiles: ["main.ts"],
        },
        "\0/tmp/submissions/bob": {
          includedFiles: null,
        },
      },
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepStrictEqual(
        Object.keys(result.value.submissionSurfaceStates),
        ["\0/tmp/submissions/ada"],
      )
    }
  })

  it("rejects malformed active-surface shapes", () => {
    const courseAndFolder = validatePersistedAppSettings({
      ...defaultAppSettings,
      activeSurface: {
        kind: "course",
        courseId: "course-1",
        path: "/tmp/repos",
      },
    })
    assert.equal(courseAndFolder.ok, false)

    const emptyFolder = validatePersistedAppSettings({
      ...defaultAppSettings,
      activeSurface: { kind: "folder", path: "  " },
    })
    assert.equal(emptyFolder.ok, false)

    const relativeSubmission = validatePersistedAppSettings({
      ...defaultAppSettings,
      activeSurface: { kind: "submission", path: "relative/path" },
    })
    assert.equal(relativeSubmission.ok, false)
  })

  it("rejects legacy app settings kind", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      kind: "repo-edu.app-settings.v1",
      activeCourseId: "course-1",
    })
    assert.equal(result.ok, false)
  })

  it("rejects legacy activeCourseId fields on current settings", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      activeCourseId: "course-1",
    })
    assert.equal(result.ok, false)
  })
})

describe("validatePersistedAppSettings sections", () => {
  it("validates credentials independently from invalid preferences", () => {
    const credentials = validatePersistedAppCredentials({
      ...defaultAppCredentials,
      activeGitConnectionId: "deleted-id",
      gitConnections: [
        {
          id: "github-1",
          provider: "github",
          baseUrl: "https://github.com",
          token: "ghp_abc",
        },
      ],
    })
    assert.equal(credentials.ok, true)

    const preferences = validatePersistedAppPreferences({
      ...defaultAppPreferences,
      activeSurface: { kind: "submission", path: "relative/path" },
    })
    assert.equal(preferences.ok, false)
  })

  it("validates preferences independently from invalid credentials", () => {
    const preferences = validatePersistedAppPreferences({
      ...defaultAppPreferences,
      activeSurface: { kind: "folder", path: " /tmp/repos\\course/ " },
    })
    assert.equal(preferences.ok, true)
    if (preferences.ok) {
      assert.deepStrictEqual(preferences.value.activeSurface, {
        kind: "folder",
        path: "/tmp/repos/course",
      })
    }

    const credentials = validatePersistedAppCredentials({
      ...defaultAppCredentials,
      gitConnections: [
        {
          id: "bad-1",
          provider: "bitbucket",
          baseUrl: "https://example.com",
          token: "tok",
        },
      ],
    })
    assert.equal(credentials.ok, false)
  })

  it("rejects stale nested credential fields", () => {
    const credentials = validatePersistedAppCredentials({
      ...defaultAppCredentials,
      lmsConnections: [
        {
          id: "canvas-prod",
          name: "Canvas Prod",
          provider: "canvas",
          baseUrl: "https://canvas.example.com",
          token: "tok_canvas",
          obsoleteField: true,
        },
      ],
    })

    assert.equal(credentials.ok, false)
  })

  it("rejects stale nested preference fields", () => {
    const appearance = validatePersistedAppPreferences({
      ...defaultAppPreferences,
      appearance: {
        ...defaultAppPreferences.appearance,
        accentColor: "purple",
      },
    })
    assert.equal(appearance.ok, false)

    const analysisInputs = validatePersistedAppPreferences({
      ...defaultAppPreferences,
      folderViewAnalysisInputs: {
        unsupportedAnalysisField: true,
      },
    })
    assert.equal(analysisInputs.ok, false)
  })
})
