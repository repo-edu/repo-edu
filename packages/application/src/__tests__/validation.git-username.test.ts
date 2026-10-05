import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { GitUsernameImportInput } from "@repo-edu/application-contract"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { splitAppSettings } from "@repo-edu/domain/settings"
import type { GitEffectFailure } from "@repo-edu/integrations-git-contract"
import {
  createGitUsernameWorkflowHandlers,
  type GitUsernameWorkflowPorts,
} from "../git-username-workflows.js"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"

function gitEffectFailure(
  disposition: GitEffectFailure["disposition"],
  message: string,
): GitEffectFailure {
  return Object.assign(new Error(message), {
    type: "git-effect" as const,
    disposition,
  })
}

/** Imports one student's username with a Git connection configured, so the
 * provider is asked about exactly 'ada-l'. */
function importWithProvider(
  verifyGitUsernames: GitUsernameWorkflowPorts["git"]["verifyGitUsernames"],
) {
  const { course, settings } = getCourseAndSettingsScenario(
    { tier: "small", preset: "shared-teams" },
    ({ course, settings }) => {
      course.roster.students = [
        { ...course.roster.students[0], email: "s1@example.com" },
      ]
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
        displayName: "git-usernames.csv",
        mediaType: "text/csv",
        text: "email,git_username\ns1@example.com,ada-l",
        byteLength: 0,
      }),
      writeText: async () => {
        throw new Error("Import never writes a file.")
      },
    },
    git: { verifyGitUsernames },
  })
  return handlers["gitUsernames.import"]({
    course,
    credentials: splitAppSettings(settings).credentials,
    file: {
      kind: "user-file-ref",
      referenceId: "file-4",
      displayName: "git-usernames.csv",
      mediaType: "text/csv",
      byteLength: null,
    },
  })
}

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
        settings.activeSurface = { kind: "course", courseId: course.id }
        settings.gitConnections = [
          {
            id: "main-git",
            provider: "github",
            baseUrl: "https://github.com",
            token: "token-1",
            userAgent: "  Name / Organization / email@example.com  ",
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
      credentials: splitAppSettings(settings).credentials,
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
      userAgent: "Name / Organization / email@example.com",
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
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "refused" &&
        typeof error.outcome.error === "object" &&
        error.outcome.error !== null &&
        "type" in error.outcome.error &&
        error.outcome.error.type === "validation",
    )
  })

  it("rejects non-csv imports with a validation AppError", async () => {
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course, settings }) => {
        course.organization = "repo-edu"
        settings.activeSurface = { kind: "course", courseId: course.id }
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
        credentials: splitAppSettings(settings).credentials,
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
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "refused" &&
        typeof error.outcome.error === "object" &&
        error.outcome.error !== null &&
        "type" in error.outcome.error &&
        error.outcome.error.type === "validation",
    )
  })

  it("refuses the import when the provider cannot answer a lookup", async () => {
    await assert.rejects(
      importWithProvider(async () => {
        throw gitEffectFailure("completed", "Bad credentials")
      }),
      (error: unknown) =>
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "refused" &&
        error.message === "Bad credentials",
    )
  })

  it("stops the import on the provider's proven stop", async () => {
    await assert.rejects(
      importWithProvider(async () => {
        throw gitEffectFailure("stopped", "Operation cancelled.")
      }),
      (error: unknown) => {
        assert.ok(error instanceof CommandOutcomeError)
        assert.deepEqual(error.outcome, {
          disposition: "stopped",
          result: null,
        })
        return true
      },
    )
  })

  it("refuses the import when the reply leaves out a requested username", async () => {
    await assert.rejects(
      importWithProvider(async () => []),
      (error: unknown) =>
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "refused" &&
        error.message === "The Git server gave no answer for username 'ada-l'.",
    )
  })
})
