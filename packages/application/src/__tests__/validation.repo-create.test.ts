import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"
import { createRepoHarness } from "./helpers/repo-workflow-harness.js"

function planForAssignment(course: PersistedCourse, assignmentId: string) {
  const assignment = course.roster.assignments.find(
    (entry) => entry.id === assignmentId,
  )
  assert.ok(assignment)
  const groupSet = course.roster.groupSets.find(
    (entry) => entry.id === assignment.groupSetId,
  )
  const plan = planRepositoryOperation(
    course.roster,
    assignmentId,
    groupSet?.repoNameTemplate ?? undefined,
  )
  assert.equal(plan.ok, true)
  if (!plan.ok) {
    throw new Error("Expected repository planning to succeed.")
  }
  return plan.value
}

describe("application repository create workflow helpers", () => {
  it("creates repositories from assignment planning output", async () => {
    let requestedOrganization = ""
    let requestedVisibility = ""
    let requestedAutoInit = false
    const requestedRepositoryNames = new Set<string>()
    const { course, settings, handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => {
          requestedOrganization = request.organization
          requestedVisibility = request.visibility
          requestedAutoInit = request.autoInit
          for (const repositoryName of request.repositoryNames) {
            requestedRepositoryNames.add(repositoryName)
          }
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
    const plan = planForAssignment(course, "a1")
    const plannedRepositoryNames = new Set(
      plan.groups.map((group) => group.repoName),
    )

    assert.equal(requestedOrganization, "repo-edu")
    assert.equal(requestedVisibility, "private")
    assert.equal(requestedAutoInit, true)
    assert.deepStrictEqual(requestedRepositoryNames, plannedRepositoryNames)
    assert.equal(result.repositoriesPlanned, plan.groups.length)
    assert.equal(result.repositoriesCreated, plannedRepositoryNames.size)
    assert.equal(result.repositoriesAlreadyExisted, 0)
    assert.equal(result.repositoriesFailed, 0)
    assert.equal(Number.isNaN(Date.parse(result.completedAt)), false)
  })

  it("creates repositories from hybrid fixture scenarios", async () => {
    let requestedOrganization = ""
    const requestedRepositoryNames = new Set<string>()
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
          for (const repositoryName of request.repositoryNames) {
            requestedRepositoryNames.add(repositoryName)
          }
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
    const plan = planForAssignment(course, "a1")
    const plannedRepositoryNames = new Set(
      plan.groups.map((group) => group.repoName),
    )

    assert.equal(requestedOrganization, "hybrid-org")
    assert.deepStrictEqual(requestedRepositoryNames, plannedRepositoryNames)
    assert.equal(result.repositoriesPlanned, plan.groups.length)
    assert.equal(result.repositoriesCreated, plannedRepositoryNames.size)
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

  it("reports alreadyExisted and failed buckets in repo.create result", async () => {
    const requestedRepositoryNames = new Set<string>()
    const { course, settings, handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => {
          for (const repositoryName of request.repositoryNames) {
            requestedRepositoryNames.add(repositoryName)
          }
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
    const plan = planForAssignment(course, "a1")
    const plannedRepositoryNames = new Set(
      plan.groups.map((group) => group.repoName),
    )

    assert.deepStrictEqual(requestedRepositoryNames, plannedRepositoryNames)
    assert.equal(result.repositoriesPlanned, plan.groups.length)
    assert.equal(result.repositoriesCreated, 0)
    assert.equal(result.repositoriesAlreadyExisted, plannedRepositoryNames.size)
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
