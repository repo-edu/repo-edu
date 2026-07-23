import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import { splitAppSettings } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"
import { createRepoHarness } from "./helpers/repo-workflow-harness.js"

function planForAssignment(course: PersistedCourse, assignmentId: string) {
  const plan = planRepositoryOperation(course, assignmentId, "create")
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
              cloneUrl: `https://x-access-token:token@github.com/repo-edu/${repositoryName}.git`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
      },
    })

    const result = await handlers["repo.create"]({
      course,
      credentials: settings,
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
    assert.equal(result.repositoriesAdopted, 0)
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
              cloneUrl: `https://x-access-token:token@github.com/${request.organization}/${repositoryName}.git`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
      },
    })

    const result = await handlers["repo.create"]({
      course,
      credentials: splitAppSettings(settings).credentials,
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
          credentials: settings,
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
              cloneUrl: `https://x-access-token:token@github.com/repo-edu/${repositoryName}.git`,
            })),
            failed: [],
          }
        },
      },
    })

    const result = await handlers["repo.create"]({
      course,
      credentials: settings,
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
    assert.equal(result.repositoriesAdopted, plannedRepositoryNames.size)
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
    let receivedVisibility: unknown = null

    const { handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => {
          receivedVisibility = request.visibility
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
              cloneUrl: `https://x-access-token:token@github.com/repo-edu/${repositoryName}.git`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
      },
    })

    await handlers["repo.create"]({
      course,
      credentials: splitAppSettings(settings).credentials,
      assignmentId: "a1",
      template: null,
    })

    assert.equal(receivedVisibility, assignmentTemplate.visibility)
  })

  it("pushes local templates through clone URLs returned by creation", async () => {
    const cloneUrls: string[] = []
    let resolutionCalls = 0
    const { course, settings, handlers } = createRepoHarness({
      git: {
        createRepositories: async (_draft, request) => ({
          created: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
            cloneUrl: `https://created-token@github.com/repo-edu/${repositoryName}.git`,
          })),
          alreadyExisted: [],
          failed: [],
        }),
        resolveRepositoryCloneUrls: async () => {
          resolutionCalls += 1
          return { resolved: [], missing: [] }
        },
      },
      gitCommand: {
        run: async (request) => {
          if (request.args[0] === "push") {
            cloneUrls.push(request.args[1] ?? "")
          }
          return {
            exitCode: 0,
            signal: null,
            stdout: request.args.includes("--abbrev-ref") ? "main\n" : "sha\n",
            stderr: "",
          }
        },
      },
    })

    const result = await handlers["repo.create"]({
      course,
      credentials: settings,
      assignmentId: "a1",
      template: {
        kind: "local",
        path: "/course-template",
        visibility: "private",
      },
    })

    assert.equal(resolutionCalls, 0)
    assert.equal(cloneUrls.length, result.repositoriesCreated)
    assert.ok(cloneUrls.every((url) => url.includes("created-token")))
  })

  it("does not turn caller cancellation during team setup into a warning", async () => {
    for (const failedOperation of ["create", "assign"] as const) {
      const controller = new AbortController()
      const abort = () => {
        controller.abort(new Error("stop"))
        throw new DOMException("The operation was aborted.", "AbortError")
      }
      const { course, settings, handlers } = createRepoHarness({
        git: {
          createTeam: async (_draft, request) => {
            if (failedOperation === "create") abort()
            return {
              created: true,
              teamSlug: request.teamName,
              membersAdded: request.memberUsernames,
              membersNotFound: [],
            }
          },
          assignRepositoriesToTeam: async () => {
            if (failedOperation === "assign") abort()
          },
        },
      })

      await assert.rejects(
        handlers["repo.create"](
          {
            course,
            credentials: settings,
            assignmentId: "a1",
            template: null,
          },
          { signal: controller.signal },
        ),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "type" in error &&
          error.type === "cancelled",
      )
    }
  })

  it("forwards the normalized user-agent from git connection into the adapter draft", async () => {
    let receivedDraft: unknown = null
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
            userAgent: "  Name / Organization / email@example.edu  ",
          },
        ]
        settings.activeGitConnectionId = "main-git"
      },
    )

    const { handlers } = createRepoHarness({
      git: {
        createRepositories: async (draft, request) => {
          receivedDraft = draft
          return {
            created: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
              cloneUrl: `https://x-access-token:token@github.com/repo-edu/${repositoryName}.git`,
            })),
            alreadyExisted: [],
            failed: [],
          }
        },
      },
    })

    await handlers["repo.create"]({
      course,
      credentials: splitAppSettings(settings).credentials,
      assignmentId: "a1",
      template: null,
    })

    assert.deepStrictEqual(receivedDraft, {
      provider: "github",
      baseUrl: "https://github.com",
      token: "token-1",
      userAgent: "Name / Organization / email@example.edu",
    })
  })

  it("treats empty group-set template as explicit empty template in repo.create", async () => {
    const { course, settings, handlers } = createRepoHarness()
    const assignment = course.roster.assignments.find(
      (item) => item.id === "a1",
    )
    assert.ok(assignment)
    const groupSet = course.roster.groupSets.find(
      (item) => item.id === assignment.groupSetId,
    )
    assert.ok(groupSet)
    groupSet.repoNameTemplate = ""

    await assert.rejects(
      () =>
        handlers["repo.create"]({
          course,
          credentials: settings,
          assignmentId: "a1",
          template: null,
        }),
      (error: unknown) => {
        if (typeof error !== "object" || error === null) {
          return false
        }
        if (!("type" in error) || error.type !== "validation") {
          return false
        }
        if (!("issues" in error) || !Array.isArray(error.issues)) {
          return false
        }
        return error.issues.some(
          (issue) =>
            typeof issue === "object" &&
            issue !== null &&
            "message" in issue &&
            typeof issue.message === "string" &&
            issue.message.includes("Repository name collision"),
        )
      },
    )
  })
})
