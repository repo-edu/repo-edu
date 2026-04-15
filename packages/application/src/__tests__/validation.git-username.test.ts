import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GitUsernameImportInput } from "@repo-edu/application-contract"
import { createGitUsernameWorkflowHandlers } from "../git-username-workflows.js"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"

describe("application git username workflow helpers", () => {
  it("imports Git usernames by student email and verifies status with provider", async () => {
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course, settings }) => {
        course.organization = "repo-edu"
        course.roster.students = [
          {
            ...course.roster.students[0],
            email: "s1@example.com",
          },
        ]
        settings.activeCourseId = course.id
        settings.gitConnections = [
          {
            id: "main-git",
            provider: "github",
            baseUrl: "https://github.com",
            token: "token-1",
            userAgent: "  Name / Organization / email@example.edu  ",
          },
        ]
        settings.activeGitConnectionId = "main-git"
      },
    )
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
      userAgent: "Name / Organization / email@example.edu",
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
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course, settings }) => {
        course.organization = "repo-edu"
        settings.activeCourseId = course.id
        settings.gitConnections = [
          {
            id: "main-git",
            provider: "github",
            baseUrl: "https://github.com",
            token: "token-1",
          },
        ]
        settings.activeGitConnectionId = "main-git"
      },
    )
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
