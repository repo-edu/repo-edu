import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_USER_AGENT,
  normalizeUserAgent,
  resolveUserAgent,
} from "../connection.js"
import {
  gitUsernameImportRowSchema,
  groupEditImportRowSchema,
  studentImportRowSchema,
  validatePersistedAppSettings,
  validatePersistedCourse,
} from "../schemas.js"
import { defaultAppSettings } from "../settings.js"
import { createBlankCourse } from "../types.js"

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

describe("validatePersistedCourse", () => {
  const validProfile = {
    kind: "repo-edu.course.v1",
    backing: "lms",
    searchFolder: null,
    analysisInputs: {},
    revision: 0,
    id: "prof-1",
    displayName: "Test Course",
    lmsConnectionId: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    updatedAt: "2026-03-04T10:00:00Z",
  }

  it("accepts a valid empty course", () => {
    const result = validatePersistedCourse(validProfile)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.id, "prof-1")
      assert.equal(result.value.displayName, "Test Course")
    }
  })

  it("rejects courses without an explicit backing", () => {
    const { backing: _, ...withoutCourseBacking } = validProfile
    void _
    const result = validatePersistedCourse(withoutCourseBacking)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.issues.some((issue) => issue.path === "backing"))
    }
  })

  it("normalizes blank course fields that are incompatible with backing", () => {
    const repositoryTemplate = {
      kind: "remote" as const,
      owner: "course-org",
      name: "starter",
      visibility: "private" as const,
    }
    const repobeeCourse = createBlankCourse(
      "repobee-course",
      "2026-03-04T10:00:00Z",
      {
        backing: "repobee",
        displayName: "RepoBee Course",
        lmsConnectionId: "Canvas",
        lmsCourseId: "canvas-course-1",
        organization: "course-org",
        repositoryTemplate,
        repositoryCloneTargetDirectory: "/tmp/repos",
        repositoryCloneDirectoryLayout: "by-team",
      },
    )
    assert.equal(repobeeCourse.lmsConnectionId, null)
    assert.equal(repobeeCourse.lmsCourseId, null)
    assert.equal(repobeeCourse.organization, "course-org")
    assert.deepEqual(repobeeCourse.repositoryTemplate, repositoryTemplate)
    assert.equal(validatePersistedCourse(repobeeCourse).ok, true)
  })

  it("rejects null course backing", () => {
    const result = validatePersistedCourse({
      ...validProfile,
      backing: null,
    })

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.issues.some((issue) => issue.path === "backing"))
    }
  })

  it("rejects non-LMS courses with LMS linkage", () => {
    const result = validatePersistedCourse({
      ...validProfile,
      backing: "repobee",
      lmsConnectionId: "Canvas",
      lmsCourseId: "canvas-course-1",
      roster: {
        ...validProfile.roster,
        connection: {
          kind: "canvas",
          courseId: "canvas-course-1",
          lastUpdated: "2026-03-04T10:00:00Z",
        },
        students: [
          {
            id: "m_0001",
            name: "Alice",
            email: "alice@example.com",
            studentNumber: "12345",
            gitUsername: "alice",
            gitUsernameStatus: "valid",
            status: "active",
            lmsStatus: "active",
            lmsUserId: "canvas-user-1",
            enrollmentType: "student",
            enrollmentDisplay: null,
            department: null,
            institution: null,
            source: "canvas",
          },
        ],
        groups: [
          {
            id: "g_0001",
            name: "LMS Group",
            memberIds: ["m_0001"],
            origin: "lms",
            lmsGroupId: "canvas-group-1",
          },
        ],
        groupSets: [
          {
            id: "gs_0001",
            name: "LMS Groups",
            nameMode: "named",
            groupIds: ["g_0001"],
            connection: {
              kind: "canvas",
              courseId: "canvas-course-1",
              groupSetId: "canvas-group-set-1",
              lastUpdated: "2026-03-04T10:00:00Z",
            },
            repoNameTemplate: null,
            columnVisibility: {},
            columnSizing: {},
          },
        ],
      },
    })

    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.issues.some((issue) => issue.path === "lmsConnectionId"))
      assert.ok(result.issues.some((issue) => issue.path === "lmsCourseId"))
      assert.ok(
        result.issues.some((issue) => issue.path === "roster.connection"),
      )
      assert.ok(
        result.issues.some(
          (issue) => issue.path === "roster.students.0.lmsStatus",
        ),
      )
      assert.ok(
        result.issues.some(
          (issue) => issue.path === "roster.students.0.lmsUserId",
        ),
      )
      assert.ok(
        result.issues.some(
          (issue) => issue.path === "roster.students.0.source",
        ),
      )
      assert.ok(
        result.issues.some((issue) => issue.path === "roster.groups.0.origin"),
      )
      assert.ok(
        result.issues.some(
          (issue) => issue.path === "roster.groups.0.lmsGroupId",
        ),
      )
      assert.ok(
        result.issues.some(
          (issue) => issue.path === "roster.groupSets.0.connection",
        ),
      )
    }
  })

  it("accepts a course with populated roster and groups", () => {
    const course = {
      ...validProfile,
      roster: {
        connection: {
          kind: "import",
          sourceFilename: "students.csv",
          lastUpdated: "2026-03-04T10:00:00Z",
        },
        students: [
          {
            id: "m_0001",
            name: "Alice",
            email: "alice@example.com",
            studentNumber: "12345",
            gitUsername: "alice",
            gitUsernameStatus: "valid",
            status: "active",
            lmsStatus: null,
            lmsUserId: "canvas-1",
            enrollmentType: "student",
            enrollmentDisplay: null,
            department: "CS",
            institution: "Example U",
            source: "lms",
          },
        ],
        staff: [
          {
            id: "m_0002",
            name: "Prof. Smith",
            email: "prof@example.com",
            studentNumber: null,
            gitUsername: null,
            gitUsernameStatus: "unknown",
            status: "active",
            lmsStatus: null,
            lmsUserId: "canvas-2",
            enrollmentType: "teacher",
            enrollmentDisplay: "Teacher",
            department: null,
            institution: null,
            source: "lms",
          },
        ],
        groups: [
          {
            id: "g_0001",
            name: "Alpha",
            memberIds: ["m_0001"],
            origin: "lms",
            lmsGroupId: "canvas-group-1",
          },
        ],
        groupSets: [
          {
            id: "gs_0001",
            name: "Teams",
            groupIds: ["g_0001"],
            connection: {
              kind: "canvas",
              courseId: "course-1",
              groupSetId: "canvas-set-1",
              lastUpdated: "2026-03-04T10:00:00Z",
            },
            nameMode: "named",
            repoNameTemplate: null,
            columnVisibility: {},
            columnSizing: {},
          },
        ],
        assignments: [{ id: "a1", name: "HW1", groupSetId: "gs_0001" }],
      },
      repositoryTemplate: {
        kind: "remote",
        owner: "org",
        name: "template",
        visibility: "private",
      },
    }
    const result = validatePersistedCourse(course)
    assert.equal(result.ok, true)
  })

  it("accepts named group set with groupIds", () => {
    const course = {
      ...validProfile,
      roster: {
        ...validProfile.roster,
        groupSets: [
          {
            id: "gs_0001",
            name: "Teams",
            nameMode: "named",
            groupIds: [],
            connection: null,
            repoNameTemplate: null,
            columnVisibility: {},
            columnSizing: {},
          },
        ],
      },
    }
    const result = validatePersistedCourse(course)
    assert.equal(result.ok, true)
  })

  it("rejects non-object input", () => {
    const result = validatePersistedCourse(42)
    assert.equal(result.ok, false)
  })

  it("rejects wrong kind", () => {
    const result = validatePersistedCourse({ ...validProfile, kind: "wrong" })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === "kind"))
    }
  })

  it("rejects invalid member in roster", () => {
    const result = validatePersistedCourse({
      ...validProfile,
      roster: {
        ...validProfile.roster,
        students: [
          {
            id: "s1",
            name: 123,
            email: "alice@example.com",
            studentNumber: null,
            gitUsername: null,
            gitUsernameStatus: "unknown",
            status: "active",
            lmsStatus: null,
            lmsUserId: null,
            enrollmentType: "student",
            enrollmentDisplay: null,
            department: null,
            institution: null,
            source: "local",
          },
        ],
      },
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path.startsWith("roster")))
    }
  })

  it("rejects invalid nameMode", () => {
    const result = validatePersistedCourse({
      ...validProfile,
      roster: {
        ...validProfile.roster,
        groupSets: [
          {
            id: "gs_0001",
            name: "X",
            nameMode: "invalid",
            groupIds: [],
            connection: null,
            repoNameTemplate: null,
          },
        ],
      },
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(
        result.issues.some((i) => i.path.startsWith("roster.groupSets")),
      )
    }
  })

  it("rejects invalid repository template visibility", () => {
    const result = validatePersistedCourse({
      ...validProfile,
      repositoryTemplate: {
        kind: "remote",
        owner: "org",
        name: "tmpl",
        visibility: "secret",
      },
    })
    assert.equal(result.ok, false)
  })

  it("accepts a group set without repoNameTemplate (defaults to null)", () => {
    const course = {
      ...validProfile,
      roster: {
        ...validProfile.roster,
        groupSets: [
          {
            id: "gs_0001",
            name: "Teams",
            groupIds: [],
            connection: null,
            nameMode: "named",
            columnVisibility: {},
            columnSizing: {},
          },
        ],
      },
    }
    const result = validatePersistedCourse(course)
    assert.equal(result.ok, true)
    if (result.ok) {
      const groupSet = result.value.roster.groupSets[0]
      assert.equal(groupSet?.repoNameTemplate, null)
    }
  })

  it("accepts a group set with a custom repoNameTemplate", () => {
    const course = {
      ...validProfile,
      roster: {
        ...validProfile.roster,
        groupSets: [
          {
            id: "gs_0001",
            name: "Teams",
            groupIds: [],
            connection: null,
            nameMode: "named",
            repoNameTemplate: "{assignment}-{group}-{surnames}",
            columnVisibility: {},
            columnSizing: {},
          },
        ],
      },
    }
    const result = validatePersistedCourse(course)
    assert.equal(result.ok, true)
    if (result.ok) {
      const groupSet = result.value.roster.groupSets[0]
      assert.equal(
        groupSet?.repoNameTemplate,
        "{assignment}-{group}-{surnames}",
      )
    }
  })

  it("rejects unnamed group sets with {group} in repoNameTemplate", () => {
    const course = {
      ...validProfile,
      roster: {
        ...validProfile.roster,
        groupSets: [
          {
            id: "gs_0001",
            name: "RepoBee Teams",
            nameMode: "unnamed",
            teams: [{ id: "ut_0001", gitUsernames: ["alice"] }],
            connection: null,
            repoNameTemplate: "{assignment}-{group}",
            columnVisibility: {},
            columnSizing: {},
          },
        ],
      },
    }
    const result = validatePersistedCourse(course)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(
        result.issues.some((issue) => issue.path.includes("repoNameTemplate")),
      )
    }
  })
})

