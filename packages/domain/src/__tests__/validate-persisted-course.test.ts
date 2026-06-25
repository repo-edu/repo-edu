import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { validatePersistedCourse } from "../schemas.js"
import { createBlankCourse } from "../types.js"

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
