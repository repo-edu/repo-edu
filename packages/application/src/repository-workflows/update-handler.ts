import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  RepositoryUpdateInput,
  RepositoryUpdateResult,
  VerifyGitDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain"
import type { PatchFile } from "@repo-edu/integrations-git-contract"
import { createValidationAppError } from "../core.js"
import {
  isSharedAppError,
  normalizeProviderError,
  resolveAppSettingsSnapshot,
  resolveCourseSnapshot,
  resolveGitDraft,
  throwIfAborted,
} from "../workflow-helpers.js"
import { requireGitOrganization } from "./common.js"
import {
  computeLocalTemplateDiff,
  resolveLocalTemplateSha,
} from "./git-helpers.js"
import {
  collectRepositoryGroups,
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
  const lines =
    files.length === 0
      ? ["- (No changed files reported by provider)"]
      : files.map((file) =>
          file.status === "renamed" && file.previousPath
            ? `- ${file.status}: ${file.previousPath} -> ${file.path}`
            : `- ${file.status}: ${file.path}`,
        )
  return header.concat(lines).join("\n")
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
        const settings = resolveAppSettingsSnapshot(input.appSettings)
        throwIfAborted(options?.signal)
        const gitDraft = resolveGitDraft(course, settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "Course does not reference a Git connection.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.update")
        const assignment = resolveRequiredAssignment(course, input.assignmentId)

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from assignment groups.",
        })
        const planned = collectRepositoryGroups(course, assignment.id)
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        const plannedRepositoryNames = uniqueRepositoryNames(planned.value)
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

        let currentSha: string
        let diffFiles: PatchFile[]

        if (template.kind === "local") {
          // Local template: compute SHA and diff locally.
          const sha = await resolveLocalTemplateSha(
            ports.gitCommand,
            template.path,
            options?.signal,
          )
          if (sha === null) {
            throw createValidationAppError(
              `Local template at '${template.path}' is not a valid Git repository.`,
              [
                {
                  path: "template.path",
                  message: "Ensure the template path is a Git repository.",
                },
              ],
            )
          }
          currentSha = sha

          const fromSha = assignment.templateCommitSha ?? null
          if (fromSha === null || fromSha.trim() === "") {
            options?.onOutput?.({
              channel: "warn",
              message:
                "Template baseline SHA is missing for this assignment. Skipping PR creation and returning the current template SHA for persistence.",
            })
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
              completedAt: new Date().toISOString(),
            }
          }

          if (fromSha === currentSha) {
            options?.onOutput?.({
              channel: "info",
              message: "Template unchanged since the stored baseline SHA.",
            })
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
              completedAt: new Date().toISOString(),
            }
          }

          diffFiles = await computeLocalTemplateDiff(
            ports.gitCommand,
            template.path,
            fromSha,
            currentSha,
            options?.signal,
          )
        } else {
          // Remote template: use Git provider API.
          const templateHead = await ports.git.getRepositoryDefaultBranchHead(
            gitDraft,
            {
              owner: template.owner,
              repositoryName: template.name,
            },
            options?.signal,
          )
          if (templateHead === null) {
            throw {
              type: "provider",
              message: `Template repository '${template.owner}/${template.name}' was not found.`,
              provider: providerForError,
              operation: "getRepositoryDefaultBranchHead",
              retryable: true,
            } satisfies AppError
          }
          currentSha = templateHead.sha

          const fromSha = assignment.templateCommitSha ?? null
          if (fromSha === null || fromSha.trim() === "") {
            options?.onOutput?.({
              channel: "warn",
              message:
                "Template baseline SHA is missing for this assignment. Skipping PR creation and returning the current template SHA for persistence.",
            })
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
              completedAt: new Date().toISOString(),
            }
          }

          if (fromSha === currentSha) {
            options?.onOutput?.({
              channel: "info",
              message: "Template unchanged since the stored baseline SHA.",
            })
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
              completedAt: new Date().toISOString(),
            }
          }

          const templateDiff = await ports.git.getTemplateDiff(
            gitDraft,
            {
              owner: template.owner,
              repositoryName: template.name,
              fromSha,
              toSha: currentSha,
            },
            options?.signal,
          )
          if (templateDiff === null) {
            throw {
              type: "provider",
              message:
                "Template diff could not be resolved from the Git provider.",
              provider: providerForError,
              operation: "getTemplateDiff",
              retryable: true,
            } satisfies AppError
          }
          diffFiles = templateDiff.files
        }

        const fromSha = assignment.templateCommitSha ?? ""
        if (diffFiles.length === 0) {
          options?.onOutput?.({
            channel: "info",
            message:
              "Template compare reported no file changes; skipping pull request creation.",
          })
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
            completedAt: new Date().toISOString(),
          }
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
            prCandidates.push({
              repositoryName,
              baseBranch: head.branchName,
            })
          } catch (error) {
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to apply template patch for '${repositoryName}': ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }

        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Creating pull requests for updated repositories.",
        })
        let prsCreated = 0
        let prsSkipped = 0
        for (const candidate of prCandidates) {
          try {
            const pr = await ports.git.createPullRequest(
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
          } catch (error) {
            prsFailed += 1
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to create PR for '${candidate.repositoryName}': ${error instanceof Error ? error.message : String(error)}`,
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
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
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
