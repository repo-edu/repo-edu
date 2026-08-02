import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  RecordedRepositoriesByAssignment,
  RepositoryBatchInput,
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
  resolveCourseSnapshot,
  resolveGitDraft,
  throwIfAborted,
} from "../workflow-helpers.js"
import {
  admitRepositoryCloneTargets,
  runRepositoryClones,
} from "./clone-execution.js"
import { requireGitOrganization } from "./common.js"
import {
  findRepositoryClonePathCollisions,
  normalizeDirectoryLayout,
  normalizeTargetDirectory,
  repositoryCloneParentPath,
  repositoryClonePath,
  repositoryCloneTempRoot,
} from "./paths.js"
import { collectRepositoryGroups, uniqueRepositoryNames } from "./planning.js"
import type { RepositoryWorkflowPorts } from "./ports.js"

export function createRepoCloneHandler(
  ports: RepositoryWorkflowPorts,
): Pick<WorkflowHandlerMap<"repo.clone">, "repo.clone"> {
  return {
    "repo.clone": async (
      input: RepositoryBatchInput,
      options?: WorkflowCallOptions<MilestoneProgress, DiagnosticOutput>,
    ): Promise<RepositoryCloneResult> => {
      const totalSteps = 5
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
          throw {
            type: "not-found",
            message: "No Git connection is configured in settings.",
            resource: "connection",
          } satisfies AppError
        }
        providerForError = gitDraft.provider
        const organization = requireGitOrganization(course, "repo.clone")
        const targetDirectory = normalizeTargetDirectory(input.targetDirectory)
        if (targetDirectory === null) {
          throw createValidationAppError(
            "Repository clone requires an absolute target directory.",
            [
              {
                path: "targetDirectory",
                message:
                  "Provide an absolute path or a path starting with '~'.",
              },
            ],
          )
        }

        options?.onProgress?.({
          step: 2,
          totalSteps,
          label: "Planning repositories from roster assignments.",
        })
        const planned = collectRepositoryGroups(
          course,
          input.assignmentId,
          "clone",
        )
        if (!planned.ok) {
          throw createValidationAppError(
            "Repository planning failed.",
            planned.issues,
          )
        }
        if (planned.value.length === 0) {
          options?.onProgress?.({
            step: 5,
            totalSteps,
            label: "Repository clone workflow complete.",
          })
          return {
            repositoriesPlanned: 0,
            repositoriesCloned: 0,
            repositoriesFailed: 0,
            recordedRepositories: {},
            completedAt: new Date().toISOString(),
          }
        }

        const layout = normalizeDirectoryLayout(input.directoryLayout)
        const plannedCloneTargets = planned.value.map((group) => ({
          group,
          parentPath: repositoryCloneParentPath(targetDirectory, layout, group),
          path: repositoryClonePath(targetDirectory, layout, group),
        }))
        const collisionIssues = findRepositoryClonePathCollisions(
          plannedCloneTargets.map(({ group, path }) => ({
            path,
            label: `${group.assignmentId}/${group.groupId} (${group.repoName})`,
          })),
        ).map((collision) => ({
          path: "targetDirectory",
          message: `Multiple planned repositories would clone into '${collision.path}': ${collision.labels.join(", ")}.`,
        }))
        if (collisionIssues.length > 0) {
          throw createValidationAppError(
            "Repository clone would produce colliding local paths.",
            collisionIssues,
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Resolving repository clone URLs with provider.",
        })
        const repositoryNames = uniqueRepositoryNames(planned.value)
        const resolved = await ports.git.resolveRepositoryCloneUrls(
          gitDraft,
          {
            organization,
            repositoryNames,
          },
          options?.signal,
        )
        const cloneUrlByRepoName = new Map(
          resolved.resolved.map((entry) => [
            entry.repositoryName,
            entry.cloneUrl,
          ]),
        )
        const tempCloneRoot = repositoryCloneTempRoot(targetDirectory)
        const parentDirectories = new Set<string>([
          targetDirectory,
          tempCloneRoot,
        ])
        const cloneTargets: Array<{
          repoName: string
          cloneUrl: string
          path: string
          assignmentId: string
          groupId: string
          isRecorded: boolean
        }> = []
        for (const plannedTarget of plannedCloneTargets) {
          const { group } = plannedTarget
          const cloneUrl = cloneUrlByRepoName.get(group.repoName)
          if (cloneUrl === undefined) {
            continue
          }
          parentDirectories.add(plannedTarget.parentPath)
          cloneTargets.push({
            repoName: group.repoName,
            cloneUrl,
            path: plannedTarget.path,
            assignmentId: group.assignmentId,
            groupId: group.groupId,
            isRecorded: group.isRecorded,
          })
        }

        const admission = await admitRepositoryCloneTargets({
          ports,
          targets: cloneTargets,
          parentDirectories,
          conflictMessage:
            "Repository clone target paths conflict with existing non-git entries.",
          signal: options?.signal,
        })

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Cloning repositories via system git.",
        })
        const skippedExistingNames: string[] = []
        const recordedRepositories: RecordedRepositoriesByAssignment = {}
        const stageRecord = (target: {
          assignmentId: string
          groupId: string
          repoName: string
          isRecorded: boolean
        }) => {
          if (target.isRecorded) return
          const existing = recordedRepositories[target.assignmentId] ?? {}
          existing[target.groupId] = target.repoName
          recordedRepositories[target.assignmentId] = existing
        }

        for (const target of admission.existing) {
          skippedExistingNames.push(target.repoName)
          stageRecord(target)
        }
        const execution = await runRepositoryClones({
          ports,
          targets: admission.toClone,
          tempCloneRoot,
          signal: options?.signal,
          onOutput: options?.onOutput,
        })
        for (const target of execution.cloned) {
          stageRecord(target)
        }
        const cloned = execution.cloned.length
        const failed = execution.failed.length
        options?.onOutput?.({
          channel: "info",
          message: `Repository clone summary: planned ${planned.value.length}, cloned ${cloned}, missing remote ${resolved.missing.length}, existing local ${skippedExistingNames.length}${skippedExistingNames.length > 0 ? ` (${skippedExistingNames.join(", ")})` : ""}, failed ${failed}.`,
        })

        throwIfAborted(options?.signal)
        options?.onProgress?.({
          step: 5,
          totalSteps,
          label: "Repository clone workflow complete.",
        })
        return {
          repositoriesPlanned: planned.value.length,
          repositoriesCloned: cloned,
          repositoriesFailed: failed + resolved.missing.length,
          recordedRepositories,
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
