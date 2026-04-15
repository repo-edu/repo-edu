import type { RepositoryWorkflowPorts } from "../../repository-workflows.js"
import { createRepositoryWorkflowHandlers } from "../../repository-workflows.js"
import { getCourseAndSettingsScenario } from "./fixture-scenarios.js"

type GitPortOverrides = Partial<RepositoryWorkflowPorts["git"]>

interface GitCommandOverride {
  run?: RepositoryWorkflowPorts["gitCommand"]["run"]
}

interface FileSystemOverride {
  inspect?: RepositoryWorkflowPorts["fileSystem"]["inspect"]
  applyBatch?: RepositoryWorkflowPorts["fileSystem"]["applyBatch"]
}

export function createRepoHarness(options?: {
  git?: GitPortOverrides
  gitCommand?: GitCommandOverride
  fileSystem?: FileSystemOverride
}) {
  const { course, settings } = getCourseAndSettingsScenario(
    { tier: "small", preset: "shared-teams" },
    ({ course, settings }) => {
      course.organization = "repo-edu"
      settings.activeCourseId = course.id
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

  const handlers = createRepositoryWorkflowHandlers({
    git: {
      createRepositories:
        options?.git?.createRepositories ??
        (async (_draft, request) => ({
          created: request.repositoryNames.map((repositoryName) => ({
            repositoryName,
            repositoryUrl: `https://github.com/repo-edu/${repositoryName}`,
          })),
          alreadyExisted: [],
          failed: [],
        })),
      createTeam:
        options?.git?.createTeam ??
        (async (_draft, request) => ({
          created: true,
          teamSlug: request.teamName,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        })),
      assignRepositoriesToTeam: async () => {},
      getRepositoryDefaultBranchHead:
        options?.git?.getRepositoryDefaultBranchHead ??
        (async () => ({
          sha: "template-sha",
          branchName: "main",
        })),
      getTemplateDiff:
        options?.git?.getTemplateDiff ?? (async () => ({ files: [] })),
      createBranch: options?.git?.createBranch ?? (async () => {}),
      createPullRequest:
        options?.git?.createPullRequest ??
        (async () => ({
          url: "https://example.com/pr/1",
          created: true,
        })),
      resolveRepositoryCloneUrls:
        options?.git?.resolveRepositoryCloneUrls ??
        (async () => ({
          resolved: [],
          missing: [],
        })),
    },
    gitCommand: {
      cancellation: "best-effort",
      run:
        options?.gitCommand?.run ??
        (async () => ({
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        })),
    },
    fileSystem: {
      inspect: options?.fileSystem?.inspect ?? (async () => []),
      applyBatch:
        options?.fileSystem?.applyBatch ?? (async () => ({ completed: [] })),
      createTempDirectory: async () => "/tmp/repo-edu-test",
      listDirectory: async () => [],
    },
  })

  return { course, settings, handlers }
}
