import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"
import { createRepoHarness } from "./helpers/repo-workflow-harness.js"

describe("application repository create workflow helpers", () => {
  it("creates repositories from assignment planning output", async () => {
    let requestedOrganization = ""
    let requestedVisibility = ""
    let requestedAutoInit = false
    let requestedRepositoryCount = 0
    const { course, settings, handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => {
          requestedOrganization = request.organization
          requestedVisibility = request.visibility
          requestedAutoInit = request.autoInit
          requestedRepositoryCount = request.repositoryNames.length
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
      },
    })

    const result = await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
    })

    assert.equal(requestedOrganization, "repo-edu")
    assert.equal(requestedVisibility, "private")
    assert.equal(requestedAutoInit, true)
    assert.equal(requestedRepositoryCount > 0, true)
    assert.equal(result.repositoriesPlanned >= requestedRepositoryCount, true)
    assert.equal(result.repositoriesCreated, requestedRepositoryCount)
    assert.equal(result.repositoriesAlreadyExisted, 0)
    assert.equal(result.repositoriesFailed, 0)
    assert.equal(Number.isNaN(Date.parse(result.completedAt)), false)
  })

  it("creates repositories from hybrid fixture scenarios", async () => {
    let requestedOrganization = ""
    let requestedRepositoryCount = 0
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course }) => {
        course.organization = "hybrid-org"
      },
    )

    const { handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => {
          requestedOrganization = request.organization
          requestedRepositoryCount = request.repositoryNames.length
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/${request.organization}/${repositoryName}`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
      },
    })

    const result = await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
    })

    assert.equal(requestedOrganization, "hybrid-org")
    assert.equal(requestedRepositoryCount > 0, true)
    assert.equal(result.repositoriesPlanned, requestedRepositoryCount)
    assert.equal(result.repositoriesCreated, requestedRepositoryCount)
    assert.equal(result.repositoriesFailed, 0)
  })

  it("normalizes provider failures from repo.create", async () => {
    const { course, settings, handlers } = createRepoHarness({
      git: {
        createRepositories: async () => {
          throw new Error("provider unavailable")
        },
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
    let requestedOrganization = ""
    let requestedVisibility = ""
    let requestedAutoInit = false
    let requestedRepositoryCount = 0
    const { course, settings, handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => {
          requestedOrganization = request.organization
          requestedVisibility = request.visibility
          requestedAutoInit = request.autoInit
          requestedRepositoryCount = request.repositoryNames.length
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
      },
    })
    const assignment = course.roster.assignments.find(
      (item) => item.id === "a1",
    )
    assert.ok(assignment)
    const assignmentGroupSet = course.roster.groupSets.find(
      (groupSet) => groupSet.id === assignment.groupSetId,
    )
    assert.ok(assignmentGroupSet)
    const selectedGroupId = assignmentGroupSet.groupIds[0]
    assert.ok(selectedGroupId)

    const result = await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      groupIds: [selectedGroupId],
    })

    assert.equal(requestedOrganization, "repo-edu")
    assert.equal(requestedVisibility, "private")
    assert.equal(requestedAutoInit, true)
    assert.equal(requestedRepositoryCount, 1)
    assert.equal(result.repositoriesPlanned, 1)
    assert.equal(result.repositoriesCreated, 1)
    assert.equal(result.repositoriesAlreadyExisted, 0)
    assert.equal(result.repositoriesFailed, 0)
  })

  it("reports alreadyExisted and failed buckets in repo.create result", async () => {
    let requestedRepositoryCount = 0
    const { course, settings, handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => {
          requestedRepositoryCount = request.repositoryNames.length
          return {
            created: [],
            alreadyExisted: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
            })),
            failed: [],
          }
        },
      },
    })

    const result = await handlers["repo.create"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
    })

    assert.equal(result.repositoriesPlanned > 0, true)
    assert.equal(result.repositoriesCreated, 0)
    assert.equal(result.repositoriesAlreadyExisted, requestedRepositoryCount)
    assert.equal(result.repositoriesFailed, 0)
  })

  it("uses per-assignment template when available", async () => {
    const assignmentTemplate = {
      kind: "remote" as const,
      owner: "assignment-templates",
      name: "hw1-template",
      visibility: "private" as const,
    }
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course, settings }) => {
        course.gitConnectionId = "main-git"
        course.organization = "repo-edu"
        course.repositoryTemplate = {
          kind: "remote",
          owner: "course-templates",
          name: "default-template",
          visibility: "private",
        }
        const assignment = course.roster.assignments.find(
          (item) => item.id === "a1",
        )
        if (assignment) {
          assignment.repositoryTemplate = assignmentTemplate
        }
        settings.activeCourseId = course.id
        settings.gitConnections = [
          {
            id: "main-git",
            provider: "github",
            baseUrl: "https://github.com",
            token: "token-1",
          },
        ]
      },
    )
    let receivedVisibility: unknown = null

    const { handlers } = createRepoHarness({
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
})
