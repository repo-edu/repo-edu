import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  defaultAppSettings,
  gitUsernameImportRowSchema,
  groupEditImportRowSchema,
  studentImportRowSchema,
  validatePersistedAppSettings,
  validatePersistedProfile,
} from "../index.js"

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
      activeProfileId: "abc-123",
      lastOpenedAt: "2026-03-04T10:00:00Z",
      lmsConnections: [
        {
          name: "Canvas Prod",
          provider: "canvas",
          baseUrl: "https://canvas.example.com",
          token: "tok_canvas",
          userAgent: "Name / Organization / email@example.edu",
        },
      ],
      gitConnections: [
        {
          name: "GitHub",
          provider: "github",
          baseUrl: null,
          token: "ghp_abc",
          organization: "my-org",
        },
      ],
    }
    const result = validatePersistedAppSettings(settings)
    assert.equal(result.ok, true)
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

  it("rejects wrong schemaVersion", () => {
    const result = validatePersistedAppSettings({
      ...defaultAppSettings,
      schemaVersion: 2,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      const issue = result.issues.find((i) => i.path === "schemaVersion")
      assert.ok(issue, "Expected an issue at path 'schemaVersion'")
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
          name: "Bad",
          provider: "bitbucket",
          baseUrl: null,
          token: "tok",
          organization: null,
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
})

describe("validatePersistedProfile", () => {
  const validProfile = {
    kind: "repo-edu.profile.v3",
    schemaVersion: 3,
    revision: 0,
    id: "prof-1",
    displayName: "Test Profile",
    lmsConnectionName: null,
    gitConnectionName: null,
    courseId: null,
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

  it("accepts a valid empty profile", () => {
    const result = validatePersistedProfile(validProfile)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.id, "prof-1")
      assert.equal(result.value.displayName, "Test Profile")
    }
  })

  it("accepts a profile with populated roster and groups", () => {
    const profile = {
      ...validProfile,
      roster: {
        connection: {
          kind: "import",
          sourceFilename: "students.csv",
          lastUpdated: "2026-03-04T10:00:00Z",
        },
        students: [
          {
            id: "s1",
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
            id: "t1",
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
            id: "g1",
            name: "Alpha",
            memberIds: ["s1"],
            origin: "lms",
            lmsGroupId: "canvas-group-1",
          },
        ],
        groupSets: [
          {
            id: "gs1",
            name: "Teams",
            groupIds: ["g1"],
            connection: {
              kind: "canvas",
              courseId: "course-1",
              groupSetId: "canvas-set-1",
              lastUpdated: "2026-03-04T10:00:00Z",
            },
            groupSelection: {
              kind: "all",
              excludedGroupIds: [],
            },
          },
        ],
        assignments: [{ id: "a1", name: "HW1", groupSetId: "gs1" }],
      },
      repositoryTemplate: {
        owner: "org",
        name: "template",
        visibility: "private",
      },
    }
    const result = validatePersistedProfile(profile)
    assert.equal(result.ok, true)
  })

  it("accepts pattern-based group selection", () => {
    const profile = {
      ...validProfile,
      roster: {
        ...validProfile.roster,
        groupSets: [
          {
            id: "gs1",
            name: "Teams",
            groupIds: [],
            connection: null,
            groupSelection: {
              kind: "pattern",
              pattern: "lab-*",
              excludedGroupIds: ["g3"],
            },
          },
        ],
      },
    }
    const result = validatePersistedProfile(profile)
    assert.equal(result.ok, true)
  })

  it("rejects non-object input", () => {
    const result = validatePersistedProfile(42)
    assert.equal(result.ok, false)
  })

  it("rejects wrong kind", () => {
    const result = validatePersistedProfile({ ...validProfile, kind: "wrong" })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(result.issues.some((i) => i.path === "kind"))
    }
  })

  it("rejects invalid member in roster", () => {
    const result = validatePersistedProfile({
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

  it("rejects invalid group selection mode", () => {
    const result = validatePersistedProfile({
      ...validProfile,
      roster: {
        ...validProfile.roster,
        groupSets: [
          {
            id: "gs1",
            name: "X",
            groupIds: [],
            connection: null,
            groupSelection: {
              kind: "invalid",
            },
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
    const result = validatePersistedProfile({
      ...validProfile,
      repositoryTemplate: {
        owner: "org",
        name: "tmpl",
        visibility: "secret",
      },
    })
    assert.equal(result.ok, false)
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
