import { tmpdir } from "node:os"
import { join } from "node:path"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import { splitAppSettings } from "@repo-edu/domain/settings"
import type { RepositoryTemplate } from "@repo-edu/domain/types"
import type {
  GitCommandRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type { GitEffectFailure } from "@repo-edu/integrations-git-contract"
import type { RepositoryWorkflowPorts } from "../../repository-workflows.js"
import { createRepositoryWorkflowHandlers } from "../../repository-workflows.js"
import { getCourseAndSettingsScenario } from "./fixture-scenarios.js"

type GitPortOverrides = Partial<RepositoryWorkflowPorts["git"]>

interface GitCommandOverride {
  run?: RepositoryWorkflowPorts["gitCommand"]["run"]
}

interface FileSystemOverride {
  inspect?: RepositoryWorkflowPorts["fileSystem"]["inspect"]
  stat?: RepositoryWorkflowPorts["fileSystem"]["stat"]
  applyBatch?: RepositoryWorkflowPorts["fileSystem"]["applyBatch"]
  createTempDirectory?: RepositoryWorkflowPorts["fileSystem"]["createTempDirectory"]
}

export const templateCheckoutPath = join(tmpdir(), "repo-edu-template-test")

export function createRepoHarness(options?: {
  git?: GitPortOverrides
  gitCommand?: GitCommandOverride
  fileSystem?: FileSystemOverride
}) {
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
            cloneUrl: `https://x-access-token:token@github.com/repo-edu/${repositoryName}.git`,
          })),
          alreadyExisted: [],
          failed: [],
        })),
      createTeam:
        options?.git?.createTeam ??
        (async (_draft, request) => ({
          created: true,
          teamSlug: request.groupId,
          membersAdded: request.memberUsernames,
          membersNotFound: [],
        })),
      assignRepositoriesToTeam:
        options?.git?.assignRepositoriesToTeam ?? (async () => {}),
      getRepositoryDefaultBranchHead:
        options?.git?.getRepositoryDefaultBranchHead ??
        (async () => ({
          sha: "template-sha",
          branchName: "main",
        })),
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
      listRepositories:
        options?.git?.listRepositories ??
        (async () => ({
          repositories: [],
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
      userHomeSystemDirectories: [],
      inspect: options?.fileSystem?.inspect ?? (async () => []),
      stat:
        options?.fileSystem?.stat ??
        (async () => ({ kind: "missing", size: null })),
      applyBatch:
        options?.fileSystem?.applyBatch ?? (async () => ({ completed: [] })),
      createTempDirectory:
        options?.fileSystem?.createTempDirectory ??
        (async () => templateCheckoutPath),
      listDirectory: async () => [],
      listFiles: async () => [],
      readFileInsideRoot: async () => {
        throw new Error("readFileInsideRoot not implemented in this test")
      },
    },
  })

  return { course, settings: splitAppSettings(settings).credentials, handlers }
}

/** The folder Git ran in, read from its `-C` option, and the Git command. */
export function readGitCall(request: GitCommandRequest): {
  folder: string | undefined
  args: string[]
} {
  return request.args[0] === "-C"
    ? { folder: request.args[1], args: request.args.slice(2) }
    : { folder: undefined, args: request.args }
}

export function gitAnswer(
  stdout: string,
  stderr = "",
  exitCode = 0,
): ProcessResult {
  return { exitCode, signal: null, stdout, stderr }
}

export function lostGitResult(): CommandOutcomeError {
  return new CommandOutcomeError({
    disposition: "uncertain",
    reason: "proof-lost",
    message: "The command result could not be confirmed.",
  })
}

export function gitEffect(
  disposition: GitEffectFailure["disposition"],
  message: string,
): GitEffectFailure {
  return Object.assign(new Error(message), {
    type: "git-effect" as const,
    disposition,
  })
}

export function knownPortFailure(message: string): CommandOutcomeError {
  return new CommandOutcomeError<never>({
    disposition: "completed",
    completion: {
      status: "failed",
      error: { type: "effect", message },
      result: null,
    },
  })
}

export function hasDisposition(
  disposition: CommandOutcomeError["outcome"]["disposition"],
  message?: string | RegExp,
): (error: unknown) => boolean {
  return (error) =>
    error instanceof CommandOutcomeError &&
    error.outcome.disposition === disposition &&
    (message === undefined ||
      (typeof message === "string"
        ? error.message.includes(message)
        : message.test(error.message)))
}

export const remoteTemplate: RepositoryTemplate = {
  kind: "remote",
  owner: "template-org",
  name: "course-template",
  visibility: "private",
}

export const localTemplate: RepositoryTemplate = {
  kind: "local",
  path: "/course-template",
  visibility: "private",
}