describe("normalizeUserAgent", () => {
  it("returns trimmed value when non-empty", () => {
    assert.equal(normalizeUserAgent("  Name  "), "Name")
  })

  it("returns undefined for empty and whitespace-only values", () => {
    assert.equal(normalizeUserAgent(""), undefined)
    assert.equal(normalizeUserAgent("   "), undefined)
  })

  it("returns undefined for null and undefined inputs", () => {
    assert.equal(normalizeUserAgent(null), undefined)
    assert.equal(normalizeUserAgent(undefined), undefined)
  })
})

describe("resolveUserAgent", () => {
  it("returns the normalized user-agent when provided", () => {
    assert.equal(
      resolveUserAgent({
        baseUrl: "",
        token: "",
        userAgent: "  Custom Agent  ",
      }),
      "Custom Agent",
    )
  })

  it("falls back to the default when user-agent is empty or missing", () => {
    assert.equal(
      resolveUserAgent({ baseUrl: "", token: "" }),
      DEFAULT_USER_AGENT,
    )
    assert.equal(
      resolveUserAgent({ baseUrl: "", token: "", userAgent: "   " }),
      DEFAULT_USER_AGENT,
    )
  })
})

describe("studentImportRowSchema", () => {
  it("accepts a row with all fields", () => {
    const result = studentImportRowSchema.safeParse({
      name: "Alice",
      id: "s1",
      email: "alice@example.com",
      student_number: "12345",
      git_username: "alice",
      status: "active",
    })
    assert.equal(result.success, true)
  })

  it("accepts a row with only name", () => {
    const result = studentImportRowSchema.safeParse({ name: "Bob" })
    assert.equal(result.success, true)
  })

  it("rejects a row without name", () => {
    const result = studentImportRowSchema.safeParse({
      email: "bob@example.com",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty name", () => {
    const result = studentImportRowSchema.safeParse({ name: "" })
    assert.equal(result.success, false)
  })
})

describe("gitUsernameImportRowSchema", () => {
  it("accepts valid email + git_username", () => {
    const result = gitUsernameImportRowSchema.safeParse({
      email: "alice@example.com",
      git_username: "alice",
    })
    assert.equal(result.success, true)
  })

  it("rejects missing git_username", () => {
    const result = gitUsernameImportRowSchema.safeParse({
      email: "alice@example.com",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty email", () => {
    const result = gitUsernameImportRowSchema.safeParse({
      email: "",
      git_username: "alice",
    })
    assert.equal(result.success, false)
  })
})

describe("groupEditImportRowSchema", () => {
  it("accepts row with student_id", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_id: "s1",
    })
    assert.equal(result.success, true)
  })

  it("accepts row with student_email", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_email: "alice@example.com",
    })
    assert.equal(result.success, true)
  })

  it("accepts row with both identifiers", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_id: "s1",
      student_email: "alice@example.com",
      group_id: "g1",
    })
    assert.equal(result.success, true)
  })

  it("rejects row with neither identifier", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty group_name", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "",
      student_id: "s1",
    })
    assert.equal(result.success, false)
  })

  it("rejects empty student_id when no email", () => {
    const result = groupEditImportRowSchema.safeParse({
      group_name: "Alpha",
      student_id: "",
    })
    assert.equal(result.success, false)
  })
})
