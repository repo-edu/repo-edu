import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import type { RepositoryTemplate } from "@repo-edu/domain/types"
import type {
  FileSystemBatchRequest,
  FileSystemBatchResult,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type { PatchFile } from "@repo-edu/integrations-git-contract"
import { composeCourseCommandTransition } from "../course-command-transition.js"
import type { RepositoryWorkflowPorts } from "../repository-workflows.js"
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

function blobOf(path: string): string {
  return createHash("sha1").update(path).digest("hex")
}

/** One entry of `git diff-tree -r -z -M` output. */
function rawChange(
  letter: "A" | "D" | "M" | "R" | "T",
  path: string,
  options: { modes?: [string, string]; previousPath?: string } = {},
): string {
  const [before, after] =
    options.modes ??
    (letter === "A"
      ? ["000000", "100644"]
      : letter === "D"
        ? ["100644", "000000"]
        : ["100644", "100644"])
  const blob = letter === "D" ? "0".repeat(40) : blobOf(path)
  const header = `:${before} ${after} ${"a".repeat(40)} ${blob} ${letter}${letter === "R" ? "100" : ""}`
  return letter === "R"
    ? `${header}\0${options.previousPath}\0${path}\0`
    : `${header}\0${path}\0`
}

type GitCall = { folder: string | undefined; args: string[]; cwd?: string }

function setUpUpdate(
  setup: {
    template?: RepositoryTemplate
    baseline?: string | null
    changes?: string
    contents?: Record<string, string | Buffer>
    git?: Partial<RepositoryWorkflowPorts["git"]>
    answer?: (call: GitCall) => ProcessResult | undefined
    applyBatch?: (request: FileSystemBatchRequest) => FileSystemBatchResult
  } = {},
) {
  const changes = setup.changes ?? rawChange("M", "README.md")
  const contents = setup.contents ?? { "README.md": "updated" }
  const gitCalls: GitCall[] = []
  const deleted: string[] = []
  const branchFiles: PatchFile[][] = []
  const warnings: string[] = []
  const { course, settings, handlers } = createRepoHarness({
    git: {
      getRepositoryDefaultBranchHead: async (_draft, request) =>
        request.owner === "template-org"
          ? { sha: "new-template-sha", branchName: "main" }
          : { sha: "repo-base-sha", branchName: "main" },
      resolveRepositoryCloneUrls: async (_draft, request) => ({
        resolved: request.repositoryNames.map((repositoryName) => ({
          repositoryName,
          cloneUrl: `https://x-access-token:token-1@github.com/${request.organization}/${repositoryName}.git`,
        })),
        missing: [],
      }),
      createBranch: async (_draft, request) => {
        branchFiles.push(request.files)
      },
      ...setup.git,
    },
    gitCommand: {
      run: async (request) => {
        const call = { ...readGitCall(request), cwd: request.cwd }
        gitCalls.push(call)
        const answered = setup.answer?.(call)
        if (answered !== undefined) return answered
        const [command, ...rest] = call.args
        if (command === "rev-parse") return gitAnswer("new-template-sha\n")
        if (command === "diff-tree") return gitAnswer(changes)
        if (command === "cat-file") {
          const path = Object.keys(contents).find(
            (candidate) => blobOf(candidate) === rest[1],
          )
          if (path === undefined) {
            return gitAnswer(
              "",
              `fatal: Not a valid object name ${rest[1]}`,
              128,
            )
          }
          assert.equal(request.stdoutEncoding, "base64")
          return gitAnswer(Buffer.from(contents[path]).toString("base64"))
        }
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
    },
  })
  course.repositoryTemplate = setup.template ?? remoteTemplate
  const assignment = course.roster.assignments.find(
    (candidate) => candidate.id === "a1",
  )
  assert.ok(assignment)
  assignment.templateCommitSha =
    setup.baseline === undefined ? "old-template-sha" : setup.baseline
  const input = { course, credentials: settings, assignmentId: "a1" }
  const run = (signal?: AbortSignal) =>
    handlers["repo.update"](input, {
      signal,
      onOutput: (output) => {
        if (output.channel === "warn") warnings.push(output.message)
      },
    })
  const commands = () => gitCalls.map((call) => call.args[0])
  return { input, run, gitCalls, commands, deleted, branchFiles, warnings }
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

describe("repo.update reads template changes through local Git", () => {
  it("opens a pull request in every planned repository from one temporary clone of a remote template", async () => {
    const update = setUpUpdate()

    const result = await update.run()

    assert.equal(result.repositoriesPlanned > 1, true)
    assert.equal(result.prsCreated, result.repositoriesPlanned)
    assert.equal(result.templateCommitSha, "new-template-sha")
    const clone = update.gitCalls.find((call) => call.args[0] === "clone")
    assert.deepEqual(clone?.args, [
      "clone",
      "--single-branch",
      "https://x-access-token:token-1@github.com/template-org/course-template.git",
      templateCheckoutPath,
    ])
    const diff = update.gitCalls.find((call) => call.args[0] === "diff-tree")
    assert.equal(diff?.folder, templateCheckoutPath)
    assert.deepEqual(diff?.args, [
      "diff-tree",
      "-r",
      "-z",
      "-M",
      "old-template-sha",
      "new-template-sha",
    ])
    assert.deepEqual(update.branchFiles[0], [
      {
        path: "README.md",
        previousPath: null,
        status: "modified",
        contentBase64: Buffer.from("updated").toString("base64"),
      },
    ])
    assert.deepEqual(update.deleted, [templateCheckoutPath])
  })

  it("reads a local template in place", async () => {
    const update = setUpUpdate({ template: localTemplate })

    const result = await update.run()

    assert.equal(result.prsCreated, result.repositoriesPlanned)
    assert.equal(update.commands().includes("clone"), false)
    assert.ok(
      update.gitCalls.every((call) => call.folder === "/course-template"),
    )
    assert.deepEqual(update.deleted, [])
  })

  it("answers without pull requests when the baseline is missing or unchanged, before any download", async () => {
    for (const baseline of [null, "new-template-sha"]) {
      const update = setUpUpdate({ baseline })

      const result = await update.run()

      assert.equal(result.prsCreated, 0)
      assert.equal(result.prsSkipped, result.repositoriesPlanned)
      assert.equal(result.templateCommitSha, "new-template-sha")
      assert.deepEqual(update.commands(), [])
      assert.equal(update.warnings.length, baseline === null ? 1 : 0)
    }
  })

  it("carries a renamed file under its new path and a binary file byte for byte", async () => {
    const image = Buffer.from([0xff, 0x00, 0x89, 0x50])
    const update = setUpUpdate({
      template: localTemplate,
      changes:
        rawChange("R", "new name.md", { previousPath: "old.md" }) +
        rawChange("A", "logo.png") +
        rawChange("D", "gone.md"),
      contents: { "new name.md": "renamed", "logo.png": image },
    })

    await update.run()

    assert.deepEqual(update.branchFiles[0], [
      {
        path: "new name.md",
        previousPath: "old.md",
        status: "renamed",
        contentBase64: Buffer.from("renamed").toString("base64"),
      },
      {
        path: "logo.png",
        previousPath: null,
        status: "added",
        contentBase64: image.toString("base64"),
      },
      {
        path: "gone.md",
        previousPath: null,
        status: "removed",
        contentBase64: null,
      },
    ])
  })

  it("refuses a changed symbolic link or submodule before it reads content or writes a branch", async () => {
    const cases = [
      {
        change: rawChange("T", "link", { modes: ["100644", "120000"] }),
        message: "Changed template entry 'link' is a symbolic link.",
      },
      {
        change: rawChange("D", "old-link", { modes: ["120000", "000000"] }),
        message: "Changed template entry 'old-link' is a symbolic link.",
      },
      {
        change: rawChange("A", "vendor/lib", { modes: ["000000", "160000"] }),
        message: "Changed template entry 'vendor/lib' is a submodule.",
      },
    ]
    for (const template of [remoteTemplate, localTemplate]) {
      for (const { change, message } of cases) {
        const update = setUpUpdate({
          template,
          changes: rawChange("M", "README.md") + change,
        })

        await assert.rejects(update.run(), (error: unknown) => {
          assert.deepEqual(refusalIssues(error), [message])
          return true
        })
        assert.equal(update.commands().includes("cat-file"), false)
        assert.deepEqual(update.branchFiles, [])
        assert.deepEqual(
          update.deleted,
          template.kind === "remote" ? [templateCheckoutPath] : [],
        )
      }
    }
  })

  it("refuses the update when Git cannot list or read the template changes", async () => {
    for (const command of ["diff-tree", "cat-file"]) {
      for (const failure of ["exit", "lost"] as const) {
        const update = setUpUpdate({
          answer: (call) => {
            if (call.args[0] !== command) return undefined
            if (failure === "lost") throw lostGitResult()
            return gitAnswer("", "fatal: bad object old-template-sha", 128)
          },
        })

        await assert.rejects(
          update.run(),
          hasDisposition(
            "refused",
            failure === "lost"
              ? `git ${command} lost its result`
              : "fatal: bad object old-template-sha",
          ),
        )
        assert.deepEqual(update.branchFiles, [])
        assert.deepEqual(update.deleted, [templateCheckoutPath])
      }
    }

    const unreadable = setUpUpdate({ changes: "M\0README.md\0" })
    await assert.rejects(
      unreadable.run(),
      hasDisposition("refused", "in a form the update cannot read"),
    )
    assert.deepEqual(unreadable.branchFiles, [])
  })

  it("refuses an update whose local template folder is gone and names the folder", async () => {
    const update = setUpUpdate({
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

    await assert.rejects(update.run(), (error: unknown) => {
      assert.ok(error instanceof CommandOutcomeError)
      assert.match(error.message, /Local template at '\/course-template'/)
      assert.deepEqual(refusalIssues(error), [
        "fatal: cannot change to '/course-template': No such file or directory",
      ])
      return true
    })
    assert.ok(update.gitCalls.every((call) => call.cwd === undefined))
  })

  it("refuses an update whose remote template cannot be cloned", async () => {
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
        message:
          "the Git server has no repository 'template-org/course-template'",
      },
      {
        setup: {
          answer: (call: GitCall) =>
            call.args[0] === "clone"
              ? gitAnswer("", "fatal: repository not found", 128)
              : undefined,
        },
        message: "fatal: repository not found",
      },
    ]
    for (const { setup, message } of cases) {
      const update = setUpUpdate(setup)

      await assert.rejects(update.run(), hasDisposition("refused", message))
      assert.deepEqual(update.branchFiles, [])
      assert.deepEqual(update.deleted, [templateCheckoutPath])
    }
  })

  it("keeps the temporary clone when the clone loses its result", async () => {
    const update = setUpUpdate({
      answer: (call) => {
        if (call.args[0] === "clone") throw lostGitResult()
        return undefined
      },
    })

    await assert.rejects(update.run(), hasDisposition("uncertain"))
    assert.deepEqual(update.deleted, [])
  })

  it("removes the temporary clone after a stop or a known failure while it reads the remote template", async () => {
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
          git: {
            resolveRepositoryCloneUrls: async () => {
              throw gitEffect("stopped", "Operation cancelled.")
            },
          },
        },
        disposition: "stopped" as const,
      },
      {
        setup: {
          answer: (call: GitCall) => {
            if (call.args[0] === "clone")
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
      const update = setUpUpdate(setup)

      await assert.rejects(update.run(), hasDisposition(disposition))
      assert.deepEqual(update.deleted, [templateCheckoutPath])
    }
  })

  it("warns when the temporary clone cannot be removed and still answers the update", async () => {
    const update = setUpUpdate({
      applyBatch: () => {
        throw knownPortFailure("EBUSY: resource busy")
      },
    })

    const result = await update.run()

    assert.equal(result.prsCreated, result.repositoriesPlanned)
    assert.deepEqual(update.warnings, [
      `Could not remove the temporary folder '${templateCheckoutPath}': EBUSY: resource busy`,
    ])
  })
})

describe("repo.update answers the Git server's replies", () => {
  it("answers a template head the Git server lacks, refuses or stops", async () => {
    const cases = [
      { head: async () => null, disposition: "refused" as const },
      {
        head: async () => {
          throw gitEffect("completed", "GET /repos answered 500")
        },
        disposition: "completed" as const,
      },
      {
        head: async () => {
          throw gitEffect("stopped", "Operation cancelled.")
        },
        disposition: "stopped" as const,
      },
    ]
    for (const { head, disposition } of cases) {
      const update = setUpUpdate({
        git: { getRepositoryDefaultBranchHead: head },
      })

      await assert.rejects(update.run(), hasDisposition(disposition))
      assert.deepEqual(update.commands(), [])
    }
  })

  it("counts a missing student repository as a failed pull request and ends on an unreadable one", async () => {
    for (const answer of ["missing", "refused"] as const) {
      let studentReads = 0
      const update = setUpUpdate({
        git: {
          getRepositoryDefaultBranchHead: async (_draft, request) => {
            if (request.owner === "template-org")
              return { sha: "new-template-sha", branchName: "main" }
            studentReads += 1
            if (studentReads > 1)
              return { sha: "repo-base-sha", branchName: "main" }
            if (answer === "missing") return null
            throw gitEffect("completed", "GET /repos answered 500")
          },
        },
      })

      if (answer === "refused") {
        await assert.rejects(update.run(), hasDisposition("completed"))
        continue
      }
      const result = await update.run()
      assert.equal(result.prsFailed, 1)
      assert.equal(result.prsCreated, result.repositoriesPlanned - 1)
      assert.equal(update.warnings.length, 1)
    }
  })

  it("goes on past one refused branch or pull request and stores the new template commit", async () => {
    for (const failedOperation of ["branch", "pull-request"] as const) {
      const refusedRepositories: string[] = []
      const refuseFirst = (repositoryName: string) => {
        if (refusedRepositories.length > 0) return
        refusedRepositories.push(repositoryName)
        throw gitEffect("completed", "Repository is archived.")
      }
      const update = setUpUpdate({
        git: {
          createBranch: async (_draft, request) => {
            if (failedOperation === "branch")
              refuseFirst(request.repositoryName)
          },
          createPullRequest: async (_draft, request) => {
            if (failedOperation === "pull-request")
              refuseFirst(request.repositoryName)
            return { url: "https://example.com/pr/1", created: true }
          },
        },
      })

      const result = await update.run()

      assert.equal(result.prsFailed, 1)
      assert.equal(result.prsCreated, result.repositoriesPlanned - 1)
      assert.equal(result.templateCommitSha, "new-template-sha")
      assert.ok(
        update.warnings.some((message) =>
          message.includes(
            `'${refusedRepositories[0]}': Repository is archived.`,
          ),
        ),
      )
      const next = composeCourseCommandTransition(
        "repo.update",
        update.input,
        result,
      )
      assert.equal(
        next.roster.assignments.find((candidate) => candidate.id === "a1")
          ?.templateCommitSha,
        "new-template-sha",
      )
    }
  })

  it("counts a pull request the Git server already has as skipped", async () => {
    const update = setUpUpdate({
      git: { createPullRequest: async () => ({ created: false }) },
    })

    const result = await update.run()

    assert.equal(result.prsCreated, 0)
    assert.equal(result.prsSkipped, result.repositoriesPlanned)
  })

  it("ends the update on a stopped branch or pull request write", async () => {
    for (const failedOperation of ["branch", "pull-request"] as const) {
      const stop = () => {
        throw gitEffect("stopped", "Operation cancelled.")
      }
      const update = setUpUpdate({
        git: {
          createBranch: async () => {
            if (failedOperation === "branch") stop()
          },
          createPullRequest: async () => {
            if (failedOperation === "pull-request") stop()
            return { url: "https://example.com/pr/1", created: true }
          },
        },
      })

      await assert.rejects(update.run(), hasDisposition("stopped"))
    }
  })

  it("does not turn a branch or pull request failure without an outcome into a warning", async () => {
    for (const failedOperation of ["branch", "pull-request"] as const) {
      const controller = new AbortController()
      const abort = () => {
        controller.abort(new Error("stop"))
        throw new DOMException("The operation was aborted.", "AbortError")
      }
      const update = setUpUpdate({
        git: {
          createBranch: async () => {
            if (failedOperation === "branch") abort()
          },
          createPullRequest: async () => {
            if (failedOperation === "pull-request") abort()
            return { url: "https://example.com/pr/1", created: true }
          },
        },
      })

      await assert.rejects(
        update.run(controller.signal),
        (error: unknown) =>
          !(error instanceof CommandOutcomeError) &&
          typeof error === "object" &&
          error !== null &&
          "type" in error &&
          error.type === "cancelled",
      )
      assert.deepEqual(update.warnings, [])
    }
  })
})
