import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { systemSetsMissing } from "@repo-edu/domain/group-set"
import { createRosterWorkflowHandlers } from "../roster-workflows.js"
import {
  getCourseAndSettingsScenario,
  getCourseScenario,
} from "./helpers/fixture-scenarios.js"

describe("application roster workflow helpers", () => {
  it("imports students from CSV file and ensures system group sets", async () => {
    const course = getCourseScenario({ tier: "small", preset: "shared-teams" })
    course.roster = {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    }

    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async () => [],
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

    const imported = await handlers["roster.importFromFile"]({
      course,
      file: {
        kind: "user-file-ref",
        referenceId: "file-1",
        displayName: "students.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })

    assert.equal(imported.roster.students.length, 2)
    assert.equal(systemSetsMissing(imported.roster), false)
    assert.equal(imported.roster.connection?.kind, "import")
    assert.equal(
      imported.idSequences.nextMemberSeq > course.idSequences.nextMemberSeq,
      true,
    )
  })

  it("upserts matched members and allocates IDs only for new members", async () => {
    const course = getCourseScenario({ tier: "small", preset: "shared-teams" })
    const existing = course.roster.students.find(
      (member) => member.email.trim().length > 0,
    )
    assert.ok(existing)
    const previousNextMemberSeq = course.idSequences.nextMemberSeq

    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async () => [],
      },
      userFile: {
        readText: async () => ({
          displayName: "students.csv",
          mediaType: "text/csv",
          text: [
            "name,email,student_number,git_username",
            `Updated Name,${existing.email},7777,updated-user`,
            "New Person,new-person@example.com,8888,new-user",
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

    const imported = await handlers["roster.importFromFile"]({
      course,
      file: {
        kind: "user-file-ref",
        referenceId: "file-upsert",
        displayName: "students.csv",
        mediaType: "text/csv",
        byteLength: null,
      },
    })

    const updatedMember = imported.roster.students.find(
      (member) => member.id === existing.id,
    )
    assert.ok(updatedMember)
    assert.equal(updatedMember.name, "Updated Name")
    assert.equal(updatedMember.gitUsername, "updated-user")

    const createdMember = imported.roster.students.find(
      (member) => member.email === "new-person@example.com",
    )
    assert.ok(createdMember)
    assert.equal(createdMember.id !== existing.id, true)
    assert.equal(imported.idSequences.nextMemberSeq, previousNextMemberSeq + 1)
  })

  it("fails roster import when CSV rows violate student schema", async () => {
    const course = getCourseScenario({ tier: "small", preset: "shared-teams" })
    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async () => [],
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
          course,
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
    const { course, settings } = getCourseAndSettingsScenario(
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

    let receivedDraft: unknown = null
    let receivedCourseId = ""
    const progressLabels: string[] = []

    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async (draft, courseId, _signal, onProgress) => {
          receivedDraft = draft
          receivedCourseId = courseId
          onProgress?.("Loaded 1 enrolled users from LMS.")
          return [
            {
              id: "remote-member-1",
              lmsUserId: "u-1",
              name: "Ada",
              email: "ada@example.com",
              studentNumber: null,
              enrollmentType: "student",
              enrollmentDisplay: null,
              status: "active",
              lmsStatus: null,
              source: "canvas",
            },
          ]
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
      userAgent: undefined,
    })
    assert.equal(receivedCourseId, "course-42")
    assert.equal(
      progressLabels.includes("Loaded 1 enrolled users from LMS."),
      true,
    )
    assert.equal(systemSetsMissing(imported.roster), false)
  })

  it("exports students to CSV and rejects unsupported xlsx export", async () => {
    const course = getCourseScenario({
      tier: "small",
      preset: "shared-teams",
    })
    let lastWrittenText = ""

    const handlers = createRosterWorkflowHandlers({
      lms: {
        fetchRoster: async () => [],
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
    assert.equal(lastWrittenText.startsWith("name,email"), true)

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
