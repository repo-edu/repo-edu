import type {
  AppError,
  AppValidationIssue,
  DiagnosticOutput,
  MilestoneProgress,
  RepositoryBulkCloneInput,
  RepositoryCloneResult,
  VerifyGitDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { createValidationAppError } from "../core.js"
import {
  isSharedAppError,
  normalizeProviderError,
  resolveAppCredentialsSnapshot,
  resolveGitDraft,
  throwIfAborted,
} from "../workflow-helpers.js"
import {
  admitRepositoryCloneTargets,
  runRepositoryClones,
} from "./clone-execution.js"
import {
  findRepositoryClonePathCollisions,
  normalizeTargetDirectory,
  repositoryCloneLeafPath,
  repositoryCloneTempRoot,
} from "./paths.js"
import type { RepositoryWorkflowPorts } from "./ports.js"

export function createRepoBulkCloneHandler(
  ports: RepositoryWorkflowPorts,
): Pick<WorkflowHandlerMap<"repo.bulkClone">, "repo.bulkClone"> {
  return {
    "repo.bulkClone": async (
      input: RepositoryBulkCloneInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryCloneResult> => {
      const totalSteps = 4
      let providerForError: VerifyGitDraftInput["provider"] = "github"

      try {
        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 1,
          totalSteps,
          label: "Reading app settings snapshot.",
        })
        const settings = resolveAppCredentialsSnapshot(input.credentials)
        const gitDraft = resolveGitDraft(settings)
        if (gitDraft === null) {
          throw {
            type: "not-found",
            message: "No Git connection is configured in settings.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider

        const targetDirectory = normalizeTargetDirectory(input.targetDirectory)
        if (targetDirectory === null) {
          throw createValidationAppError(
            "Repository bulk clone requires an absolute target directory.",
            [
              {
                path: "targetDirectory",
                message:
                  "Provide an absolute path or a path starting with '~'.",
              },
            ],
          )
        }

        if (input.repositories.length === 0) {
          options?.onProgress?.({
            step: totalSteps,
            totalSteps,
            label: "Repository bulk clone workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            repositoriesCloned: 0,
            repositoriesFailed: 0,
            recordedRepositories: {},
            completedAt: new Date().toISOString(),
          }
        }

        // Detect folder-name collisions up-front: entries whose leaf names
        // collapse to the same local path would otherwise race into the same
        // directory. We surface them as a validation error.
        const collisionIssues: AppValidationIssue[] =
          findRepositoryClonePathCollisions(
            input.repositories.map((entry) => ({
              path: repositoryCloneLeafPath(targetDirectory, entry.name),
              label: entry.identifier,
            })),
          ).map((collision) => ({
            path: "repositories",
            message: `Multiple repositories would clone into '${collision.path}': ${collision.labels.join(", ")}.`,
          }))
        if (collisionIssues.length > 0) {
          throw createValidationAppError(
            "Repository bulk clone would produce colliding local folder names.",
            collisionIssues,
          )
        }

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Resolving repository clone URLs.",
        })
        const resolved = await ports.git.resolveRepositoryCloneUrls(
          gitDraft,
          {
            organization: input.namespace,
            repositoryNames: input.repositories.map(
              (entry) => entry.identifier,
            ),
          },
          options?.signal,
        )
        const cloneUrlByIdentifier = new Map(
          resolved.resolved.map((entry) => [
            entry.repositoryName,
            entry.cloneUrl,
          ]),
        )

        const tempCloneRoot = repositoryCloneTempRoot(targetDirectory)
        const cloneTargets = input.repositories
          .map((entry) => {
            const cloneUrl = cloneUrlByIdentifier.get(entry.identifier)
            if (cloneUrl === undefined) return null
            return {
              repoName: entry.name,
              cloneUrl,
              path: repositoryCloneLeafPath(targetDirectory, entry.name),
            }
          })
          .filter(
            (target): target is NonNullable<typeof target> => target !== null,
          )

        const admission = await admitRepositoryCloneTargets({
          ports,
          targets: cloneTargets,
          parentDirectories: [targetDirectory, tempCloneRoot],
          conflictMessage:
            "Repository bulk clone target paths conflict with existing non-git entries.",
          signal: options?.signal,
        })

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Cloning repositories via system git.",
        })
        const execution = await runRepositoryClones({
          ports,
          targets: admission.toClone,
          tempCloneRoot,
          signal: options?.signal,
          onOutput: options?.onOutput,
        })
        const cloned = execution.cloned.length
        const failed = execution.failed.length
        options?.onOutput?.({
          channel: "info",
          message: `Bulk clone summary: planned ${input.repositories.length}, cloned ${cloned}, missing remote ${resolved.missing.length}, existing local ${admission.existing.length}, failed ${failed}.`,
        })

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Repository bulk clone workflow complete.",
        })
        return {
          repositoriesPlanned: input.repositories.length,
          repositoriesCloned: cloned,
          repositoriesFailed: failed + resolved.missing.length,
          recordedRepositories: {},
          completedAt: new Date().toISOString(),
        }
      } catch (error) {
        if (isSharedAppError(error)) {
          throw error
        }
        throw normalizeProviderError(
          error,
          providerForError,
          "resolveRepositoryCloneUrls",
        )
      }
    },
  }
}
