import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createRepoHarness } from "./helpers/repo-workflow-harness.js"

describe("application repository clone workflow helpers", () => {
  it("clones repositories from selected group ids", async () => {
    const cloneCommands: string[][] = []
    const batchOperations: Array<Array<Record<string, string>>> = []
    let requestedRepositoryName = ""

    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryName = request.repositoryNames[0] ?? ""
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

    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
      groupIds: [selectedGroupId],
    })
    assert.equal(cloneResult.repositoriesPlanned, 1)
    assert.equal(cloneResult.repositoriesCloned, 1)
    assert.equal(cloneResult.repositoriesFailed, 0)
    assert.deepStrictEqual(cloneCommands[0]?.slice(0, 1), ["init"])
    assert.ok(
      cloneCommands[0]?.[1]?.includes("/work/repos/.repo-edu-clone-tmp/"),
    )
    assert.ok(cloneCommands[0]?.[1]?.endsWith("-0"))
    const tempPath = cloneCommands[0]?.[1] ?? ""
    assert.deepStrictEqual(cloneCommands[1], [
      "pull",
      `https://x-access-token:token-1@github.com/repo-edu/${requestedRepositoryName}.git`,
    ])
    assert.equal(cloneCommands[2]?.[0], "remote")
    const copyOperations = batchOperations.flat().filter((operation) => {
      return operation.kind === "copy-directory"
    })
    assert.deepStrictEqual(copyOperations, [
      {
        kind: "copy-directory",
        sourcePath: tempPath,
        destinationPath: `/work/repos/${requestedRepositoryName}`,
      },
    ])
    assert.deepStrictEqual(cloneCommands[2], [
      "remote",
      "add",
      "origin",
      `https://github.com/repo-edu/${requestedRepositoryName}.git`,
    ])
  })

  it("treats empty remote repositories as successful clones", async () => {
    const cloneCommands: string[][] = []
    let requestedRepositoryName = ""

    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryName = request.repositoryNames[0] ?? ""
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

    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
      groupIds: [selectedGroupId],
    })

    assert.equal(cloneResult.repositoriesCloned, 1)
    assert.equal(cloneResult.repositoriesFailed, 0)
    assert.deepStrictEqual(cloneCommands[2], [
      "remote",
      "add",
      "origin",
      `https://github.com/repo-edu/${requestedRepositoryName}.git`,
    ])
  })

  it("errors when clone target clashes with non-git directories", async () => {
    let requestedRepositoryName = ""
    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryName = request.repositoryNames[0] ?? ""
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

    await assert.rejects(
      async () =>
        handlers["repo.clone"]({
          course,
          appSettings: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory: "/work/repos",
          directoryLayout: "flat",
          groupIds: [selectedGroupId],
        }),
      (error: unknown) => {
        const appError = error as { type?: string; message?: string }
        assert.equal(appError.type, "validation", "expected validation error")
        assert.equal(requestedRepositoryName.length > 0, true)
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
    let requestedRepositoryName = ""

    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => {
          requestedRepositoryName = request.repositoryNames[0] ?? ""
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

    const cloneResult = await handlers["repo.clone"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: "/work/repos",
      directoryLayout: "flat",
      groupIds: [selectedGroupId],
    })

    assert.equal(cloneResult.repositoriesCloned, 0)
    assert.equal(cloneResult.repositoriesFailed, 1)
    assert.deepStrictEqual(cloneCommands[0]?.slice(0, 1), ["init"])
    assert.ok(
      cloneCommands[0]?.[1]?.includes("/work/repos/.repo-edu-clone-tmp/"),
    )
    const copyOperations = batchOperations.flat().filter((operation) => {
      return operation.kind === "copy-directory"
    })
    assert.deepStrictEqual(copyOperations, [])
    assert.equal(requestedRepositoryName.length > 0, true)
  })
})
