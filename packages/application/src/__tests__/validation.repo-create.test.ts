import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import { splitAppSettings } from "@repo-edu/domain/settings"
import type {
  PersistedCourse,
  RepositoryTemplate,
} from "@repo-edu/domain/types"
import type {
  FileSystemBatchRequest,
  FileSystemBatchResult,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type { RepositoryWorkflowPorts } from "../repository-workflows.js"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"
import {
  createRepoHarness,
  gitAnswer,
  gitEffect,
  hasDisposition,
  knownPortFailure,
  localTemplate,
  lostGitResult,
  readGitCall,
  remoteTemplate,
  templateCheckoutPath,
} from "./helpers/repo-workflow-harness.js"

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
            cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
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
          const { args } = readGitCall(request)
          if (args[0] === "push") cloneUrls.push(args[1] ?? "")
          return gitAnswer(args[0] === "symbolic-ref" ? "main\n" : "sha\n")
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
    assert.ok(cloneUrls.every((url) => url.includes("x-access-token:token-1@")))
  })

  it("pushes and records the template commit it read before pushing", async () => {
    for (const branch of ["trunk", null] as const) {
      const refspecs: string[] = []
      const warnings: string[] = []
      const { course, settings, handlers } = createRepoHarness({
        gitCommand: {
          run: async (request) => {
            const { args } = readGitCall(request)
            if (args[0] === "push") refspecs.push(args[2] ?? "")
            if (args[0] === "symbolic-ref" && branch === null) {
              return gitAnswer("", "fatal: ref HEAD is not a symbolic ref", 128)
            }
            return gitAnswer(
              args[0] === "symbolic-ref" ? `${branch}\n` : "abc1234\n",
            )
          },
        },
      })

      const result = await handlers["repo.create"](
        {
          course,
          credentials: settings,
          assignmentId: "a1",
          template: {
            kind: "local",
            path: "/course-template",
            visibility: "private",
          },
        },
        {
          onOutput: (output) => {
            if (output.channel === "warn") warnings.push(output.message)
          },
        },
      )

      if (branch === null) {
        assert.deepEqual(refspecs, [])
        assert.deepEqual(result.templateCommitShas, {})
        assert.ok(
          warnings.some((warning) => warning.includes("not a symbolic ref")),
        )
      } else {
        assert.ok(refspecs.length > 0)
        assert.ok(
          refspecs.every((refspec) => refspec === "abc1234:refs/heads/trunk"),
        )
        assert.equal(result.templateCommitShas.a1, "abc1234")
      }
    }
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

  it("goes on past one refused team write and records every repository", async () => {
    for (const failedOperation of ["create", "assign"] as const) {
      const teamNames: string[] = []
      const assignedTeams: string[] = []
      const warnings: string[] = []
      const refuse = () => {
        throw Object.assign(new Error("Team name is rejected."), {
          type: "git-effect" as const,
          disposition: "completed" as const,
        })
      }
      const { course, settings, handlers } = createRepoHarness({
        git: {
          createTeam: async (_draft, request) => {
            teamNames.push(request.teamName)
            if (failedOperation === "create" && teamNames.length === 1) refuse()
            return {
              created: true,
              teamSlug: request.teamName,
              membersAdded: request.memberUsernames,
              membersNotFound: [],
            }
          },
          assignRepositoriesToTeam: async (_draft, request) => {
            if (
              failedOperation === "assign" &&
              request.teamSlug === teamNames[0]
            )
              refuse()
            assignedTeams.push(request.teamSlug)
          },
        },
      })

      const result = await handlers["repo.create"](
        {
          course,
          credentials: settings,
          assignmentId: "a1",
          template: null,
        },
        {
          onOutput: (output) => {
            if (output.channel === "warn") warnings.push(output.message)
          },
        },
      )
      const plan = planForAssignment(course, "a1")

      assert.equal(teamNames.length > 1, true)
      assert.deepStrictEqual(assignedTeams, teamNames.slice(1))
      assert.equal(
        Object.keys(result.recordedRepositories.a1 ?? {}).length,
        plan.groups.length,
      )
      assert.equal(
        warnings.some((message) =>
          message.includes(`'${teamNames[0]}': Team name is rejected.`),
        ),
        true,
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
            userAgent: "  Name / Organization / email@example.com  ",
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
      userAgent: "Name / Organization / email@example.com",
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
        assert.ok(error instanceof CommandOutcomeError)
        assert.equal(error.outcome.disposition, "refused")
        if (error.outcome.disposition !== "refused") return false
        error = error.outcome.error
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

type GitCall = { folder: string | undefined; args: string[]; cwd?: string }

function setUpCreate(
  setup: {
    template?: RepositoryTemplate | null
    git?: Partial<RepositoryWorkflowPorts["git"]>
    answer?: (call: GitCall) => ProcessResult | undefined
    applyBatch?: (request: FileSystemBatchRequest) => FileSystemBatchResult
    createTempDirectory?: () => Promise<string>
  } = {},
) {
  const gitCalls: GitCall[] = []
  const deleted: string[] = []
  const warnings: string[] = []
  const teams: string[] = []
  const { course, settings, handlers } = createRepoHarness({
    git: {
      resolveRepositoryCloneUrls: async (_draft, request) => ({
        resolved: request.repositoryNames.map((repositoryName) => ({
          repositoryName,
          cloneUrl: `https://x-access-token:token-1@github.com/${request.organization}/${repositoryName}.git`,
        })),
        missing: [],
      }),
      createTeam: async (_draft, request) => {
        teams.push(request.teamName)
        return {
          created: true,
          teamSlug: request.teamName,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        }
      },
      ...setup.git,
    },
    gitCommand: {
      run: async (request) => {
        const call = { ...readGitCall(request), cwd: request.cwd }
        gitCalls.push(call)
        const answered = setup.answer?.(call)
        if (answered !== undefined) return answered
        if (call.args[0] === "rev-parse") return gitAnswer("abc1234\n")
        if (call.args[0] === "symbolic-ref") return gitAnswer("main\n")
        return gitAnswer("")
      },
    },
    fileSystem: {
      applyBatch: async (request) => {
        for (const operation of request.operations) {
          if (operation.kind === "delete-path") deleted.push(operation.path)
        }
        return (
          setup.applyBatch?.(request) ?? { completed: [...request.operations] }
        )
      },
      createTempDirectory: setup.createTempDirectory,
    },
  })
  const run = () =>
    handlers["repo.create"](
      {
        course,
        credentials: settings,
        assignmentId: "a1",
        template:
          setup.template === undefined ? remoteTemplate : setup.template,
      },
      {
        onOutput: (output) => {
          if (output.channel === "warn") warnings.push(output.message)
        },
      },
    )
  const pushes = () => gitCalls.filter((call) => call.args[0] === "push")
  return { run, gitCalls, pushes, deleted, warnings, teams }
}

describe("repo.create answers every outside call", () => {
  it("pushes a remote template from one temporary clone and removes the clone", async () => {
    const create = setUpCreate()

    const result = await create.run()

    const clone = create.gitCalls.find((call) => call.args[0] === "clone")
    assert.deepEqual(clone?.args, [
      "clone",
      "--single-branch",
      "https://x-access-token:token-1@github.com/template-org/course-template.git",
      templateCheckoutPath,
    ])
    assert.equal(create.pushes().length, result.repositoriesCreated)
    assert.ok(
      create.pushes().every((call) => call.folder === templateCheckoutPath),
    )
    assert.equal(result.templateCommitShas.a1, "abc1234")
    assert.deepEqual(create.deleted, [templateCheckoutPath])
  })

  it("warns and pushes nothing when a remote template cannot be cloned", async () => {
    const cases = [
      {
        setup: {
          git: {
            resolveRepositoryCloneUrls: async () => ({
              resolved: [],
              missing: ["course-template"],
            }),
          },
        },
        detail:
          "the Git server has no repository 'template-org/course-template'.",
      },
      {
        setup: {
          answer: (call: GitCall) =>
            call.args[0] === "clone"
              ? gitAnswer("", "fatal: repository not found", 128)
              : undefined,
        },
        detail: "fatal: repository not found",
      },
    ]
    for (const { setup, detail } of cases) {
      const create = setUpCreate(setup)

      const result = await create.run()

      assert.deepEqual(create.warnings, [
        `Could not clone template 'template-org/course-template (private)': ${detail}`,
      ])
      assert.deepEqual(create.pushes(), [])
      assert.deepEqual(result.templateCommitShas, {})
      assert.ok(create.teams.length > 0)
      assert.deepEqual(create.deleted, [templateCheckoutPath])
    }
  })

  it("keeps the temporary clone when the clone or a push loses its result", async () => {
    for (const command of ["clone", "push"]) {
      const create = setUpCreate({
        answer: (call) => {
          if (call.args[0] === command) throw lostGitResult()
          return undefined
        },
      })

      await assert.rejects(create.run(), hasDisposition("uncertain"))
      assert.deepEqual(create.deleted, [])
    }
  })

  it("removes the temporary clone after a known failure or a stop", async () => {
    const cases = [
      {
        setup: {
          git: {
            resolveRepositoryCloneUrls: async () => {
              throw gitEffect("completed", "GET /repos answered 500")
            },
          },
        },
        disposition: "completed" as const,
      },
      {
        setup: {
          answer: (call: GitCall) => {
            if (call.args[0] === "push")
              throw new CommandOutcomeError({
                disposition: "stopped",
                result: null,
              })
            return undefined
          },
        },
        disposition: "stopped" as const,
      },
    ]
    for (const { setup, disposition } of cases) {
      const create = setUpCreate(setup)

      await assert.rejects(create.run(), hasDisposition(disposition))
      assert.deepEqual(create.deleted, [templateCheckoutPath])
    }
  })

  it("warns for a push Git refuses and records the commit it pushed elsewhere", async () => {
    let pushes = 0
    const create = setUpCreate({
      answer: (call) => {
        if (call.args[0] !== "push") return undefined
        pushes += 1
        return pushes === 1
          ? gitAnswer("", "remote: Permission denied", 1)
          : gitAnswer("")
      },
    })

    const result = await create.run()

    assert.equal(create.pushes().length, result.repositoriesCreated)
    assert.equal(create.warnings.length, 1)
    assert.match(create.warnings[0] ?? "", /remote: Permission denied/)
    assert.equal(result.templateCommitShas.a1, "abc1234")
  })

  it("names a missing local template folder and goes on with the teams", async () => {
    const create = setUpCreate({
      template: localTemplate,
      answer: (call) =>
        call.folder === "/course-template"
          ? gitAnswer(
              "",
              "fatal: cannot change to '/course-template': No such file or directory",
              128,
            )
          : undefined,
    })

    const result = await create.run()

    assert.deepEqual(create.warnings, [
      "Template 'local:/course-template (private)' has no readable commit on a branch to push: fatal: cannot change to '/course-template': No such file or directory",
    ])
    assert.deepEqual(create.pushes(), [])
    assert.deepEqual(result.templateCommitShas, {})
    assert.ok(create.teams.length > 0)
    assert.ok(create.gitCalls.every((call) => call.cwd === undefined))
    assert.deepEqual(create.deleted, [])
  })

  it("warns when the temporary clone cannot be removed", async () => {
    const create = setUpCreate({
      applyBatch: () => {
        throw knownPortFailure("EBUSY: resource busy")
      },
    })

    const result = await create.run()

    assert.equal(result.templateCommitShas.a1, "abc1234")
    assert.deepEqual(create.warnings, [
      `Could not remove the temporary folder '${templateCheckoutPath}': EBUSY: resource busy`,
    ])
  })

  it("passes on a temporary folder the host cannot create", async () => {
    const create = setUpCreate({
      createTempDirectory: async () => {
        throw knownPortFailure("ENOSPC: no space left on device")
      },
    })

    await assert.rejects(
      create.run(),
      hasDisposition("completed", "ENOSPC: no space left on device"),
    )
    assert.equal(create.gitCalls.length, 0)
  })

  it("answers a repository create the Git server refuses, stops or fails for every repository", async () => {
    const cases = [
      {
        createRepositories: async () => {
          throw gitEffect("completed", "POST /orgs/repo-edu/repos answered 403")
        },
        disposition: "completed" as const,
        message: "answered 403",
      },
      {
        createRepositories: async () => {
          throw gitEffect("stopped", "Operation cancelled.")
        },
        disposition: "stopped" as const,
        message: undefined,
      },
      {
        createRepositories: async (
          _draft: unknown,
          request: { repositoryNames: string[] },
        ) => ({
          created: [],
          alreadyExisted: [],
          failed: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            reason: "name is reserved",
          })),
        }),
        disposition: "completed" as const,
        message: "Repository creation failed for all planned repositories.",
      },
    ]
    for (const { createRepositories, disposition, message } of cases) {
      const create = setUpCreate({
        template: null,
        git: { createRepositories },
      })

      await assert.rejects(create.run(), hasDisposition(disposition, message))
      assert.deepEqual(create.teams, [])
    }
  })

  it("ends on a stopped team write", async () => {
    for (const failedOperation of ["create", "assign"] as const) {
      const stop = () => {
        throw gitEffect("stopped", "Operation cancelled.")
      }
      const create = setUpCreate({
        template: null,
        git: {
          createTeam: async (_draft, request) => {
            if (failedOperation === "create") stop()
            return {
              created: true,
              teamSlug: request.teamName,
              membersAdded: request.memberUsernames,
              membersNotFound: [],
            }
          },
          assignRepositoriesToTeam: async () => {
            if (failedOperation === "assign") stop()
          },
        },
      })

      await assert.rejects(create.run(), hasDisposition("stopped"))
    }
  })
})
