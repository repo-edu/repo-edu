import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  RecordedRepositoriesByAssignment,
  RepositoryUpdateInput,
  RepositoryUpdateResult,
  VerifyGitDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type {
  PersistedCourse,
  RepositoryTemplate,
} from "@repo-edu/domain/types"
import type {
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import {
  commandRefusal,
  commandValidationError as createValidationAppError,
  isCompletedGitEffectFailure,
  rethrowGitEffectFailure,
  commandThrowIfAborted as throwIfAborted,
} from "../command-outcomes.js"
import {
  isSharedAppError,
  normalizeProviderError,
  resolveAppCredentialsSnapshot,
  resolveCourseSnapshot,
  resolveGitDraft,
} from "../workflow-helpers.js"
import { withTemplateCheckout } from "./clone-execution.js"
import { requireGitOrganization } from "./common.js"
import {
  computeLocalTemplateDiff,
  resolveLocalTemplateSha,
} from "./git-helpers.js"
import {
  collectRepositoryGroups,
  describeTemplate,
  resolveAssignment,
  resolveAssignmentRepositoryTemplate,
  uniqueRepositoryNames,
} from "./planning.js"
import type { RepositoryWorkflowPorts } from "./ports.js"

function resolveRequiredAssignment(
  course: PersistedCourse,
  assignmentId: string,
) {
  const assignment = resolveAssignment(course, assignmentId)
  if (assignment !== null) {
    return assignment
  }
  throw createValidationAppError("Repository update assignment is invalid.", [
    {
      path: "input.assignmentId",
      message: `Assignment '${assignmentId}' was not found.`,
    },
  ])
}

function formatTemplateUpdateBody(
  assignmentName: string,
  fromSha: string,
  toSha: string,
  files: ReadonlyArray<{
    path: string
    previousPath: string | null
    status: string
  }>,
): string {
  const header = [
    `Template update for assignment '${assignmentName}'.`,
    "",
    `Source template diff: ${fromSha.slice(0, 7)} -> ${toSha.slice(0, 7)}`,
    "",
    "Changed files:",
  ]
  const lines = files.map((file) =>
    file.status === "renamed" && file.previousPath
      ? `- ${file.status}: ${file.previousPath} -> ${file.path}`
      : `- ${file.status}: ${file.path}`,
  )
  return header.concat(lines).join("\n")
}

/** A local template's head is its checked-out commit. A remote template's
 * head is its default branch on the Git server, read without a download so an
 * unchanged template needs none. */
async function readTemplateHead(
  ports: RepositoryWorkflowPorts,
  gitDraft: GitConnectionDraft,
  template: RepositoryTemplate,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (template.kind === "local") {
    const sha = await resolveLocalTemplateSha(
      ports.gitCommand,
      template.path,
      signal,
    )
    if (!sha.ok) {
      throw createValidationAppError(
        `Local template at '${template.path}' could not be read.`,
        [{ path: "template.path", message: sha.detail }],
      )
    }
    return sha.stdout
  }
  const head = await ports.git.getRepositoryDefaultBranchHead(
    gitDraft,
    { owner: template.owner, repositoryName: template.name },
    signal,
  )
  if (head === null) {
    throw commandRefusal({
      type: "provider",
      message: `Template repository '${template.owner}/${template.name}' was not found or has no commit on its default branch.`,
      provider: gitDraft.provider,
      operation: "getRepositoryDefaultBranchHead",
      retryable: true,
    } satisfies AppError)
  }
  return head.sha
}

export function createRepoUpdateHandler(
  ports: RepositoryWorkflowPorts,
): Pick<WorkflowHandlerMap<"repo.update">, "repo.update"> {
  return {
    "repo.update": async (
      input: RepositoryUpdateInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryUpdateResult> => {
      const totalSteps = 6
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading course and app settings snapshots.",
        })
        const course = resolveCourseSnapshot(input.course)
        const settings = resolveAppCredentialsSnapshot(input.credentials)
        throwIfAborted(options?.signal)
        const gitDraft = resolveGitDraft(settings)
        if (gitDraft === null) {
          throw commandRefusal({
            type: "not-found",
            message: "No Git connection is configured in settings.",
            resource: "connection",
          } satisfies AppError)
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.update")
        const assignment = resolveRequiredAssignment(course, input.assignmentId)

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from assignment groups.",
        })
        const planned = collectRepositoryGroups(course, assignment.id, "update")
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        const plannedRepositoryNames = uniqueRepositoryNames(planned.value)
        const recordedRepositories: RecordedRepositoriesByAssignment = {}
        const stageRecord = (
          assignmentIdToRecord: string,
          groupId: string,
          repoName: string,
        ) => {
          const existing = recordedRepositories[assignmentIdToRecord] ?? {}
          existing[groupId] = repoName
          recordedRepositories[assignmentIdToRecord] = existing
        }
        const unrecordedGroupsByRepoName = new Map<
          string,
          Array<(typeof planned.value)[number]>
        >()
        for (const group of planned.value) {
          if (group.isRecorded) continue
          const existing = unrecordedGroupsByRepoName.get(group.repoName)
          if (existing) {
            existing.push(group)
            continue
          }
          unrecordedGroupsByRepoName.set(group.repoName, [group])
        }
        if (plannedRepositoryNames.length === 0) {
          options?.onProgress?.({
            step: totalSteps,
            totalSteps,
            label: "Repository update workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            prsCreated: 0,
            prsSkipped: 0,
            prsFailed: 0,
            templateCommitSha: assignment.templateCommitSha ?? null,
            recordedRepositories,
            completedAt: new Date().toISOString(),
          }
        }

        const template =
          input.templateOverride ??
          resolveAssignmentRepositoryTemplate(
            course,
            assignment.id,
            course.repositoryTemplate,
          )
        if (template === null) {
          throw createValidationAppError(
            "Repository update requires a template repository.",
            [
              {
                path: "course.repositoryTemplate",
                message:
                  "Configure an assignment template or a course-level template first.",
              },
            ],
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Resolving template head and changed files.",
        })
        const currentSha = await readTemplateHead(
          ports,
          gitDraft,
          template,
          options?.signal,
        )

        const finishWithoutPullRequests = (
          output: DiagnosticOutput,
        ): RepositoryUpdateResult => {
          options?.onOutput?.(output)
          options?.onProgress?.({
            step: totalSteps,
            totalSteps,
            label: "Repository update workflow complete.",
          })
          return {
            repositoriesPlanned: plannedRepositoryNames.length,
            prsCreated: 0,
            prsSkipped: plannedRepositoryNames.length,
            prsFailed: 0,
            templateCommitSha: currentSha,
            recordedRepositories,
            completedAt: new Date().toISOString(),
          }
        }

        const fromSha = assignment.templateCommitSha ?? ""
        if (fromSha.trim() === "") {
          return finishWithoutPullRequests({
            channel: "warn",
            message:
              "Template baseline SHA is missing for this assignment. Skipping PR creation and returning the current template SHA for persistence.",
          })
        }
        if (fromSha === currentSha) {
          return finishWithoutPullRequests({
            channel: "info",
            message: "Template unchanged since the stored baseline SHA.",
          })
        }

        const diffFiles = await withTemplateCheckout({
          ports,
          gitDraft,
          template,
          signal: options?.signal,
          onOutput: options?.onOutput,
          read: async (checkout) => {
            if (!checkout.ok) {
              throw commandRefusal({
                type: "effect",
                message: `Could not clone template '${describeTemplate(template)}': ${checkout.detail}`,
              })
            }
            return computeLocalTemplateDiff(
              ports.gitCommand,
              checkout.path,
              fromSha,
              currentSha,
              options?.signal,
            )
          },
        })
        if (diffFiles.length === 0) {
          return finishWithoutPullRequests({
            channel: "info",
            message:
              "Template diff lists no changed files; skipping pull request creation.",
          })
        }

        const branchName = `template-update-${currentSha.slice(0, 7)}`
        const commitMessage = `Template update ${fromSha.slice(0, 7)} -> ${currentSha.slice(0, 7)}`
        const prTitle = "Template update"
        const prBody = formatTemplateUpdateBody(
          assignment.name,
          fromSha,
          currentSha,
          diffFiles,
        )

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Applying template updates to repository branches.",
        })
        const prCandidates: Array<{
          repositoryName: string
          baseBranch: string
        }> = []
        let prsFailed = 0
        for (const repositoryName of plannedRepositoryNames) {
          const head = await ports.git.getRepositoryDefaultBranchHead(
            gitDraft,
            {
              owner: organization,
              repositoryName,
            },
            options?.signal,
          )
          if (head === null) {
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Repository '${repositoryName}' was not found.`,
            })
            continue
          }
          const groupsForRepository =
            unrecordedGroupsByRepoName.get(repositoryName) ?? []
          for (const group of groupsForRepository) {
            stageRecord(group.assignmentId, group.groupId, group.repoName)
          }

          try {
            await ports.git.createBranch(
              gitDraft,
              {
                owner: organization,
                repositoryName,
                branchName,
                baseSha: head.sha,
                commitMessage,
                files: diffFiles,
              },
              options?.signal,
            )
          } catch (error) {
            if (!isCompletedGitEffectFailure(error)) throw error
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to apply template patch for '${repositoryName}': ${error.message}`,
            })
            continue
          }
          prCandidates.push({
            repositoryName,
            baseBranch: head.branchName,
          })
        }

        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Creating pull requests for updated repositories.",
        })
        let prsCreated = 0
        let prsSkipped = 0
        for (const candidate of prCandidates) {
          let pr: Awaited<ReturnType<GitProviderClient["createPullRequest"]>>
          try {
            pr = await ports.git.createPullRequest(
              gitDraft,
              {
                owner: organization,
                repositoryName: candidate.repositoryName,
                headBranch: branchName,
                baseBranch: candidate.baseBranch,
                title: prTitle,
                body: prBody,
              },
              options?.signal,
            )
          } catch (error) {
            if (!isCompletedGitEffectFailure(error)) throw error
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to create PR for '${candidate.repositoryName}': ${error.message}`,
            })
            continue
          }
          if (pr.created) {
            prsCreated += 1
            options?.onOutput?.({
              channel: "info",
              message: `Opened PR for '${candidate.repositoryName}': ${pr.url}`,
            })
          } else {
            prsSkipped += 1
            options?.onOutput?.({
              channel: "info",
              message: `Skipped PR for '${candidate.repositoryName}' (already exists or no changes).`,
            })
          }
        }

        options?.onOutput?.({
          channel: "info",
          message: `Repository update summary: planned ${plannedRepositoryNames.length}, prs created ${prsCreated}, skipped ${prsSkipped}, failed ${prsFailed}.`,
        })
        options?.onProgress?.({
          step: 6,
          totalSteps,
          label: "Repository update workflow complete.",
        })
        return {
          repositoriesPlanned: plannedRepositoryNames.length,
          prsCreated,
          prsSkipped,
          prsFailed,
          templateCommitSha: currentSha,
          recordedRepositories,
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        rethrowGitEffectFailure(error)
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "createPullRequest",
        )
      }
    },
  }
}
