import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createRepositoryWorkflowHandlers } from "../repository-workflows.js"
import { getCourseAndSettingsScenario } from "./helpers/fixture-scenarios.js"

describe("application repository update workflow helpers", () => {
  it("creates template update pull requests for planned repositories", async () => {
    const { course, settings } = getCourseAndSettingsScenario(
      { tier: "small", preset: "shared-teams" },
      ({ course, settings }) => {
        course.gitConnectionId = "main-git"
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
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const result = await handlers["repo.update"]({
      course,
      appSettings: settings,
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
        course.gitConnectionId = "main-git"
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
        inspect: async () => [],
        applyBatch: async () => ({ completed: [] }),
        createTempDirectory: async () => "/tmp/repo-edu-test",
      },
    })

    const result = await handlers["repo.update"]({
      course,
      appSettings: settings,
      assignmentId: "a1",
    })

    assert.equal(result.repositoriesPlanned > 0, true)
    assert.equal(result.prsCreated, 0)
    assert.equal(result.prsSkipped, result.repositoriesPlanned)
    assert.equal(result.prsFailed, 0)
    assert.equal(getTemplateDiffCalls, 0)
  })
})
