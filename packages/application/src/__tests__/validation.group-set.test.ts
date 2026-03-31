import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GroupSetWorkflowPorts } from "../group-set-workflows.js"
import { createGroupSetWorkflowHandlers } from "../group-set-workflows.js"
import {
  getCourseAndSettingsScenario,
  getCourseScenario,
} from "./helpers/fixture-scenarios.js"

function createGroupSetHarness(options: {
  lms?: Partial<GroupSetWorkflowPorts["lms"]>
  userFile?: {
    readText?: GroupSetWorkflowPorts["userFile"]["readText"]
  }
}) {
  return createGroupSetWorkflowHandlers({
    lms: {
      listGroupSets:
        options.lms?.listGroupSets ??
        (async () => {
          throw new Error("not used")
        }),
      fetchGroupSet:
        options.lms?.fetchGroupSet ??
        (async () => {
          throw new Error("not used")
        }),
    },
    userFile: {
      readText:
        options.userFile?.readText ??
        (async () => {
          throw new Error("not used")
        }),
      writeText: async (reference) => ({
        displayName: reference.displayName,
        mediaType: "text/csv",
        byteLength: 0,
        savedAt: "2026-03-04T10:00:00.000Z",
      }),
    },
  })
}

function createLmsScenario() {
  return getCourseAndSettingsScenario(
    { tier: "small", preset: "shared-teams" },
    ({ course, settings }) => {
      course.lmsConnectionName = "main-lms"
      course.lmsCourseId = "course-42"
      settings.activeCourseId = course.id
      settings.lmsConnections = [
        {
          name: "main-lms",
          provider: "canvas",
          baseUrl: "https://canvas.example.edu",
          token: "token-1",
        },
      ]
    },
  )
}

