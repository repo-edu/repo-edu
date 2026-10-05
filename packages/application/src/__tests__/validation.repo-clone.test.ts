import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type { PersistedCourse } from "@repo-edu/domain/types"
import type {
  FileSystemBatchRequest,
  FileSystemBatchResult,
  FileSystemEntryStatus,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type { RepositoryWorkflowPorts } from "../repository-workflows.js"
import {
  createRepoHarness,
  gitAnswer,
  gitEffect,
  hasDisposition,
  knownPortFailure,
  lostGitResult,
  readGitCall,
} from "./helpers/repo-workflow-harness.js"

const cloneTargetDirectory = join(tmpdir(), "repo-edu-clone-target")

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
          cloneCommands.push(readGitCall(request).args)
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
      credentials: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: cloneTargetDirectory,
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
        plannedRepositoryNames.map((repository) =>
          join(cloneTargetDirectory, repository),
        ),
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
          cloneCommands.push(readGitCall(request).args)
          if (readGitCall(request).args[0] === "pull") {
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
      credentials: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: cloneTargetDirectory,
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
          if (readGitCall(request).args[0] === "rev-parse") {
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
          credentials: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory: cloneTargetDirectory,
          directoryLayout: "flat",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CommandOutcomeError)
        assert.equal(error.outcome.disposition, "refused")
        if (error.outcome.disposition !== "refused") return false
        error = error.outcome.error
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
          cloneCommands.push(readGitCall(request).args)
          if (readGitCall(request).args[0] === "pull") {
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
      credentials: settings,
      assignmentId: "a1",
      template: null,
      targetDirectory: cloneTargetDirectory,
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

  it("removes partial checkouts after Cancel stops their clones", async () => {
    const controller = new AbortController()
    const deletedPaths: string[] = []
    const pullPaths: string[] = []
    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => ({
          resolved: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
          })),
          missing: [],
        }),
      },
      gitCommand: {
        run: async (request) => {
          if (readGitCall(request).args[0] === "pull") {
            pullPaths.push(readGitCall(request).folder ?? "")
            controller.abort()
            throw new CommandOutcomeError({
              disposition: "stopped",
              result: null,
            })
          }
          return { exitCode: 0, signal: null, stdout: "", stderr: "" }
        },
      },
      fileSystem: {
        inspect: async (request) =>
          request.paths.map((path) => ({ path, kind: "missing" as const })),
        // Like the real port, an aborted signal refuses the whole batch.
        applyBatch: async (request) => {
          if (request.signal?.aborted)
            throw new CommandOutcomeError({
              disposition: "stopped",
              result: null,
            })
          for (const operation of request.operations) {
            if (operation.kind === "delete-path")
              deletedPaths.push(operation.path)
          }
          return { completed: [...request.operations] }
        },
      },
    })

    await assert.rejects(
      handlers["repo.clone"](
        {
          course,
          credentials: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory: cloneTargetDirectory,
          directoryLayout: "flat",
        },
        { signal: controller.signal },
      ),
      (error: unknown) =>
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "stopped",
    )
    assert.equal(pullPaths.length > 0, true)
    for (const path of pullPaths) {
      assert.equal(deletedPaths.filter((deleted) => deleted === path).length, 2)
    }
  })

  it("rejects relative target directories", async () => {
    const { course, settings, handlers } = createRepoHarness()

    await assert.rejects(
      async () =>
        handlers["repo.clone"]({
          course,
          credentials: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory: "./repos",
          directoryLayout: "flat",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CommandOutcomeError)
        assert.equal(error.outcome.disposition, "refused")
        if (error.outcome.disposition !== "refused") return false
        error = error.outcome.error
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

  it("rejects planned repositories that normalize to the same clone path", async () => {
    let providerCalls = 0
    const { course, settings, handlers } = createRepoHarness({
      git: {
        resolveRepositoryCloneUrls: async () => {
          providerCalls += 1
          return { resolved: [], missing: [] }
        },
      },
    })
    const assignment = course.roster.assignments.find(
      (candidate) => candidate.id === "a1",
    )
    assert.ok(assignment)
    const groupSet = course.roster.groupSets.find(
      (candidate) => candidate.id === assignment.groupSetId,
    )
    assert.ok(groupSet)
    assert.equal(groupSet.nameMode, "named")
    if (groupSet.nameMode !== "named") {
      throw new Error("Expected assignment a1 to use a named group set.")
    }
    const [firstGroupId, secondGroupId] = groupSet.groupIds
    assert.ok(firstGroupId)
    assert.ok(secondGroupId)
    assignment.repositories[firstGroupId] = "CON"
    assignment.repositories[secondGroupId] = "CON_"

    await assert.rejects(
      async () =>
        handlers["repo.clone"]({
          course,
          credentials: settings,
          assignmentId: "a1",
          template: null,
          targetDirectory: cloneTargetDirectory,
          directoryLayout: "flat",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CommandOutcomeError)
        assert.equal(error.outcome.disposition, "refused")
        if (error.outcome.disposition !== "refused") return false
        error = error.outcome.error
        const appError = error as {
          type?: string
          message?: string
          issues?: Array<{ path?: string; message?: string }>
        }
        assert.equal(appError.type, "validation")
        assert.match(appError.message ?? "", /colliding local paths/i)
        assert.equal(appError.issues?.[0]?.path, "targetDirectory")
        assert.match(appError.issues?.[0]?.message ?? "", /CON_/)
        return true
      },
    )
    assert.equal(providerCalls, 0)
  })
})

type GitCall = { folder: string | undefined; args: string[] }

function setUpClone(
  setup: {
    git?: Partial<RepositoryWorkflowPorts["git"]>
    existing?: FileSystemEntryStatus["kind"]
    inspect?: () => Promise<FileSystemEntryStatus[]>
    answer?: (call: GitCall) => ProcessResult | undefined
    applyBatch?: (
      request: FileSystemBatchRequest,
    ) => FileSystemBatchResult | undefined
  } = {},
) {
  const gitCalls: GitCall[] = []
  const deleted: string[] = []
  const copied: string[] = []
  const warnings: string[] = []
  const { course, settings, handlers } = createRepoHarness({
    git: {
      resolveRepositoryCloneUrls: async (_draft, request) => ({
        resolved: request.repositoryNames.map((repositoryName) => ({
          repositoryName,
          cloneUrl: `https://x-access-token:token-1@github.com/repo-edu/${repositoryName}.git`,
        })),
        missing: [],
      }),
      ...setup.git,
    },
    gitCommand: {
      run: async (request) => {
        const call = readGitCall(request)
        gitCalls.push(call)
        return setup.answer?.(call) ?? gitAnswer("")
      },
    },
    fileSystem: {
      inspect:
        setup.inspect ??
        (async (request) =>
          request.paths.map((path) => ({
            path,
            kind: setup.existing ?? ("missing" as const),
          }))),
      applyBatch: async (request) => {
        for (const operation of request.operations) {
          if (operation.kind === "delete-path") deleted.push(operation.path)
          if (operation.kind === "copy-directory")
            copied.push(operation.destinationPath)
        }
        return (
          setup.applyBatch?.(request) ?? { completed: [...request.operations] }
        )
      },
    },
  })
  const run = () =>
    handlers["repo.clone"](
      {
        course,
        credentials: settings,
        assignmentId: "a1",
        template: null,
        targetDirectory: cloneTargetDirectory,
        directoryLayout: "flat",
      },
      {
        onOutput: (output) => {
          if (output.channel === "warn") warnings.push(output.message)
        },
      },
    )
  const planned = planForAssignment(course, "a1").groups.length
  const pulledFolders = () =>
    gitCalls
      .filter((call) => call.args[0] === "pull")
      .map((call) => call.folder ?? "")
  return {
    run,
    planned,
    gitCalls,
    pulledFolders,
    deleted,
    copied,
    warnings,
  }
}

function refusalIssues(error: unknown): string[] {
  assert.ok(error instanceof CommandOutcomeError)
  assert.equal(error.outcome.disposition, "refused")
  if (error.outcome.disposition !== "refused") return []
  const failure = error.outcome.error
  return failure.type === "validation"
    ? failure.issues.map((issue) => ("message" in issue ? issue.message : ""))
    : []
}

describe("repo.clone answers every outside call", () => {
  it("admits an existing folder only at the top of its own work tree", async () => {
    const top = setUpClone({
      existing: "directory",
      answer: (call) =>
        call.args[0] === "rev-parse" ? gitAnswer("true\n\n") : undefined,
    })

    const result = await top.run()

    assert.equal(result.repositoriesCloned, 0)
    assert.equal(result.repositoriesFailed, 0)
    assert.deepEqual(
      top.gitCalls.map((call) => call.args),
      Array.from({ length: top.planned }, () => [
        "rev-parse",
        "--is-inside-work-tree",
        "--show-prefix",
      ]),
    )
    assert.ok(
      top.gitCalls.every((call) =>
        call.folder?.startsWith(cloneTargetDirectory),
      ),
    )

    const cases: Array<{
      answer: () => ProcessResult
      detail: string
    }> = [
      {
        answer: () => gitAnswer("true\nnested/\n"),
        detail: "Git reads it as folder 'nested/' of an enclosing repository.",
      },
      {
        answer: () => gitAnswer("false\n\n"),
        detail: "Git finds no work tree there.",
      },
      {
        answer: () =>
          gitAnswer("", "fatal: not a git repository (or any parent)", 128),
        detail: "fatal: not a git repository (or any parent)",
      },
      {
        answer: () => {
          throw lostGitResult()
        },
        detail: "git rev-parse lost its result",
      },
    ]
    for (const { answer, detail } of cases) {
      const clone = setUpClone({
        existing: "directory",
        answer: (call) => (call.args[0] === "rev-parse" ? answer() : undefined),
      })

      await assert.rejects(clone.run(), (error: unknown) => {
        const issues = refusalIssues(error)
        assert.equal(issues.length, clone.planned)
        assert.ok(issues.every((issue) => issue.includes(detail)))
        return true
      })
      assert.equal(
        clone.gitCalls.some((call) => call.args[0] === "init"),
        false,
      )
    }
  })

  it("removes the temporary checkout after a failed copy", async () => {
    const clone = setUpClone({
      applyBatch: (request) => {
        if (request.operations[0]?.kind === "copy-directory")
          throw knownPortFailure("EACCES: permission denied")
        return undefined
      },
    })

    await assert.rejects(
      clone.run(),
      hasDisposition("completed", "EACCES: permission denied"),
    )
    assert.ok(clone.pulledFolders().length > 0)
    for (const folder of clone.pulledFolders()) {
      assert.equal(clone.deleted.filter((path) => path === folder).length, 2)
    }
  })

  it("keeps a temporary checkout whose pull lost its result", async () => {
    const clone = setUpClone({
      answer: (call) => {
        if (call.args[0] === "pull") throw lostGitResult()
        return undefined
      },
    })

    await assert.rejects(clone.run(), hasDisposition("uncertain"))
    assert.ok(clone.pulledFolders().length > 0)
    for (const folder of clone.pulledFolders()) {
      assert.equal(clone.deleted.filter((path) => path === folder).length, 1)
    }
  })

  it("counts a clone whose remote cannot be added as failed", async () => {
    const clone = setUpClone({
      answer: (call) =>
        call.args[0] === "remote"
          ? gitAnswer("", "error: remote origin already exists.", 3)
          : undefined,
    })

    const result = await clone.run()

    assert.equal(result.repositoriesCloned, 0)
    assert.equal(result.repositoriesFailed, clone.planned)
    assert.deepEqual(clone.copied, [])
    assert.equal(clone.warnings.length, clone.planned)
    assert.ok(
      clone.warnings.every((warning) =>
        warning.includes("error: remote origin already exists."),
      ),
    )
  })

  it("answers a clone URL lookup the Git server refuses or stops, and counts missing repositories as failed", async () => {
    for (const disposition of ["completed", "stopped"] as const) {
      const clone = setUpClone({
        git: {
          resolveRepositoryCloneUrls: async () => {
            throw gitEffect(disposition, "GET /repos answered 500")
          },
        },
      })

      await assert.rejects(clone.run(), hasDisposition(disposition))
    }

    const clone = setUpClone({
      git: {
        resolveRepositoryCloneUrls: async (_draft, request) => ({
          resolved: [],
          missing: request.repositoryNames,
        }),
      },
    })

    const result = await clone.run()

    assert.equal(result.repositoriesCloned, 0)
    assert.equal(result.repositoriesFailed, clone.planned)
    assert.deepEqual(clone.gitCalls, [])
  })

  it("warns when a temporary checkout cannot be removed and keeps the clone", async () => {
    const clone = setUpClone({
      applyBatch: (request) => {
        if (request.operations[0]?.kind === "delete-path")
          throw knownPortFailure("EBUSY: resource busy")
        return undefined
      },
    })

    const result = await clone.run()

    assert.equal(result.repositoriesCloned, clone.planned)
    assert.equal(clone.warnings.length, 2 * clone.planned)
    assert.ok(
      clone.warnings.every((warning) =>
        warning.startsWith("Could not remove the temporary folder"),
      ),
    )
  })

  it("passes on a target folder the host cannot inspect or create", async () => {
    const inspected = setUpClone({
      inspect: async () => {
        throw knownPortFailure("EACCES: permission denied")
      },
    })
    await assert.rejects(inspected.run(), hasDisposition("completed"))

    const created = setUpClone({
      applyBatch: (request) => {
        if (request.operations[0]?.kind === "ensure-directory")
          throw knownPortFailure("EACCES: permission denied")
        return undefined
      },
    })
    await assert.rejects(created.run(), hasDisposition("completed"))
    assert.deepEqual(created.gitCalls, [])
  })
})
