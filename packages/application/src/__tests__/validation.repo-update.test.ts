import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { splitAppSettings } from "@repo-edu/domain/settings"
import type { GitEffectFailure } from "@repo-edu/integrations-git-contract"
import { composeCourseCommandTransition } from "../course-command-transition.js"
import { createRepositoryWorkflowHandlers } from "../repository-workflows.js"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"
import { createRepoHarness } from "./helpers/repo-workflow-harness.js"

function gitEffect(
  disposition: GitEffectFailure["disposition"],
  message: string,
): GitEffectFailure {
  return Object.assign(new Error(message), {
    type: "git-effect" as const,
    disposition,
  })
}

describe("application repository update workflow helpers", () => {
  it("creates template update pull requests for planned repositories", async () => {
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course, settings }) => {
        course.organization = "repo-edu"
        course.repositoryTemplate = {
          kind: "remote",
          owner: "template-org",
          name: "course-template",
          visibility: "private",
        }
        const assignment = course.roster.assignments.find(
          (item) => item.id === "a1",
        )
        if (assignment) {
          assignment.templateCommitSha = "old-template-sha"
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
    const createdBranches: string[] = []
    const createdPullRequests: string[] = []

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async (_draft, request) => {
          if (
            request.owner === "template-org" &&
            request.repositoryName === "course-template"
          ) {
            return { sha: "new-template-sha", branchName: "main" }
          }
          return { sha: "repo-base-sha", branchName: "main" }
        },
        getTemplateDiff: async () => ({
          files: [
            {
              path: "README.md",
              previousPath: null,
              status: "modified",
              contentBase64: "VGVtcGxhdGUgY29udGVudA==",
            },
          ],
        }),
        createBranch: async (_draft, request) => {
          createdBranches.push(
            `${request.owner}/${request.repositoryName}:${request.branchName}`,
          )
        },
        createPullRequest: async (_draft, request) => {
          createdPullRequests.push(
            `${request.owner}/${request.repositoryName}:${request.headBranch}`,
          )
          return {
            url: `https://github.com/${request.owner}/${request.repositoryName}/pull/1`,
            created: true,
          }
        },
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
        listRepositories: async () => ({
          repositories: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        userHomeSystemDirectories: [],
        inspect: async () => [],
        stat: async () => ({ kind: "missing", size: null }),
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
        listDirectory: async () => [],
        listFiles: async () => [],
        readFileInsideRoot: async () => {
          throw new Error("readFileInsideRoot not implemented in this test")
        },
      },
    })

    const result = await handlers["repo.update"]({
      course,
      credentials: splitAppSettings(settings).credentials,
      assignmentId: "a1",
    })

    assert.equal(result.repositoriesPlanned > 0, true)
    assert.equal(result.prsCreated, result.repositoriesPlanned)
    assert.equal(result.prsSkipped, 0)
    assert.equal(result.prsFailed, 0)
    assert.equal(result.templateCommitSha, "new-template-sha")
    assert.equal(createdBranches.length, result.repositoriesPlanned)
    assert.equal(createdPullRequests.length, result.repositoriesPlanned)
  })

  it("skips update when template SHA is unchanged", async () => {
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course, settings }) => {
        course.organization = "repo-edu"
        course.repositoryTemplate = {
          kind: "remote",
          owner: "template-org",
          name: "course-template",
          visibility: "private",
        }
        const assignment = course.roster.assignments.find(
          (item) => item.id === "a1",
        )
        if (assignment) {
          assignment.templateCommitSha = "same-template-sha"
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
    let getTemplateDiffCalls = 0

    const handlers = createRepositoryWorkflowHandlers({
      git: {
        createRepositories: async () => ({
          created: [],
          alreadyExisted: [],
          failed: [],
        }),
        createTeam: async () => ({
          created: true,
          teamSlug: "team",
          membersAdded: [],
          membersNotFound: [],
        }),
        assignRepositoriesToTeam: async () => {},
        getRepositoryDefaultBranchHead: async () => ({
          sha: "same-template-sha",
          branchName: "main",
        }),
        getTemplateDiff: async () => {
          getTemplateDiffCalls += 1
          return { files: [] }
        },
        createBranch: async () => {},
        createPullRequest: async () => ({
          url: "",
          created: false,
        }),
        resolveRepositoryCloneUrls: async () => ({
          resolved: [],
          missing: [],
        }),
        listRepositories: async () => ({
          repositories: [],
        }),
      },
      gitCommand: {
        cancellation: "best-effort",
        run: async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }),
      },
      fileSystem: {
        userHomeSystemDirectories: [],
        inspect: async () => [],
        stat: async () => ({ kind: "missing", size: null }),
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
        listDirectory: async () => [],
        listFiles: async () => [],
        readFileInsideRoot: async () => {
          throw new Error("readFileInsideRoot not implemented in this test")
        },
      },
    })

    const result = await handlers["repo.update"]({
      course,
      credentials: splitAppSettings(settings).credentials,
      assignmentId: "a1",
    })

    assert.equal(result.repositoriesPlanned > 0, true)
    assert.equal(result.prsCreated, 0)
    assert.equal(result.prsSkipped, result.repositoriesPlanned)
    assert.equal(result.prsFailed, 0)
    assert.equal(getTemplateDiffCalls, 0)
  })

  it("goes on past one refused branch or pull request and stores the new template commit", async () => {
    for (const failedOperation of ["branch", "pull-request"] as const) {
      const refusedRepositories: string[] = []
      const refuseFirst = (repositoryName: string) => {
        if (refusedRepositories.length > 0) return
        refusedRepositories.push(repositoryName)
        throw gitEffect("completed", "Repository is archived.")
      }
      const warnings: string[] = []
      const { course, settings, handlers } = createRepoHarness({
        git: {
          getRepositoryDefaultBranchHead: async (_draft, request) =>
            request.owner === "template-org"
              ? { sha: "new-template-sha", branchName: "main" }
              : { sha: "repo-base-sha", branchName: "main" },
          getTemplateDiff: async () => ({
            files: [
              {
                path: "README.md",
                previousPath: null,
                status: "modified",
                contentBase64: "VXBkYXRlZA==",
              },
            ],
          }),
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
      course.repositoryTemplate = {
        kind: "remote",
        owner: "template-org",
        name: "course-template",
        visibility: "private",
      }
      const assignment = course.roster.assignments.find(
        (candidate) => candidate.id === "a1",
      )
      assert.ok(assignment)
      assignment.templateCommitSha = "old-template-sha"
      const input = { course, credentials: settings, assignmentId: "a1" }

      const result = await handlers["repo.update"](input, {
        onOutput: (output) => {
          if (output.channel === "warn") warnings.push(output.message)
        },
      })

      assert.equal(result.repositoriesPlanned > 1, true)
      assert.equal(result.prsFailed, 1)
      assert.equal(result.prsCreated, result.repositoriesPlanned - 1)
      assert.equal(result.templateCommitSha, "new-template-sha")
      assert.equal(
        warnings.some((message) =>
          message.includes(
            `'${refusedRepositories[0]}': Repository is archived.`,
          ),
        ),
        true,
      )
      const next = composeCourseCommandTransition("repo.update", input, result)
      assert.equal(
        next.roster.assignments.find((candidate) => candidate.id === "a1")
          ?.templateCommitSha,
        "new-template-sha",
      )
    }
  })

  it("ends the update on a stopped branch write", async () => {
    const { course, settings, handlers } = createRepoHarness({
      git: {
        getRepositoryDefaultBranchHead: async (_draft, request) =>
          request.owner === "template-org"
            ? { sha: "new-template-sha", branchName: "main" }
            : { sha: "repo-base-sha", branchName: "main" },
        getTemplateDiff: async () => ({
          files: [
            {
              path: "README.md",
              previousPath: null,
              status: "modified",
              contentBase64: "VXBkYXRlZA==",
            },
          ],
        }),
        createBranch: async () => {
          throw gitEffect("stopped", "Operation cancelled.")
        },
      },
    })
    course.repositoryTemplate = {
      kind: "remote",
      owner: "template-org",
      name: "course-template",
      visibility: "private",
    }
    const assignment = course.roster.assignments.find(
      (candidate) => candidate.id === "a1",
    )
    assert.ok(assignment)
    assignment.templateCommitSha = "old-template-sha"

    await assert.rejects(
      handlers["repo.update"]({
        course,
        credentials: settings,
        assignmentId: "a1",
      }),
      (error: unknown) =>
        error instanceof CommandOutcomeError &&
        error.outcome.disposition === "stopped",
    )
  })

  it("does not turn caller cancellation during branch or pull-request creation into warnings", async () => {
    for (const failedOperation of ["branch", "pull-request"] as const) {
      const controller = new AbortController()
      const { course, settings, handlers } = createRepoHarness({
        git: {
          getRepositoryDefaultBranchHead: async (_draft, request) =>
            request.owner === "template-org"
              ? { sha: "new-template-sha", branchName: "main" }
              : { sha: "repo-base-sha", branchName: "main" },
          getTemplateDiff: async () => ({
            files: [
              {
                path: "README.md",
                previousPath: null,
                status: "modified",
                contentBase64: "VXBkYXRlZA==",
              },
            ],
          }),
          createBranch: async () => {
            if (failedOperation === "branch") {
              controller.abort(new Error("stop"))
              throw new DOMException("The operation was aborted.", "AbortError")
            }
          },
          createPullRequest: async () => {
            if (failedOperation === "pull-request") {
              controller.abort(new Error("stop"))
              throw new DOMException("The operation was aborted.", "AbortError")
            }
            return { url: "https://example.com/pr/1", created: true }
          },
        },
      })
      course.repositoryTemplate = {
        kind: "remote",
        owner: "template-org",
        name: "course-template",
        visibility: "private",
      }
      const assignment = course.roster.assignments.find(
        (candidate) => candidate.id === "a1",
      )
      assert.ok(assignment)
      assignment.templateCommitSha = "old-template-sha"

      await assert.rejects(
        handlers["repo.update"](
          {
            course,
            credentials: settings,
            assignmentId: "a1",
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
})
