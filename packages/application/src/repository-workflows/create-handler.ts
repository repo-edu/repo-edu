import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  RepositoryBatchInput,
  RepositoryCreateResult,
  VerifyGitDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
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
  cloneRemoteTemplateToTmpdir,
  mapConcurrent,
  pushTemplateToRepo,
  resolveLocalDefaultBranch,
  resolveLocalTemplateSha,
} from "./git-helpers.js"
import {
  collectRepositoryGroups,
  createRepositoryBatches,
  describeTemplate,
  planRepositoriesWithTemplates,
  planTeamSetup,
  templateKey,
} from "./planning.js"
import type { RepositoryWorkflowPorts } from "./ports.js"

export function createRepoCreateHandler(
  ports: RepositoryWorkflowPorts,
): Pick<WorkflowHandlerMap<"repo.create">, "repo.create"> {
  return {
    "repo.create": async (
      input: RepositoryBatchInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryCreateResult> => {
      const totalSteps = 7
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
        const organization = requireGitOrganization(course, "repo.create")

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(course, input.assignmentId)
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        const plannedWithTemplates = planRepositoriesWithTemplates(
          course,
          planned.value,
          input.template,
        )
        if (!plannedWithTemplates.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            plannedWithTemplates.issues,
          )
        }

        if (planned.value.length === 0) {
          options?.onProgress?.({
            step: totalSteps,
            totalSteps,
            label: "Repository create workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            repositoriesCreated: 0,
            repositoriesAlreadyExisted: 0,
            repositoriesFailed: 0,
            templateCommitShas: {},
            completedAt: new Date().toISOString(),
          }
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Creating repositories through Git provider client.",
        })
        const batches = createRepositoryBatches(plannedWithTemplates.value)
        const created: Awaited<
          ReturnType<GitProviderClient["createRepositories"]>
        >["created"] = []
        const alreadyExisted: Awaited<
          ReturnType<GitProviderClient["createRepositories"]>
        >["alreadyExisted"] = []
        const failed: Awaited<
          ReturnType<GitProviderClient["createRepositories"]>
        >["failed"] = []

        for (const batch of batches) {
          const createResult = await ports.git.createRepositories(
            gitDraft,
            {
              organization,
              repositoryNames: batch.repositoryNames,
              visibility: batch.template?.visibility ?? "private",
              autoInit: batch.template === null,
            },
            options?.signal,
          )
          created.push(...createResult.created)
          alreadyExisted.push(...createResult.alreadyExisted)
          failed.push(...createResult.failed)
          options?.onOutput?.({
            channel: "info",
            message: `Create batch (${describeTemplate(batch.template)}): created ${createResult.created.length}, existing ${createResult.alreadyExisted.length}, failed ${createResult.failed.length}.`,
          })
        }

        for (const repository of alreadyExisted) {
          options?.onOutput?.({
            channel: "info",
            message: `Repository '${repository.repositoryName}' already exists.`,
          })
        }
        for (const repository of failed) {
          options?.onOutput?.({
            channel: "warn",
            message: `Repository '${repository.repositoryName}' failed: ${repository.reason}`,
          })
        }

        const successfulRepositoryNames = new Set(
          created
            .concat(alreadyExisted)
            .map((repository) => repository.repositoryName),
        )
        if (planned.value.length > 0 && successfulRepositoryNames.size === 0) {
          throw {
            type: "provider",
            message: "Repository creation failed for all planned repositories.",
            provider: providerForError,
            operation: "createRepositories",
            retryable: true,
          } satisfies AppError
        }

        // Step 4: Push template content to newly created repos.
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Pushing template content to repositories.",
        })

        const templateCommitShas: Record<string, string> = {}
        const templateBatches = batches.filter(
          (batch) => batch.template !== null,
        )

        const newlyCreatedNames = new Set(created.map((r) => r.repositoryName))
        const tmpDirsToCleanup: string[] = []

        for (const batch of templateBatches) {
          const template = batch.template
          if (template === null) continue
          const reposToPopulate = batch.repositoryNames.filter((name) =>
            newlyCreatedNames.has(name),
          )

          if (reposToPopulate.length === 0) {
            continue
          }

          let templateLocalPath: string

          if (template.kind === "local") {
            templateLocalPath = template.path
          } else {
            // Clone remote template to tmpdir.
            const tmpDir =
              await ports.fileSystem.createTempDirectory("repo-edu-template-")
            tmpDirsToCleanup.push(tmpDir)

            const templateAuthUrl = (
              await ports.git.resolveRepositoryCloneUrls(
                gitDraft,
                {
                  organization: template.owner,
                  repositoryNames: [template.name],
                },
                options?.signal,
              )
            ).resolved[0]?.cloneUrl

            if (!templateAuthUrl) {
              options?.onOutput?.({
                channel: "warn",
                message: `Could not resolve clone URL for template '${describeTemplate(template)}'.`,
              })
              continue
            }

            const cloned = await cloneRemoteTemplateToTmpdir(
              ports.gitCommand,
              templateAuthUrl,
              tmpDir,
              options?.signal,
            )
            if (!cloned) {
              options?.onOutput?.({
                channel: "warn",
                message: `Failed to clone template '${describeTemplate(template)}'.`,
              })
              continue
            }

            templateLocalPath = tmpDir
          }

          const defaultBranch = await resolveLocalDefaultBranch(
            ports.gitCommand,
            templateLocalPath,
            options?.signal,
          )

          // Resolve auth URLs for target repos.
          const targetUrls = await ports.git.resolveRepositoryCloneUrls(
            gitDraft,
            { organization, repositoryNames: reposToPopulate },
            options?.signal,
          )

          const pushItems = targetUrls.resolved.map((r) => ({
            repoName: r.repositoryName,
            authUrl: r.cloneUrl,
          }))

          const pushResults = await mapConcurrent(
            pushItems,
            async (item) => {
              const ok = await pushTemplateToRepo(
                ports.gitCommand,
                templateLocalPath,
                item.authUrl,
                defaultBranch,
                options?.signal,
              )
              if (!ok) {
                options?.onOutput?.({
                  channel: "warn",
                  message: `Failed to push template to '${item.repoName}'.`,
                })
              }
              return ok
            },
            8,
          )

          const pushSuccessCount = pushResults.filter(Boolean).length
          options?.onOutput?.({
            channel: "info",
            message: `Pushed template '${describeTemplate(template)}' to ${pushSuccessCount}/${pushItems.length} repositories.`,
          })

          // Capture template commit SHA.
          try {
            const sha = await resolveLocalTemplateSha(
              ports.gitCommand,
              templateLocalPath,
              options?.signal,
            )
            if (sha !== null) {
              for (const entry of plannedWithTemplates.value) {
                if (
                  entry.template !== null &&
                  templateKey(entry.template) === templateKey(template) &&
                  successfulRepositoryNames.has(entry.group.repoName)
                ) {
                  templateCommitShas[entry.group.assignmentId] = sha
                }
              }
            }
          } catch {
            // Best-effort: template commit tracking should not fail repo creation.
          }
        }

        // Cleanup temporary directories.
        for (const tmpDir of tmpDirsToCleanup) {
          try {
            await ports.fileSystem.applyBatch({
              operations: [{ kind: "delete-path", path: tmpDir }],
            })
          } catch {
            // Best-effort cleanup.
          }
        }

        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Creating teams and assigning members.",
        })
        const teams = planTeamSetup(planned.value)
        const teamSlugByGroupId = new Map<string, string>()
        for (const team of teams) {
          try {
            const result = await ports.git.createTeam(
              gitDraft,
              {
                organization,
                teamName: team.teamName,
                memberUsernames: team.gitUsernames,
                permission: "push",
              },
              options?.signal,
            )
            teamSlugByGroupId.set(team.groupId, result.teamSlug)
            if (result.membersNotFound.length > 0) {
              options?.onOutput?.({
                channel: "warn",
                message: `Team '${team.teamName}' missing members: ${result.membersNotFound.join(", ")}.`,
              })
            }
            options?.onOutput?.({
              channel: "info",
              message: `Team '${team.teamName}' ${result.created ? "created" : "reused"} with ${result.membersAdded.length} members added.`,
            })
          } catch (error) {
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to create team '${team.teamName}': ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 6,
          totalSteps,
          label: "Assigning repositories to teams.",
        })
        for (const team of teams) {
          const teamSlug = teamSlugByGroupId.get(team.groupId)
          if (teamSlug === undefined) {
            continue
          }
          const repositoryNames = team.repositoryNames.filter(
            (repositoryName) => successfulRepositoryNames.has(repositoryName),
          )
          if (repositoryNames.length === 0) {
            continue
          }
          try {
            await ports.git.assignRepositoriesToTeam(
              gitDraft,
              {
                organization,
                teamSlug,
                repositoryNames,
                permission: "push",
              },
              options?.signal,
            )
            options?.onOutput?.({
              channel: "info",
              message: `Assigned ${repositoryNames.length} repositories to team '${team.teamName}'.`,
            })
          } catch (error) {
            options?.onOutput?.({
              channel: "warn",
              message: `Failed to assign repositories to team '${team.teamName}': ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        }

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 7,
          totalSteps,
          label: "Repository create workflow complete.",
        })

        options?.onOutput?.({
          channel: "info",
          message: `Repository create summary: planned ${planned.value.length}, created ${created.length}, existing ${alreadyExisted.length}, failed ${failed.length}.`,
        })

        return {
          repositoriesPlanned: planned.value.length,
          repositoriesCreated: created.length,
          repositoriesAlreadyExisted: alreadyExisted.length,
          repositoriesFailed: failed.length,
          templateCommitShas,
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "createRepositories",
        )
      }
    },
  }
}
