import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type PersistedAppSettings,
  type PersistedProfile,
  systemSetsMissing,
} from "@repo-edu/domain"
import {
  createConnectionWorkflowHandlers,
  createGitUsernameWorkflowHandlers,
  createGroupSetWorkflowHandlers,
  createInMemoryAppSettingsStore,
  createInMemoryProfileStore,
  createProfileWorkflowHandlers,
  createRepositoryWorkflowHandlers,
  createRosterWorkflowHandlers,
  createSettingsWorkflowHandlers,
  createValidationAppError,
  createValidationWorkflowHandlers,
  runValidateAssignmentForProfile,
  runValidateRosterForProfile,
} from "../index.js"

function makeProfile(): PersistedProfile {
  return {
    kind: "repo-edu.profile.v2",
    schemaVersion: 2,
    id: "profile-1",
    displayName: "Profile",
    lmsConnectionName: null,
    gitConnectionName: null,
    courseId: null,
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
    activeProfileId: null,
    appearance: {
      theme: "system",
      windowChrome: "system",
      dateFormat: "DMY",
      timeFormat: "24h",
    },
    lmsConnections: [],
    gitConnections: [],
    lastOpenedAt: null,
  }
}

describe("application validation helpers", () => {
  it("validates roster issues from a persisted profile", () => {
    const result = runValidateRosterForProfile(makeProfile())

    assert.equal(
      result.issues.some((issue) => issue.kind === "system_group_sets_missing"),
      true,
    )
    assert.equal(
      result.issues.some((issue) => issue.kind === "missing_email"),
      true,
    )
  })

  it("validates assignment issues from a persisted profile", () => {
    const result = runValidateAssignmentForProfile(makeProfile(), "a1")

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
    const issues = runValidateRosterForProfile(makeProfile()).issues
    const error = createValidationAppError("Validation failed.", issues)

    assert.deepStrictEqual(error, {
      type: "validation",
      message: "Validation failed.",
      issues,
    })
  })

  it("resolves profileId-based validation workflows through a profile store", async () => {
    const profile = makeProfile()
    const handlers = createValidationWorkflowHandlers(
      createInMemoryProfileStore([profile]),
    )

    const rosterResult = await handlers["validation.roster"]({
      profileId: profile.id,
    })
    const assignmentResult = await handlers["validation.assignment"]({
      profileId: profile.id,
      assignmentId: "a1",
    })

    assert.equal(rosterResult.issues.length > 0, true)
    assert.equal(
      assignmentResult.issues.some((issue) => issue.kind === "empty_group"),
      true,
    )
  })

  it("throws a not-found AppError when the profile is missing", async () => {
    const handlers = createValidationWorkflowHandlers(
      createInMemoryProfileStore([]),
    )

    await assert.rejects(
      handlers["validation.roster"]({ profileId: "missing-profile" }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "not-found",
    )
  })
})

describe("application git username workflow helpers", () => {
  it("imports Git usernames by student email and verifies status with provider", async () => {
    const profile = {
      ...makeProfile(),
      gitConnectionName: "main-git",
    }
    profile.roster.students = [
      {
        ...profile.roster.students[0],
        email: "s1@example.com",
      },
    ]
    const settings = {
      ...makeSettings(),
      activeProfileId: profile.id,
      gitConnections: [
        {
          name: "main-git",
          provider: "github" as const,
          baseUrl: null,
          token: "token-1",
          organization: "repo-edu",
        },
      ],
    }
    let receivedDraft: unknown = null
    let receivedUsernames: string[] = []

    const store = createInMemoryProfileStore([profile])
    const handlers = createGitUsernameWorkflowHandlers(
      store,
      createInMemoryAppSettingsStore(settings),
      {
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
      },
    )

    const roster = await handlers["gitUsernames.import"]({
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
      baseUrl: null,
      token: "token-1",
      organization: "repo-edu",
    })
    assert.deepStrictEqual(receivedUsernames, ["ada-l"])
    assert.equal(roster.students[0]?.gitUsername, "ada-l")
    assert.equal(roster.students[0]?.gitUsernameStatus, "valid")
    const reloaded = await store.loadProfile(profile.id)
    assert.equal(reloaded?.roster.students[0]?.gitUsername, "ada-l")
  })

  it("requires an active profile", async () => {
    const handlers = createGitUsernameWorkflowHandlers(
      createInMemoryProfileStore([makeProfile()]),
      createInMemoryAppSettingsStore({
        ...makeSettings(),
        activeProfileId: null,
      }),
      {
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
      },
    )

    await assert.rejects(
      handlers["gitUsernames.import"]({
        file: {
          kind: "user-file-ref",
          referenceId: "file-2",
          displayName: "usernames.csv",
          mediaType: "text/csv",
          byteLength: null,
        },
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "not-found",
    )
  })

  it("rejects non-csv imports with a validation AppError", async () => {
    const profile = makeProfile()
    const handlers = createGitUsernameWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore({
        ...makeSettings(),
        activeProfileId: profile.id,
      }),
      {
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
      },
    )

    await assert.rejects(
      handlers["gitUsernames.import"]({
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
    })
    assert.equal(lmsResult.verified, true)
    assert.equal(Number.isNaN(Date.parse(lmsResult.checkedAt)), false)
    assert.deepStrictEqual(lmsDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
    })

    const courseResult = await handlers["connection.listLmsCoursesDraft"]({
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
    })
    assert.deepStrictEqual(courseResult, [
      { id: "course-1", name: "Course One", code: "C1" },
      { id: "course-2", name: "Course Two", code: null },
    ])
    assert.deepStrictEqual(lmsCourseDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
    })

    const gitResult = await handlers["connection.verifyGitDraft"]({
      provider: "github",
      baseUrl: null,
      token: "token-2",
      organization: "repo-edu",
    })
    assert.equal(gitResult.verified, false)
    assert.equal(Number.isNaN(Date.parse(gitResult.checkedAt)), false)
    assert.deepStrictEqual(gitDraft, {
      provider: "github",
      baseUrl: null,
      token: "token-2",
      organization: "repo-edu",
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
          organization: "repo-edu",
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

describe("application profile workflow helpers", () => {
  it("lists, loads, and saves profiles through the shared profile store", async () => {
    const original = makeProfile()
    const store = createInMemoryProfileStore([original])
    const handlers = createProfileWorkflowHandlers(store)

    const listed = await handlers["profile.list"](undefined)
    assert.deepStrictEqual(listed, [
      {
        id: original.id,
        displayName: original.displayName,
        updatedAt: original.updatedAt,
      },
    ])

    const loaded = await handlers["profile.load"]({ profileId: original.id })
    assert.equal(loaded.id, original.id)

    const saved = await handlers["profile.save"]({
      ...original,
      displayName: "Updated Profile",
      updatedAt: "2000-01-01T00:00:00Z",
    })
    assert.equal(saved.displayName, "Updated Profile")
    assert.notEqual(saved.updatedAt, "2000-01-01T00:00:00Z")

    const reloaded = await handlers["profile.load"]({ profileId: original.id })
    assert.equal(reloaded.displayName, "Updated Profile")
    assert.equal(reloaded.updatedAt, saved.updatedAt)
  })

  it("returns a validation AppError when profile.save receives invalid data", async () => {
    const handlers = createProfileWorkflowHandlers(
      createInMemoryProfileStore([]),
    )

    await assert.rejects(
      handlers["profile.save"]({
        ...(makeProfile() as PersistedProfile),
        kind: "wrong-kind" as PersistedProfile["kind"],
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("returns a validation AppError when profile.load resolves invalid profile data", async () => {
    const handlers = createProfileWorkflowHandlers({
      listProfiles: () => [],
      loadProfile: () =>
        ({
          ...makeProfile(),
          kind: "wrong-kind",
        }) as unknown as PersistedProfile,
      saveProfile: (profile: PersistedProfile) => profile,
      deleteProfile: () => {},
    })

    await assert.rejects(
      handlers["profile.load"]({ profileId: "profile-1" }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("returns a validation AppError when profile.list contains invalid profile data", async () => {
    const handlers = createProfileWorkflowHandlers({
      listProfiles: () =>
        [
          {
            ...makeProfile(),
            kind: "wrong-kind",
          },
        ] as unknown as PersistedProfile[],
      loadProfile: () => makeProfile(),
      saveProfile: (profile: PersistedProfile) => profile,
      deleteProfile: () => {},
    })

    await assert.rejects(
      handlers["profile.list"](undefined),
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
      activeProfileId: "profile-1",
    })
    assert.equal(saved.activeProfileId, "profile-1")

    const reloaded = await handlers["settings.loadApp"](undefined)
    assert.equal(reloaded.activeProfileId, "profile-1")
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
    const handlers = createRosterWorkflowHandlers(
      createInMemoryProfileStore([]),
      createInMemoryAppSettingsStore(),
      {
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
      },
    )

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

  it("imports roster from LMS using the profile connection and enforces system sets", async () => {
    const profile = {
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

    const handlers = createRosterWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(settings),
      {
        lms: {
          fetchRoster: async (draft, courseId) => {
            receivedDraft = draft
            receivedCourseId = courseId
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
      },
    )

    const roster = await handlers["roster.importFromLms"]({
      profileId: profile.id,
      courseId: "course-42",
    })

    assert.deepStrictEqual(receivedDraft, {
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "token-1",
    })
    assert.equal(receivedCourseId, "course-42")
    assert.equal(systemSetsMissing(roster), false)
  })

  it("exports students to CSV and rejects unsupported xlsx export", async () => {
    const profile = makeProfile()
    let lastWrittenText = ""

    const handlers = createRosterWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(),
      {
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
      },
    )

    const target = {
      kind: "user-save-target-ref" as const,
      referenceId: "save-1",
      displayName: "students.csv",
      suggestedFormat: "csv" as const,
    }
    const result = await handlers["roster.exportMembers"]({
      profileId: profile.id,
      target,
      format: "csv",
    })
    assert.deepStrictEqual(result, { file: target })
    assert.equal(lastWrittenText.startsWith("id,name,email"), true)

    await assert.rejects(
      handlers["roster.exportMembers"]({
        profileId: profile.id,
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
  it("discovers available LMS group sets for the profile course", async () => {
    const profile = {
      ...makeProfile(),
      lmsConnectionName: "main-lms",
      courseId: "course-42",
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

    const handlers = createGroupSetWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(settings),
      {
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
      },
    )

    const result = await handlers["groupSet.fetchAvailableFromLms"]({
      profileId: profile.id,
    })

    assert.equal(receivedCourseId, "course-42")
    assert.deepStrictEqual(result, [
      { id: "set-1", name: "Lab Teams", groupCount: 8 },
      { id: "set-2", name: "Project Teams", groupCount: 6 },
    ])
  })

  it("connects an LMS group set using a local id and persists remote linkage", async () => {
    const profile = makeProfile()
    profile.lmsConnectionName = "main-lms"
    profile.courseId = "course-42"
    profile.roster.students = [
      {
        ...profile.roster.students[0],
        id: "s-local-1",
        lmsUserId: "u-1",
      },
    ]
    profile.roster.groups = []
    profile.roster.groupSets = []

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

    const store = createInMemoryProfileStore([profile])
    const handlers = createGroupSetWorkflowHandlers(
      store,
      createInMemoryAppSettingsStore(settings),
      {
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
      },
    )

    const connected = await handlers["groupSet.connectFromLms"]({
      profileId: profile.id,
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

    const reloaded = await store.loadProfile(profile.id)
    assert.ok(reloaded)
    assert.equal(reloaded?.roster.groupSets.length, 1)
    assert.equal(reloaded?.roster.groups.length, 1)
    assert.deepStrictEqual(reloaded?.roster.groups[0], {
      id: "10",
      name: "Team 10",
      memberIds: ["s-local-1"],
      origin: "lms",
      lmsGroupId: "10",
    })
  })

  it("rejects connecting an LMS group set that is already connected", async () => {
    const profile = makeProfile()
    profile.lmsConnectionName = "main-lms"
    profile.courseId = "course-42"
    profile.roster.groupSets = [
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

    const handlers = createGroupSetWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(settings),
      {
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
      },
    )

    await assert.rejects(
      handlers["groupSet.connectFromLms"]({
        profileId: profile.id,
        remoteGroupSetId: "remote-set-1",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )
  })

  it("syncs an LMS-connected group set into the profile roster", async () => {
    const profile = makeProfile()
    profile.lmsConnectionName = "main-lms"
    profile.courseId = "course-42"
    profile.roster.students = [
      {
        ...profile.roster.students[0],
        id: "s-local-1",
        lmsUserId: "u-1",
      },
    ]
    profile.roster.groups = [
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
    profile.roster.groupSets = [
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

    const store = createInMemoryProfileStore([profile])
    const handlers = createGroupSetWorkflowHandlers(
      store,
      createInMemoryAppSettingsStore(settings),
      {
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
      },
    )

    const synced = await handlers["groupSet.syncFromLms"]({
      profileId: profile.id,
      groupSetId: "gs1",
    })

    assert.deepStrictEqual(synced.groupIds, ["g-local-1", "30"])
    assert.equal(synced.name, "Synced LMS Set")

    const reloaded = await store.loadProfile(profile.id)
    assert.ok(reloaded)
    assert.deepStrictEqual(
      reloaded?.roster.groups.map((group) => group.id).sort(),
      ["30", "g-local-1"],
    )
  })

  it("previews group-set import and reimport from csv", async () => {
    const profile = makeProfile()
    profile.roster.students = [
      {
        ...profile.roster.students[0],
        email: "s1@example.com",
      },
    ]

    const handlers = createGroupSetWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(),
      {
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
      },
    )

    const importPreview = await handlers["groupSet.previewImportFromFile"]({
      profileId: profile.id,
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
      profileId: profile.id,
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
    const profile = makeProfile()
    let lastWritten = ""

    const handlers = createGroupSetWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(),
      {
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
      },
    )

    const csvTarget = {
      kind: "user-save-target-ref" as const,
      referenceId: "save-group-csv",
      displayName: "groups.csv",
      suggestedFormat: "csv" as const,
    }
    const csvResult = await handlers["groupSet.export"]({
      profileId: profile.id,
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
      profileId: profile.id,
      groupSetId: "gs1",
      target: yamlTarget,
      format: "yaml",
    })
    assert.equal(lastWritten.includes("- group_set_id:"), true)

    await assert.rejects(
      handlers["groupSet.export"]({
        profileId: profile.id,
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
    const profile = {
      ...makeProfile(),
      gitConnectionName: "main-git",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          name: "main-git",
          provider: "github" as const,
          baseUrl: null,
          token: "token-1",
          organization: "repo-edu",
        },
      ],
    }
    let receivedRequest: unknown = null

    const handlers = createRepositoryWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(settings),
      {
        git: {
          createRepositories: async (_draft, request) => {
            receivedRequest = request
            return {
              createdCount: request.repositoryNames.length,
              repositoryUrls: [],
            }
          },
          resolveRepositoryCloneUrls: async () => ({
            resolved: [],
            missing: [],
          }),
          deleteRepositories: async () => ({
            deletedCount: 0,
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
        },
      },
    )

    const result = await handlers["repo.create"]({
      profileId: profile.id,
      assignmentId: null,
      template: null,
    })

    assert.deepStrictEqual(receivedRequest, {
      organization: "repo-edu",
      repositoryNames: ["project-1-beta"],
      template: null,
    })
    assert.equal(result.repositoriesPlanned, 1)
    assert.equal(Number.isNaN(Date.parse(result.completedAt)), false)
  })

  it("clones repositories and requires confirmation for delete", async () => {
    const profile = {
      ...makeProfile(),
      gitConnectionName: "main-git",
    }
    const settings = {
      ...makeSettings(),
      gitConnections: [
        {
          name: "main-git",
          provider: "github" as const,
          baseUrl: null,
          token: "token-1",
          organization: "repo-edu",
        },
      ],
    }
    const cloneCommands: string[][] = []
    let deleteRequest: unknown = null

    const handlers = createRepositoryWorkflowHandlers(
      createInMemoryProfileStore([profile]),
      createInMemoryAppSettingsStore(settings),
      {
        git: {
          createRepositories: async () => ({
            createdCount: 0,
            repositoryUrls: [],
          }),
          resolveRepositoryCloneUrls: async (_draft, request) => ({
            resolved: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
            })),
            missing: [],
          }),
          deleteRepositories: async (_draft, request) => {
            deleteRequest = request
            return {
              deletedCount: request.repositoryNames.length,
              missing: [],
            }
          },
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
          applyBatch: async () => ({ completed: [] }),
        },
      },
    )

    const cloneResult = await handlers["repo.clone"]({
      profileId: profile.id,
      assignmentId: null,
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
    })
    assert.equal(cloneResult.repositoriesPlanned, 1)
    assert.deepStrictEqual(cloneCommands[0], [
      "clone",
      "https://x-access-token:token-1@github.com/repo-edu/project-1-beta.git",
      "/work/repos/project-1-beta",
    ])

    await assert.rejects(
      handlers["repo.delete"]({
        profileId: profile.id,
        assignmentId: null,
        template: null,
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "validation",
    )

    const deleteResult = await handlers["repo.delete"]({
      profileId: profile.id,
      assignmentId: null,
      template: null,
      confirmDelete: true,
    })
    assert.equal(deleteResult.repositoriesPlanned, 1)
    assert.deepStrictEqual(deleteRequest, {
      organization: "repo-edu",
      repositoryNames: ["project-1-beta"],
    })
  })
})
