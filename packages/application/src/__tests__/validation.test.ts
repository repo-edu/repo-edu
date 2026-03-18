import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GitUsernameImportInput } from "@repo-edu/application-contract"
import {
  type PersistedAppSettings,
  type PersistedCourse,
  systemSetsMissing,
} from "@repo-edu/domain"
import { createConnectionWorkflowHandlers } from "../connection-workflows.js"
import {
  createInMemoryAppSettingsStore,
  createInMemoryCourseStore,
  createValidationAppError,
  runValidateAssignmentForCourse,
  runValidateRosterForCourse,
} from "../core.js"
import { createCourseWorkflowHandlers } from "../course-workflows.js"
import { createGitUsernameWorkflowHandlers } from "../git-username-workflows.js"
import { createGroupSetWorkflowHandlers } from "../group-set-workflows.js"
import { createRepositoryWorkflowHandlers } from "../repository-workflows.js"
import { createRosterWorkflowHandlers } from "../roster-workflows.js"
import { createSettingsWorkflowHandlers } from "../settings-workflows.js"
import { createValidationWorkflowHandlers } from "../validation-workflows.js"

function makeProfile(): PersistedCourse {
  return {
    kind: "repo-edu.course.v1",
    schemaVersion: 1,
    revision: 0,
    id: "course-1",
    displayName: "Course",
    lmsConnectionName: null,
    gitConnectionId: null,
    organization: null,
    lmsCourseId: null,
    roster: {
      connection: null,
      students: [
        {
          id: "s1",
          name: "Alice Smith",
          email: "",
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
      staff: [],
      groups: [
        {
          id: "g1",
          name: "Alpha",
          memberIds: [],
          origin: "local",
          lmsGroupId: null,
        },
        {
          id: "g2",
          name: "Beta",
          memberIds: ["s1"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs1",
          name: "Projects",
          groupIds: ["g1", "g2"],
          connection: null,
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
          repoNameTemplate: null,
        },
      ],
      assignments: [
        {
          id: "a1",
          name: "Project 1",
          groupSetId: "gs1",
        },
      ],
    },
    repositoryTemplate: null,
    updatedAt: "2026-03-04T10:00:00Z",
  }
}

function makeSettings(): PersistedAppSettings {
  return {
    kind: "repo-edu.app-settings.v1",
    schemaVersion: 1,
    activeCourseId: null,
    appearance: {
      theme: "system",
      windowChrome: "system",
      dateFormat: "DMY",
      timeFormat: "24h",
    },
    lmsConnections: [],
    gitConnections: [],
    lastOpenedAt: null,
    rosterColumnVisibility: {},
    rosterColumnSizing: {},
    groupsColumnVisibility: {},
    groupsColumnSizing: {},
  }
}

describe("application validation helpers", () => {
  it("validates roster issues from a persisted course", () => {
    const result = runValidateRosterForCourse(makeProfile())

    assert.equal(
      result.issues.some((issue) => issue.kind === "system_group_sets_missing"),
      true,
    )
    assert.equal(
      result.issues.some((issue) => issue.kind === "missing_email"),
      true,
    )
  })

  it("validates assignment issues from a persisted course", () => {
    const result = runValidateAssignmentForCourse(makeProfile(), "a1")

    assert.equal(
      result.issues.some((issue) => issue.kind === "empty_group"),
      true,
    )
    assert.equal(
      result.issues.some((issue) => issue.kind === "missing_git_username"),
      true,
    )
  })

  it("normalizes validation issues into an AppError", () => {
    const issues = runValidateRosterForCourse(makeProfile()).issues
    const error = createValidationAppError("Validation failed.", issues)

    assert.deepStrictEqual(error, {
      type: "validation",
      message: "Validation failed.",
      issues,
    })
  })

  it("validates using explicit course snapshots", async () => {
    const course = makeProfile()
    const handlers = createValidationWorkflowHandlers()

    const rosterResult = await handlers["validation.roster"]({
      course,
    })
    const assignmentResult = await handlers["validation.assignment"]({
      course,
      assignmentId: "a1",
    })

    assert.equal(rosterResult.issues.length > 0, true)
    assert.equal(
      assignmentResult.issues.some((issue) => issue.kind === "empty_group"),
      true,
    )
  })

  it("returns validation error for invalid course snapshots", async () => {
    const handlers = createValidationWorkflowHandlers()

    await assert.rejects(
      handlers["validation.roster"]({
        course: {
          ...makeProfile(),
          kind: "wrong-kind" as PersistedCourse["kind"],
        },
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})

describe("application git username workflow helpers", () => {
  it("imports Git usernames by student email and verifies status with provider", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    course.roster.students = [
      {
        ...course.roster.students[0],
        email: "s1@example.com",
      },
    ]
    const settings = {
      ...makeSettings(),
      activeCourseId: course.id,
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    let receivedDraft: unknown = null
    let receivedUsernames: string[] = []

    const handlers = createGitUsernameWorkflowHandlers({
      userFile: {
        readText: async () => ({
          displayName: "git-usernames.csv",
          mediaType: "text/csv",
          text: [
            "email,git_username",
            "s1@example.com,ada-l",
            "unknown@example.com,ghost-user",
          ].join("\n"),
          byteLength: 0,
        }),
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
      git: {
        verifyGitUsernames: async (draft, usernames) => {
          receivedDraft = draft
          receivedUsernames = usernames
          return [{ username: "ada-l", exists: true }]
        },
      },
    })

    const roster = await handlers["gitUsernames.import"]({
      course,
      appSettings: settings,
      file: {
        kind: "user-file-ref",
        referenceId: "file-1",
        displayName: "git-usernames.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })

    assert.deepStrictEqual(receivedDraft, {
      provider: "github",
      baseUrl: "https://github.com",
      token: "token-1",
    })
    assert.deepStrictEqual(receivedUsernames, ["ada-l"])
    assert.equal(roster.students[0]?.gitUsername, "ada-l")
    assert.equal(roster.students[0]?.gitUsernameStatus, "valid")
  })

  it("requires snapshot payloads", async () => {
    const handlers = createGitUsernameWorkflowHandlers({
      userFile: {
        readText: async () => ({
          displayName: "usernames.xlsx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          text: "",
          byteLength: 0,
        }),
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
      git: {
        verifyGitUsernames: async () => [],
      },
    })

    await assert.rejects(
      handlers["gitUsernames.import"]({} as GitUsernameImportInput),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("rejects non-csv imports with a validation AppError", async () => {
    const course = makeProfile()
    const settings = {
      ...makeSettings(),
      activeCourseId: course.id,
    }
    const handlers = createGitUsernameWorkflowHandlers({
      userFile: {
        readText: async () => ({
          displayName: "usernames.xlsx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          text: "",
          byteLength: 0,
        }),
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
      git: {
        verifyGitUsernames: async () => [],
      },
    })

    await assert.rejects(
      handlers["gitUsernames.import"]({
        course,
        appSettings: settings,
        file: {
          kind: "user-file-ref",
          referenceId: "file-3",
          displayName: "usernames.xlsx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          byteLength: null,
        },
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})

describe("application connection verification workflow helpers", () => {
  it("verifies LMS and Git drafts through adapter ports", async () => {
    let lmsDraft: unknown = null
    let lmsCourseDraft: unknown = null
    let gitDraft: unknown = null

    const handlers = createConnectionWorkflowHandlers({
      lms: {
        verifyConnection: async (draft) => {
          lmsDraft = draft
          return { verified: true }
        },
        listCourses: async (draft) => {
          lmsCourseDraft = draft
          return [
            { id: "course-1", name: "Course One", code: "C1" },
            { id: "course-2", name: "Course Two", code: null },
          ]
        },
      },
      git: {
        verifyConnection: async (draft) => {
          gitDraft = draft
          return { verified: false }
        },
      },
    })

    const lmsResult = await handlers["connection.verifyLmsDraft"]({
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })
    assert.equal(lmsResult.verified, true)
    assert.equal(Number.isNaN(Date.parse(lmsResult.checkedAt)), false)
    assert.deepStrictEqual(lmsDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })

    const courseResult = await handlers["connection.listLmsCoursesDraft"]({
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })
    assert.deepStrictEqual(courseResult, [
      { id: "course-1", name: "Course One", code: "C1" },
      { id: "course-2", name: "Course Two", code: null },
    ])
    assert.deepStrictEqual(lmsCourseDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })

    const gitResult = await handlers["connection.verifyGitDraft"]({
      provider: "github",
      baseUrl: "https://github.com",
      token: "token-2",
    })
    assert.equal(gitResult.verified, false)
    assert.equal(Number.isNaN(Date.parse(gitResult.checkedAt)), false)
    assert.deepStrictEqual(gitDraft, {
      provider: "github",
      baseUrl: "https://github.com",
      token: "token-2",
    })
  })

  it("normalizes provider failures and cancellation", async () => {
    const handlers = createConnectionWorkflowHandlers({
      lms: {
        verifyConnection: async () => {
          throw new Error("invalid token")
        },
        listCourses: async () => [],
      },
      git: {
        verifyConnection: async () => ({ verified: true }),
      },
    })

    await assert.rejects(
      handlers["connection.verifyLmsDraft"]({
        provider: "moodle",
        baseUrl: "https://moodle.example.edu",
        token: "bad-token",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "provider" &&
        "provider" in error &&
        error.provider === "moodle",
    )

    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      handlers["connection.verifyGitDraft"](
        {
          provider: "gitlab",
          baseUrl: "https://gitlab.example.edu",
          token: "token",
        },
        { signal: controller.signal },
      ),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "cancelled",
    )
  })
})

describe("application course workflow helpers", () => {
  it("lists, loads, and saves courses through the shared course store", async () => {
    const original = makeProfile()
    const store = createInMemoryCourseStore([original])
    const handlers = createCourseWorkflowHandlers(store)

    const listed = await handlers["course.list"](undefined)
    assert.deepStrictEqual(listed, [
      {
        id: original.id,
        displayName: original.displayName,
        updatedAt: original.updatedAt,
      },
    ])

    const loaded = await handlers["course.load"]({ courseId: original.id })
    assert.equal(loaded.id, original.id)

    const saved = await handlers["course.save"]({
      ...original,
      displayName: "Updated Course",
      updatedAt: "2000-01-01T00:00:00Z",
    })
    assert.equal(saved.displayName, "Updated Course")
    assert.notEqual(saved.updatedAt, "2000-01-01T00:00:00Z")

    const reloaded = await handlers["course.load"]({ courseId: original.id })
    assert.equal(reloaded.displayName, "Updated Course")
    assert.equal(reloaded.updatedAt, saved.updatedAt)
  })

  it("returns a validation AppError when course.save receives invalid data", async () => {
    const handlers = createCourseWorkflowHandlers(createInMemoryCourseStore([]))

    await assert.rejects(
      handlers["course.save"]({
        ...(makeProfile() as PersistedCourse),
        kind: "wrong-kind" as PersistedCourse["kind"],
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("returns a validation AppError when course.load resolves invalid course data", async () => {
    const handlers = createCourseWorkflowHandlers({
      listCourses: () => [],
      loadCourse: () =>
        ({
          ...makeProfile(),
          kind: "wrong-kind",
        }) as unknown as PersistedCourse,
      saveCourse: (course: PersistedCourse) => course,
      deleteCourse: () => {},
    })

    await assert.rejects(
      handlers["course.load"]({ courseId: "course-1" }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("returns a validation AppError when course.list contains invalid course data", async () => {
    const handlers = createCourseWorkflowHandlers({
      listCourses: () =>
        [
          {
            ...makeProfile(),
            kind: "wrong-kind",
          },
        ] as unknown as PersistedCourse[],
      loadCourse: () => makeProfile(),
      saveCourse: (course: PersistedCourse) => course,
      deleteCourse: () => {},
    })

    await assert.rejects(
      handlers["course.list"](undefined),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})

describe("application settings workflow helpers", () => {
  it("returns default settings when store is empty and saves validated settings", async () => {
    const handlers = createSettingsWorkflowHandlers(
      createInMemoryAppSettingsStore(),
    )

    const loadedDefault = await handlers["settings.loadApp"](undefined)
    assert.equal(loadedDefault.kind, "repo-edu.app-settings.v1")
    assert.equal(loadedDefault.schemaVersion, 1)

    const saved = await handlers["settings.saveApp"]({
      ...makeSettings(),
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
      handlers["settings.saveApp"]({
        ...makeSettings(),
        kind: "wrong-kind" as PersistedAppSettings["kind"],
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})

describe("application roster workflow helpers", () => {
  it("imports students from CSV file and ensures system group sets", async () => {
    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async () => makeProfile().roster,
      },
      userFile: {
        readText: async () => ({
          displayName: "students.csv",
          mediaType: "text/csv",
          text: [
            "id,name,email,student_number,git_username",
            "s-1,Ada Lovelace,ada@example.com,1001,adal",
            "s-2,Grace Hopper,grace@example.com,1002,ghopper",
          ].join("\n"),
          byteLength: 0,
        }),
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    const roster = await handlers["roster.importFromFile"]({
      file: {
        kind: "user-file-ref",
        referenceId: "file-1",
        displayName: "students.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })

    assert.equal(roster.students.length, 2)
    assert.equal(systemSetsMissing(roster), false)
    assert.equal(roster.connection?.kind, "import")
  })

  it("fails roster import when CSV rows violate student schema", async () => {
    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async () => makeProfile().roster,
      },
      userFile: {
        readText: async () => ({
          displayName: "students.csv",
          mediaType: "text/csv",
          text: ["email", "ada@example.com"].join("\n"),
          byteLength: 0,
        }),
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    await assert.rejects(
      () =>
        handlers["roster.importFromFile"]({
          file: {
            kind: "user-file-ref",
            referenceId: "file-2",
            displayName: "students.csv",
            mediaType: "text/csv",
            byteLength: null,
          },
        }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("imports roster from LMS using the course connection and enforces system sets", async () => {
    const course = {
      ...makeProfile(),
      lmsConnectionName: "main-lms",
    }
    const settings = {
      ...makeSettings(),
      lmsConnections: [
        {
          name: "main-lms",
          provider: "canvas" as const,
          baseUrl: "https://canvas.example.edu",
          token: "token-1",
        },
      ],
    }

    let receivedDraft: unknown = null
    let receivedCourseId = ""
    const progressLabels: string[] = []

    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async (draft, courseId, _signal, onProgress) => {
          receivedDraft = draft
          receivedCourseId = courseId
          onProgress?.("Loaded 1 enrolled users from LMS.")
          return {
            connection: null,
            students: [
              {
                id: "s1",
                name: "Ada",
                email: "ada@example.com",
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
                source: "canvas",
              },
            ],
            staff: [],
            groups: [],
            groupSets: [],
            assignments: [],
          }
        },
      },
      userFile: {
        readText: async () => {
          throw new Error("not used")
        },
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    const imported = await handlers["roster.importFromLms"](
      {
        course,
        appSettings: settings,
        lmsCourseId: "course-42",
      },
      {
        onProgress: (progress) => {
          progressLabels.push(progress.label)
        },
      },
    )

    assert.deepStrictEqual(receivedDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
    })
    assert.equal(receivedCourseId, "course-42")
    assert.equal(
      progressLabels.includes("Loaded 1 enrolled users from LMS."),
      true,
    )
    assert.equal(systemSetsMissing(imported.roster), false)
  })

  it("exports students to CSV and rejects unsupported xlsx export", async () => {
    const course = makeProfile()
    let lastWrittenText = ""

    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async () => makeProfile().roster,
      },
      userFile: {
        readText: async () => ({
          displayName: "unused.csv",
          mediaType: "text/csv",
          text: "",
          byteLength: 0,
        }),
        writeText: async (reference, text) => {
          lastWrittenText = text
          return {
            displayName: reference.displayName,
            mediaType: "text/csv",
            byteLength: text.length,
            savedAt: "2026-03-04T10:00:00.000Z",
          }
        },
      },
    })

    const target = {
      kind: "user-save-target-ref" as const,
      referenceId: "save-1",
      displayName: "students.csv",
      suggestedFormat: "csv" as const,
    }
    const result = await handlers["roster.exportMembers"]({
      course,
      target,
      format: "csv",
    })
    assert.deepStrictEqual(result, { file: target })
    assert.equal(lastWrittenText.startsWith("id,name,email"), true)

    await assert.rejects(
      handlers["roster.exportMembers"]({
        course,
        target: {
          ...target,
          displayName: "students.xlsx",
          suggestedFormat: "xlsx",
        },
        format: "xlsx",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})

describe("application group-set workflow helpers", () => {
  it("discovers available LMS group sets for the course course", async () => {
    const course = {
      ...makeProfile(),
      lmsConnectionName: "main-lms",
      lmsCourseId: "course-42",
    }
    const settings = {
      ...makeSettings(),
      lmsConnections: [
        {
          name: "main-lms",
          provider: "canvas" as const,
          baseUrl: "https://canvas.example.edu",
          token: "token-1",
        },
      ],
    }
    let receivedCourseId = ""

    const handlers = createGroupSetWorkflowHandlers({
      lms: {
        listGroupSets: async (_draft, courseId) => {
          receivedCourseId = courseId
          return [
            { id: "set-1", name: "Lab Teams", groupCount: 8 },
            { id: "set-2", name: "Project Teams", groupCount: 6 },
          ]
        },
        fetchGroupSet: async () => {
          throw new Error("not used")
        },
      },
      userFile: {
        readText: async () => {
          throw new Error("not used")
        },
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    const result = await handlers["groupSet.fetchAvailableFromLms"]({
      course,
      appSettings: settings,
    })

    assert.equal(receivedCourseId, "course-42")
    assert.deepStrictEqual(result, [
      { id: "set-1", name: "Lab Teams", groupCount: 8 },
      { id: "set-2", name: "Project Teams", groupCount: 6 },
    ])
  })

  it("connects an LMS group set using a local id and persists remote linkage", async () => {
    const course = makeProfile()
    course.lmsConnectionName = "main-lms"
    course.lmsCourseId = "course-42"
    course.roster.students = [
      {
        ...course.roster.students[0],
        id: "s-local-1",
        lmsUserId: "u-1",
      },
    ]
    course.roster.groups = []
    course.roster.groupSets = []

    const settings = {
      ...makeSettings(),
      lmsConnections: [
        {
          name: "main-lms",
          provider: "canvas" as const,
          baseUrl: "https://canvas.example.edu",
          token: "token-1",
        },
      ],
    }

    let fetchDraft: unknown = null
    let fetchCourseId = ""
    let fetchGroupSetId = ""

    const handlers = createGroupSetWorkflowHandlers({
      lms: {
        listGroupSets: async () => {
          throw new Error("not used")
        },
        fetchGroupSet: async (draft, courseId, groupSetId) => {
          fetchDraft = draft
          fetchCourseId = courseId
          fetchGroupSetId = groupSetId
          return {
            groupSet: {
              id: "remote-set-1",
              name: "Project Groups",
              groupIds: ["10"],
              connection: {
                kind: "canvas",
                courseId: "course-42",
                groupSetId: "remote-set-1",
                lastUpdated: "2026-03-04T10:00:00.000Z",
              },
              groupSelection: { kind: "all", excludedGroupIds: [] },
              repoNameTemplate: null,
            },
            groups: [
              {
                id: "10",
                name: "Team 10",
                memberIds: ["u-1"],
                origin: "lms",
                lmsGroupId: "10",
              },
            ],
          }
        },
      },
      userFile: {
        readText: async () => {
          throw new Error("not used")
        },
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    const connected = await handlers["groupSet.connectFromLms"]({
      course,
      appSettings: settings,
      remoteGroupSetId: "remote-set-1",
    })

    assert.deepStrictEqual(fetchDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
    })
    assert.equal(fetchCourseId, "course-42")
    assert.equal(fetchGroupSetId, "remote-set-1")
    assert.equal(connected.id.startsWith("group_set_"), true)
    assert.notEqual(connected.id, "remote-set-1")
    assert.equal(connected.name, "Project Groups")
    assert.equal(connected.connection?.kind, "canvas")
    if (connected.connection?.kind === "canvas") {
      assert.equal(connected.connection.groupSetId, "remote-set-1")
    }

    assert.equal(connected.roster.groupSets.length, 1)
    assert.equal(connected.roster.groups.length, 1)
    assert.deepStrictEqual(connected.roster.groups[0], {
      id: "10",
      name: "Team 10",
      memberIds: ["s-local-1"],
      origin: "lms",
      lmsGroupId: "10",
    })
  })

  it("rejects connecting an LMS group set that is already connected", async () => {
    const course = makeProfile()
    course.lmsConnectionName = "main-lms"
    course.lmsCourseId = "course-42"
    course.roster.groupSets = [
      {
        id: "gs-remote-1",
        name: "Existing LMS Set",
        groupIds: [],
        connection: {
          kind: "canvas",
          courseId: "course-42",
          groupSetId: "remote-set-1",
          lastUpdated: "2026-03-04T10:00:00.000Z",
        },
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
    ]

    const settings = {
      ...makeSettings(),
      lmsConnections: [
        {
          name: "main-lms",
          provider: "canvas" as const,
          baseUrl: "https://canvas.example.edu",
          token: "token-1",
        },
      ],
    }

    const handlers = createGroupSetWorkflowHandlers({
      lms: {
        listGroupSets: async () => {
          throw new Error("not used")
        },
        fetchGroupSet: async () => {
          throw new Error("not used")
        },
      },
      userFile: {
        readText: async () => {
          throw new Error("not used")
        },
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    await assert.rejects(
      handlers["groupSet.connectFromLms"]({
        course,
        appSettings: settings,
        remoteGroupSetId: "remote-set-1",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("syncs an LMS-connected group set into the course roster", async () => {
    const course = makeProfile()
    course.lmsConnectionName = "main-lms"
    course.lmsCourseId = "course-42"
    course.roster.students = [
      {
        ...course.roster.students[0],
        id: "s-local-1",
        lmsUserId: "u-1",
      },
    ]
    course.roster.groups = [
      {
        id: "g-local-1",
        name: "Old Name",
        memberIds: ["s-local-1"],
        origin: "lms",
        lmsGroupId: "10",
      },
      {
        id: "g-local-removed",
        name: "Will Remove",
        memberIds: [],
        origin: "lms",
        lmsGroupId: "20",
      },
    ]
    course.roster.groupSets = [
      {
        id: "gs1",
        name: "Imported LMS Set",
        groupIds: ["g-local-1", "g-local-removed"],
        connection: {
          kind: "canvas",
          courseId: "course-42",
          groupSetId: "remote-set-1",
          lastUpdated: "2026-03-01T00:00:00.000Z",
        },
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
    ]

    const settings = {
      ...makeSettings(),
      lmsConnections: [
        {
          name: "main-lms",
          provider: "canvas" as const,
          baseUrl: "https://canvas.example.edu",
          token: "token-1",
        },
      ],
    }

    const handlers = createGroupSetWorkflowHandlers({
      lms: {
        listGroupSets: async () => {
          throw new Error("not used")
        },
        fetchGroupSet: async () => ({
          groupSet: {
            id: "remote-set-1",
            name: "Synced LMS Set",
            groupIds: ["10", "30"],
            connection: {
              kind: "canvas",
              courseId: "course-42",
              groupSetId: "remote-set-1",
              lastUpdated: "2026-03-04T10:00:00.000Z",
            },
            groupSelection: { kind: "all", excludedGroupIds: [] },
            repoNameTemplate: null,
          },
          groups: [
            {
              id: "10",
              name: "Group 10",
              memberIds: ["u-1"],
              origin: "lms",
              lmsGroupId: "10",
            },
            {
              id: "30",
              name: "Group 30",
              memberIds: ["missing-user", "u-1"],
              origin: "lms",
              lmsGroupId: "30",
            },
          ],
        }),
      },
      userFile: {
        readText: async () => {
          throw new Error("not used")
        },
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    const synced = await handlers["groupSet.syncFromLms"]({
      course,
      appSettings: settings,
      groupSetId: "gs1",
    })

    assert.deepStrictEqual(synced.groupIds, ["g-local-1", "30"])
    assert.equal(synced.name, "Synced LMS Set")

    assert.deepStrictEqual(
      synced.roster.groups.map((group) => group.id).sort(),
      ["30", "g-local-1"],
    )
  })

  it("previews group-set import and reimport from csv", async () => {
    const course = makeProfile()
    course.roster.students = [
      {
        ...course.roster.students[0],
        email: "s1@example.com",
      },
    ]

    const handlers = createGroupSetWorkflowHandlers({
      lms: {
        listGroupSets: async () => {
          throw new Error("not used")
        },
        fetchGroupSet: async () => {
          throw new Error("not used")
        },
      },
      userFile: {
        readText: async (file) => {
          if (file.referenceId === "import-file") {
            return {
              displayName: "group-import.csv",
              mediaType: "text/csv",
              byteLength: 0,
              text: ["group_name,email", "Team A,s1@example.com"].join("\n"),
            }
          }

          return {
            displayName: "group-reimport.csv",
            mediaType: "text/csv",
            byteLength: 0,
            text: [
              "group_name,group_id,email",
              "Renamed Alpha,g1,s1@example.com",
            ].join("\n"),
          }
        },
        writeText: async (reference) => ({
          displayName: reference.displayName,
          mediaType: "text/csv",
          byteLength: 0,
          savedAt: "2026-03-04T10:00:00.000Z",
        }),
      },
    })

    const importPreview = await handlers["groupSet.previewImportFromFile"]({
      course,
      file: {
        kind: "user-file-ref",
        referenceId: "import-file",
        displayName: "group-import.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })
    assert.equal(importPreview.mode, "import")
    assert.deepStrictEqual(importPreview.groups, [
      { name: "Team A", memberCount: 1 },
    ])

    const reimportPreview = await handlers["groupSet.previewReimportFromFile"]({
      course,
      groupSetId: "gs1",
      file: {
        kind: "user-file-ref",
        referenceId: "reimport-file",
        displayName: "group-reimport.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })
    assert.equal(reimportPreview.mode, "reimport")
    if (reimportPreview.mode !== "reimport") {
      return
    }
    assert.deepStrictEqual(reimportPreview.renamedGroups, [
      { from: "Alpha", to: "Renamed Alpha" },
    ])
  })

  it("exports group sets to csv/yaml and rejects xlsx", async () => {
    const course = makeProfile()
    let lastWritten = ""

    const handlers = createGroupSetWorkflowHandlers({
      lms: {
        listGroupSets: async () => {
          throw new Error("not used")
        },
        fetchGroupSet: async () => {
          throw new Error("not used")
        },
      },
      userFile: {
        readText: async () => {
          throw new Error("not used")
        },
        writeText: async (reference, text) => {
          lastWritten = text
          return {
            displayName: reference.displayName,
            mediaType: "text/csv",
            byteLength: text.length,
            savedAt: "2026-03-04T10:00:00.000Z",
          }
        },
      },
    })

    const csvTarget = {
      kind: "user-save-target-ref" as const,
      referenceId: "save-group-csv",
      displayName: "groups.csv",
      suggestedFormat: "csv" as const,
    }
    const csvResult = await handlers["groupSet.export"]({
      course,
      groupSetId: "gs1",
      target: csvTarget,
      format: "csv",
    })
    assert.deepStrictEqual(csvResult, { file: csvTarget })
    assert.equal(
      lastWritten.startsWith("group_set_id,group_id,group_name"),
      true,
    )

    const yamlTarget = {
      ...csvTarget,
      referenceId: "save-group-yaml",
      displayName: "groups.yaml",
      suggestedFormat: "yaml" as const,
    }
    await handlers["groupSet.export"]({
      course,
      groupSetId: "gs1",
      target: yamlTarget,
      format: "yaml",
    })
    assert.equal(lastWritten.includes("\tmembers:["), true)

    await assert.rejects(
      handlers["groupSet.export"]({
        course,
        groupSetId: "gs1",
        target: {
          ...csvTarget,
          referenceId: "save-group-xlsx",
          displayName: "groups.xlsx",
          suggestedFormat: "xlsx",
        },
        format: "xlsx",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })
})

describe("application repository workflow helpers", () => {
  it("creates repositories from assignment planning output", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    let receivedRequest: unknown = null

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async (_draft, request) => {
          receivedRequest = request
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
        createTeam: async (_draft, request) => ({
          created: true,
          teamSlug: request.teamName,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const result = await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: null,
      template: null,
    })

    assert.deepStrictEqual(receivedRequest, {
      organization: "repo-edu",
      repositoryNames: ["beta"],
      visibility: "private",
      autoInit: true,
    })
    assert.equal(result.repositoriesPlanned, 1)
    assert.equal(result.repositoriesCreated, 1)
    assert.equal(result.repositoriesAlreadyExisted, 0)
    assert.equal(result.repositoriesFailed, 0)
    assert.equal(Number.isNaN(Date.parse(result.completedAt)), false)
  })

  it("normalizes provider failures from repo.create", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => {
          throw new Error("provider unavailable")
        },
        createTeam: async (_draft, request) => ({
          created: true,
          teamSlug: request.teamName,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    await assert.rejects(
      () =>
        handlers["repo.create"]({
          course,
          appSettings: settings,
          assignmentId: null,
          template: null,
        }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "provider" &&
        "provider" in error &&
        error.provider === "github" &&
        "operation" in error &&
        error.operation === "createRepositories",
    )
  })

  it("filters repository planning to the selected group ids", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    let receivedRequest: unknown = null

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async (_draft, request) => {
          receivedRequest = request
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
        createTeam: async (_draft, request) => ({
          created: true,
          teamSlug: request.teamName,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const result = await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      groupIds: ["g2"],
    })

    assert.deepStrictEqual(receivedRequest, {
      organization: "repo-edu",
      repositoryNames: ["beta"],
      visibility: "private",
      autoInit: true,
    })
    assert.equal(result.repositoriesPlanned, 1)
    assert.equal(result.repositoriesCreated, 1)
    assert.equal(result.repositoriesAlreadyExisted, 0)
    assert.equal(result.repositoriesFailed, 0)
  })

  it("clones repositories from selected group ids", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    const cloneCommands: string[][] = []
    const batchOperations: Array<Array<Record<string, string>>> = []
    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async (_draft, request) => ({
          resolved: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
          })),
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async (request) => {
          cloneCommands.push(request.args)
          return {
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
          }
        },
      },
      fileSystem: {
        inspect: async (request) =>
          request.paths.map((path) => ({ path, kind: "missing" as const })),
        applyBatch: async (request) => {
          batchOperations.push(
            request.operations as Array<Record<string, string>>,
          )
          return { completed: [] }
        },
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: null,
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
      groupIds: ["g2"],
    })
    assert.equal(cloneResult.repositoriesPlanned, 1)
    assert.equal(cloneResult.repositoriesCloned, 1)
    assert.equal(cloneResult.repositoriesFailed, 0)
    assert.deepStrictEqual(cloneCommands[0]?.slice(0, 1), ["init"])
    assert.ok(
      cloneCommands[0]?.[1]?.includes("/work/repos/.repo-edu-clone-tmp/"),
    )
    assert.ok(cloneCommands[0]?.[1]?.endsWith("/beta-0"))
    const tempPath = cloneCommands[0]?.[1] ?? ""
    assert.deepStrictEqual(cloneCommands[1], [
      "pull",
      "https://x-access-token:token-1@github.com/repo-edu/beta.git",
    ])
    assert.equal(cloneCommands[2]?.[0], "remote")
    const copyOperations = batchOperations.flat().filter((operation) => {
      return operation.kind === "copy-directory"
    })
    assert.deepStrictEqual(copyOperations, [
      {
        kind: "copy-directory",
        sourcePath: tempPath,
        destinationPath: "/work/repos/beta",
      },
    ])
    assert.deepStrictEqual(cloneCommands[2], [
      "remote",
      "add",
      "origin",
      "https://github.com/repo-edu/beta.git",
    ])
  })

  it("treats empty remote repositories as successful clones", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    const cloneCommands: string[][] = []
    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async (_draft, request) => ({
          resolved: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
          })),
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async (request) => {
          cloneCommands.push(request.args)
          if (request.args[0] === "pull") {
            return {
              exitCode: 1,
              signal: null,
              stdout: "",
              stderr: "fatal: couldn't find remote ref HEAD",
            }
          }
          return {
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
          }
        },
      },
      fileSystem: {
        inspect: async (request) =>
          request.paths.map((path) => ({ path, kind: "missing" as const })),
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: null,
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
      groupIds: ["g2"],
    })

    assert.equal(cloneResult.repositoriesCloned, 1)
    assert.equal(cloneResult.repositoriesFailed, 0)
    assert.deepStrictEqual(cloneCommands[2], [
      "remote",
      "add",
      "origin",
      "https://github.com/repo-edu/beta.git",
    ])
  })

  it("errors when clone target clashes with non-git directories", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async (_draft, request) => ({
          resolved: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
          })),
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async (request) => {
          if (request.args[0] === "-C") {
            return {
              exitCode: 1,
              signal: null,
              stdout: "",
              stderr: "fatal: not a git repository",
            }
          }
          return {
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
          }
        },
      },
      fileSystem: {
        inspect: async () => [{ path: "/work/repos/beta", kind: "directory" }],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    await assert.rejects(
      async () =>
        handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: null,
          template: null,
          targetDirectory: "/work/repos",
          directoryLayout: "flat",
          groupIds: ["g2"],
        }),
      (error: unknown) => {
        const appError = error as { type?: string; message?: string }
        assert.equal(appError.type, "validation", "expected validation error")
        assert.match(
          appError.message ?? "",
          /non-git entries/,
          "expected non-git clash message",
        )
        return true
      },
    )
  })

  it("does not copy into final destination when clone pull fails", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    const cloneCommands: string[][] = []
    const batchOperations: Array<Array<Record<string, string>>> = []
    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async (_draft, request) => ({
          resolved: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
          })),
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async (request) => {
          cloneCommands.push(request.args)
          if (request.args[0] === "pull") {
            return {
              exitCode: 1,
              signal: null,
              stdout: "",
              stderr: "fatal: authentication failed",
            }
          }
          return {
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
          }
        },
      },
      fileSystem: {
        inspect: async (request) =>
          request.paths.map((path) => ({ path, kind: "missing" as const })),
        applyBatch: async (request) => {
          batchOperations.push(
            request.operations as Array<Record<string, string>>,
          )
          return { completed: [] }
        },
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: null,
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
      groupIds: ["g2"],
    })

    assert.equal(cloneResult.repositoriesCloned, 0)
    assert.equal(cloneResult.repositoriesFailed, 1)
    assert.deepStrictEqual(cloneCommands[0]?.slice(0, 1), ["init"])
    assert.ok(
      cloneCommands[0]?.[1]?.includes("/work/repos/.repo-edu-clone-tmp/"),
    )
    const copyOperations = batchOperations.flat().filter((operation) => {
      return operation.kind === "copy-directory"
    })
    assert.deepStrictEqual(copyOperations, [])
  })

  it("reports alreadyExisted and failed buckets in repo.create result", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [
            {
              repositoryName: "beta",
              repositoryUrl: "https://github.com/repo-edu/beta",
            },
          ],
          failed: [],
        }),
        createTeam: async (_draft, request) => ({
          created: true,
          teamSlug: request.teamName,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const result = await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: null,
      template: null,
    })

    assert.equal(result.repositoriesPlanned, 1)
    assert.equal(result.repositoriesCreated, 0)
    assert.equal(result.repositoriesAlreadyExisted, 1)
    assert.equal(result.repositoriesFailed, 0)
  })

  it("uses per-assignment template when available", async () => {
    const assignmentTemplate = {
      kind: "remote" as const,
      owner: "assignment-templates",
      name: "hw1-template",
      visibility: "private" as const,
    }
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
      repositoryTemplate: {
        kind: "remote" as const,
        owner: "course-templates",
        name: "default-template",
        visibility: "private" as const,
      },
      roster: {
        ...makeProfile().roster,
        assignments: [
          {
            ...makeProfile().roster.assignments[0],
            repositoryTemplate: assignmentTemplate,
          },
        ],
      },
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    let receivedVisibility: unknown = null

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async (_draft, request) => {
          receivedVisibility = request.visibility
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
        createTeam: async (_draft, request) => ({
          created: true,
          teamSlug: request.teamName,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => ({ files: [] }),
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "https://example.com/pr/1",
          created: true,
        }),
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
    })

    assert.equal(receivedVisibility, assignmentTemplate.visibility)
  })

  it("creates template update pull requests for planned repositories", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
      repositoryTemplate: {
        kind: "remote" as const,
        owner: "template-org",
        name: "course-template",
        visibility: "private" as const,
      },
      roster: {
        ...makeProfile().roster,
        assignments: [
          {
            ...makeProfile().roster.assignments[0],
            templateCommitSha: "old-template-sha",
          },
        ],
      },
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    const createdBranches: string[] = []
    const createdPullRequests: string[] = []

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async (_draft, request) => {
          if (
            request.owner === "template-org" &&
            request.repositoryName === "course-template"
          ) {
            return { sha: "new-template-sha", branchName: "main" }
          }
          return { sha: "repo-base-sha", branchName: "main" }
        },
        getTemplateDiff: async () => ({
          files: [
            {
              path: "README.md",
              previousPath: null,
              status: "modified",
              contentBase64: "VGVtcGxhdGUgY29udGVudA==",
            },
          ],
        }),
        createBranch: async (_draft, request) => {
          createdBranches.push(
            `${request.owner}/${request.repositoryName}:${request.branchName}`,
          )
        },
        createPullRequest: async (_draft, request) => {
          createdPullRequests.push(
            `${request.owner}/${request.repositoryName}:${request.headBranch}`,
          )
          return {
            url: `https://github.com/${request.owner}/${request.repositoryName}/pull/1`,
            created: true,
          }
        },
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const result = await handlers["repo.update"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
    })

    assert.equal(result.repositoriesPlanned, 1)
    assert.equal(result.prsCreated, 1)
    assert.equal(result.prsSkipped, 0)
    assert.equal(result.prsFailed, 0)
    assert.equal(result.templateCommitSha, "new-template-sha")
    assert.equal(createdBranches.length, 1)
    assert.equal(createdPullRequests.length, 1)
  })

  it("skips update when template SHA is unchanged", async () => {
    const course = {
      ...makeProfile(),
      gitConnectionId: "main-git",
      organization: "repo-edu",
      repositoryTemplate: {
        kind: "remote" as const,
        owner: "template-org",
        name: "course-template",
        visibility: "private" as const,
      },
      roster: {
        ...makeProfile().roster,
        assignments: [
          {
            ...makeProfile().roster.assignments[0],
            templateCommitSha: "same-template-sha",
          },
        ],
      },
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          id: "main-git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "token-1",
        },
      ],
    }
    let getTemplateDiffCalls = 0

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "same-template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => {
          getTemplateDiffCalls += 1
          return { files: [] }
        },
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "",
          created: false,
        }),
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const result = await handlers["repo.update"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
    })

    assert.equal(result.repositoriesPlanned, 1)
    assert.equal(result.prsCreated, 0)
    assert.equal(result.prsSkipped, 1)
    assert.equal(result.prsFailed, 0)
    assert.equal(getTemplateDiffCalls, 0)
  })
})
