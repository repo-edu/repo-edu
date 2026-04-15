import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createRepoHarness } from "./helpers/repo-workflow-harness.js"

function planForAssignment(course: PersistedCourse, assignmentId: string) {
  const plan = planRepositoryOperation(course, assignmentId, "clone")
  assert.equal(plan.ok, true)
  if (!plan.ok) {
    throw new Error("Expected repository planning to succeed.")
  }
  return plan.value
}

describe("application repository clone workflow helpers", () => {
  it("clones repositories from assignment planning output", async () => {
    const cloneCommands: string[][] = []
    const batchOperations: Array<Array<Record<string, string>>> = []
    let requestedRepositoryNames: string[] = []

    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryNames = request.repositoryNames
          return {
            resolved: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
            })),
            missing: [],
          }
        },
      },
      gitCommand: {
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
      },
    })
    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
    })
    const plan = planForAssignment(course, "a1")
    const plannedRepositoryNames = plan.groups.map((group) => group.repoName)
    const plannedRepositorySet = new Set(plannedRepositoryNames)

    assert.equal(cloneResult.repositoriesPlanned, plan.groups.length)
    assert.equal(cloneResult.repositoriesCloned, plan.groups.length)
    assert.equal(cloneResult.repositoriesFailed, 0)

    assert.deepStrictEqual(
      new Set(requestedRepositoryNames),
      plannedRepositorySet,
    )
    assert.equal(
      cloneCommands.filter((args) => args[0] === "init").length,
      plan.groups.length,
    )
    assert.equal(
      cloneCommands.filter((args) => args[0] === "pull").length,
      plan.groups.length,
    )
    assert.equal(
      cloneCommands.filter((args) => args[0] === "remote").length,
      plan.groups.length,
    )

    const copyOperations = batchOperations.flat().filter((operation) => {
      return operation.kind === "copy-directory"
    })
    assert.equal(copyOperations.length, plan.groups.length)
    assert.deepStrictEqual(
      new Set(copyOperations.map((operation) => operation.destinationPath)),
      new Set(
        plannedRepositoryNames.map((repository) => `/work/repos/${repository}`),
      ),
    )
  })

  it("treats empty remote repositories as successful clones", async () => {
    const cloneCommands: string[][] = []
    let requestedRepositoryNames: string[] = []

    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryNames = request.repositoryNames
          return {
            resolved: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
            })),
            missing: [],
          }
        },
      },
      gitCommand: {
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
      },
    })
    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
    })
    const plan = planForAssignment(course, "a1")
    const plannedRepositorySet = new Set(
      plan.groups.map((group) => group.repoName),
    )

    assert.equal(cloneResult.repositoriesPlanned, plan.groups.length)
    assert.equal(cloneResult.repositoriesCloned, plan.groups.length)
    assert.equal(cloneResult.repositoriesFailed, 0)
    assert.deepStrictEqual(
      new Set(requestedRepositoryNames),
      plannedRepositorySet,
    )
    assert.equal(
      cloneCommands.filter((args) => args[0] === "remote").length,
      plan.groups.length,
    )
  })

  it("errors when clone target clashes with non-git directories", async () => {
    let requestedRepositoryNames: string[] = []
    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryNames = request.repositoryNames
          return {
            resolved: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
            })),
            missing: [],
          }
        },
      },
      gitCommand: {
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
        inspect: async (request) =>
          request.paths.map((path) => ({ path, kind: "directory" as const })),
      },
    })
    await assert.rejects(
      async () =>
        handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory: "/work/repos",
          directoryLayout: "flat",
        }),
      (error: unknown) => {
        const appError = error as { type?: string; message?: string }
        const plan = planForAssignment(course, "a1")
        assert.equal(appError.type, "validation", "expected validation error")
        assert.deepStrictEqual(
          new Set(requestedRepositoryNames),
          new Set(plan.groups.map((group) => group.repoName)),
        )
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
    const cloneCommands: string[][] = []
    const batchOperations: Array<Array<Record<string, string>>> = []
    let requestedRepositoryNames: string[] = []

    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryNames = request.repositoryNames
          return {
            resolved: request.repositoryNames.map((repositoryName) => ({
              repositoryName,
              cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
            })),
            missing: [],
          }
        },
      },
      gitCommand: {
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
      },
    })
    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
    })
    const plan = planForAssignment(course, "a1")

    assert.equal(cloneResult.repositoriesPlanned, plan.groups.length)
    assert.equal(cloneResult.repositoriesCloned, 0)
    assert.equal(cloneResult.repositoriesFailed, plan.groups.length)
    assert.equal(
      cloneCommands.filter((args) => args[0] === "init").length,
      plan.groups.length,
    )
    assert.equal(
      cloneCommands.filter((args) => args[0] === "pull").length,
      plan.groups.length,
    )
    assert.equal(cloneCommands.filter((args) => args[0] === "remote").length, 0)
    const copyOperations = batchOperations.flat().filter((operation) => {
      return operation.kind === "copy-directory"
    })
    assert.deepStrictEqual(copyOperations, [])
    assert.deepStrictEqual(
      new Set(requestedRepositoryNames),
      new Set(plan.groups.map((group) => group.repoName)),
    )
  })

  it("rejects relative target directories", async () => {
    const { course, settings, handlers } = createRepoHarness()

    await assert.rejects(
      async () =>
        handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory: "./repos",
          directoryLayout: "flat",
        }),
      (error: unknown) => {
        const appError = error as {
          type?: string
          message?: string
          issues?: Array<{ path?: string }>
        }
        assert.equal(appError.type, "validation")
        assert.match(appError.message ?? "", /absolute target directory/i)
        assert.equal(appError.issues?.[0]?.path, "targetDirectory")
        return true
      },
    )
  })
})