describe("application group-set workflow helpers", () => {
  it("discovers available LMS group sets for the course course", async () => {
    const { course, settings } = createLmsScenario()
    let receivedCourseId = ""

    const handlers = createGroupSetHarness({
      lms: {
        listGroupSets: async (_draft, courseId) => {
          receivedCourseId = courseId
          return [
            { id: "set-1", name: "Lab Teams", groupCount: 8 },
            { id: "set-2", name: "Project Teams", groupCount: 6 },
          ]
        },
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
    const { course, settings } = createLmsScenario()
    course.roster.students = [
      {
        ...course.roster.students[0],
        id: "m_0001",
        lmsUserId: "u-1",
      },
    ]
    course.roster.groups = []
    course.roster.groupSets = []

    let fetchDraft: unknown = null
    let fetchCourseId = ""
    let fetchGroupSetId = ""

    const handlers = createGroupSetHarness({
      lms: {
        fetchGroupSet: async (draft, courseId, groupSetId) => {
          fetchDraft = draft
          fetchCourseId = courseId
          fetchGroupSetId = groupSetId
          return {
            groupSet: {
              id: "remote-set-1",
              name: "Project Groups",
            },
            groups: [
              {
                id: "10",
                name: "Team 10",
                memberLmsUserIds: ["u-1"],
              },
            ],
          }
        },
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
    assert.equal(connected.id.startsWith("gs_"), true)
    assert.notEqual(connected.id, "remote-set-1")
    assert.equal(connected.name, "Project Groups")
    assert.equal(connected.connection?.kind, "canvas")
    if (connected.connection?.kind === "canvas") {
      assert.equal(connected.connection.groupSetId, "remote-set-1")
    }

    assert.equal(connected.roster.groupSets.length, 1)
    assert.equal(connected.roster.groups.length, 1)
    assert.equal(connected.roster.groups[0]?.name, "Team 10")
    assert.deepStrictEqual(connected.roster.groups[0]?.memberIds, ["m_0001"])
    assert.equal(connected.roster.groups[0]?.lmsGroupId, "10")
  })

  it("rejects connecting an LMS group set that is already connected", async () => {
    const { course, settings } = createLmsScenario()
    course.roster.groupSets = [
      {
        id: "gs_0001",
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

    const handlers = createGroupSetHarness({ lms: {} })

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
    const { course, settings } = createLmsScenario()
    course.roster.students = [
      {
        ...course.roster.students[0],
        id: "m_0001",
        lmsUserId: "u-1",
      },
    ]
    course.roster.groups = [
      {
        id: "g_0001",
        name: "Old Name",
        memberIds: ["m_0001"],
        origin: "lms",
        lmsGroupId: "10",
      },
      {
        id: "g_0002",
        name: "Will Remove",
        memberIds: [],
        origin: "lms",
        lmsGroupId: "20",
      },
    ]
    course.roster.groupSets = [
      {
        id: "gs_0002",
        name: "Imported LMS Set",
        groupIds: ["g_0001", "g_0002"],
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

    const handlers = createGroupSetHarness({
      lms: {
        fetchGroupSet: async () => ({
          groupSet: {
            id: "remote-set-1",
            name: "Synced LMS Set",
          },
          groups: [
            {
              id: "10",
              name: "Group 10",
              memberLmsUserIds: ["u-1"],
            },
            {
              id: "30",
              name: "Group 30",
              memberLmsUserIds: ["missing-user", "u-1"],
            },
          ],
        }),
      },
    })

    const synced = await handlers["groupSet.syncFromLms"]({
      course,
      appSettings: settings,
      groupSetId: "gs_0002",
    })

    assert.equal(synced.groupIds.includes("g_0001"), true)
    assert.equal(synced.groupIds.length, 2)
    assert.equal(synced.name, "Synced LMS Set")

    const syncedGroups = synced.roster.groups.filter(
      (group) => group.lmsGroupId === "10" || group.lmsGroupId === "30",
    )
    assert.equal(syncedGroups.length, 2)
    assert.equal(
      syncedGroups.some((group) => group.id === "g_0001"),
      true,
    )
  })

  it("previews group-set import and reimport from csv", async () => {
    const course = getCourseScenario({ tier: "small", preset: "shared-teams" })
    course.roster.students = [
      { ...course.roster.students[0], email: "s1@example.com" },
    ]
    const editableGroupSet = course.roster.groupSets.find(
      (groupSet) => groupSet.connection === null,
    )
    assert.ok(editableGroupSet)
    const editableGroup = course.roster.groups.find(
      (group) => group.id === editableGroupSet.groupIds[0],
    )
    assert.ok(editableGroup)
    const renamedGroupName = `Renamed ${editableGroup.name}`

    const handlers = createGroupSetHarness({
      lms: {},
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
              "group_name,email",
              `${renamedGroupName},s1@example.com`,
            ].join("\n"),
          }
        },
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
      format: "group-set-csv",
      targetGroupSetId: null,
    })
    assert.equal(importPreview.mode, "import")
    assert.deepStrictEqual(importPreview.groups, [
      { name: "Team A", memberCount: 1 },
    ])

    const reimportPreview = await handlers["groupSet.previewImportFromFile"]({
      course,
      file: {
        kind: "user-file-ref",
        referenceId: "reimport-file",
        displayName: "group-reimport.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
      format: "group-set-csv",
      targetGroupSetId: editableGroupSet.id,
    })
    assert.equal(reimportPreview.mode, "import")
    if (reimportPreview.mode !== "import") {
      return
    }
    assert.equal(reimportPreview.groups.length > 0, true)
  })

  it("exports group sets to csv/yaml and rejects xlsx", async () => {
    const course = getCourseScenario({ tier: "small", preset: "shared-teams" })
    const exportGroupSet = course.roster.groupSets.find(
      (groupSet) => groupSet.connection === null,
    )
    assert.ok(exportGroupSet)
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
      groupSetId: exportGroupSet.id,
      target: csvTarget,
      format: "csv",
    })
    assert.deepStrictEqual(csvResult, { file: csvTarget })
    assert.equal(lastWritten.startsWith("group_name,name,email"), true)

    const yamlTarget = {
      ...csvTarget,
      referenceId: "save-group-yaml",
      displayName: "groups.yaml",
      suggestedFormat: "yaml" as const,
    }
    await handlers["groupSet.export"]({
      course,
      groupSetId: exportGroupSet.id,
      target: yamlTarget,
      format: "yaml",
    })
    assert.equal(lastWritten.includes("\tmembers:["), true)

    await assert.rejects(
      handlers["groupSet.export"]({
        course,
        groupSetId: exportGroupSet.id,
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
