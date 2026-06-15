import type {
  AppError,
  AppValidationIssue,
  DiagnosticOutput,
  MilestoneProgress,
  RecordedRepositoriesByAssignment,
  RepositoryBatchInput,
  RepositoryCloneResult,
  VerifyGitDraftInput,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { FileSystemPort } from "@repo-edu/host-runtime-contract"
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
  normalizeRepositoryExecutionError,
  requireGitOrganization,
} from "./common.js"
import {
  initPullClone,
  isGitRepositoryPath,
  mapConcurrent,
} from "./git-helpers.js"
import {
  normalizeDirectoryLayout,
  normalizeTargetDirectory,
  repositoryCloneParentPath,
  repositoryClonePath,
  repositoryCloneTempPath,
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
        const layout = normalizeDirectoryLayout(input.directoryLayout)
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
        for (const group of planned.value) {
          const cloneUrl = cloneUrlByRepoName.get(group.repoName)
          if (cloneUrl === undefined) {
            continue
          }
          const parentPath = repositoryCloneParentPath(
            targetDirectory,
            layout,
            group,
          )
          parentDirectories.add(parentPath)
          cloneTargets.push({
            repoName: group.repoName,
            cloneUrl,
            path: repositoryClonePath(targetDirectory, layout, group),
            assignmentId: group.assignmentId,
            groupId: group.groupId,
            isRecorded: group.isRecorded,
          })
        }

        try {
          await ports.fileSystem.applyBatch({
            operations: Array.from(parentDirectories).map((path) => ({
              kind: "ensure-directory" as const,
              path,
            })),
            signal: options?.signal,
          })
        } catch (error) {
          throw normalizeRepositoryExecutionError(error, "ensureDirectories")
        }

        let inspected: Awaited<ReturnType<FileSystemPort["inspect"]>> = []
        try {
          inspected = await ports.fileSystem.inspect({
            paths: cloneTargets.map((target) => target.path),
            signal: options?.signal,
          })
        } catch (error) {
          throw normalizeRepositoryExecutionError(error, "inspectCloneTargets")
        }
        const targetByPath = new Map(
          cloneTargets.map((target) => [target.path, target]),
        )
        const clashIssues: AppValidationIssue[] = []
        const existingDirectoryPaths: string[] = []
        for (const entry of inspected) {
          if (entry.kind === "missing") {
            continue
          }
          const target = targetByPath.get(entry.path)
          if (target === undefined) {
            continue
          }
          if (entry.kind === "file") {
            clashIssues.push({
              path: "targetDirectory",
              message: `Target path '${entry.path}' for repository '${target.repoName}' already exists as a file.`,
            })
            continue
          }
          existingDirectoryPaths.push(entry.path)
        }
        const existingGitRepoPaths = new Set<string>()
        const existingDirectoryChecks = await mapConcurrent(
          existingDirectoryPaths,
          async (path) => {
            const isGitRepo = await isGitRepositoryPath(
              ports.gitCommand,
              path,
              options?.signal,
            )
            return { path, isGitRepo }
          },
          8,
        )
        for (const check of existingDirectoryChecks) {
          const target = targetByPath.get(check.path)
          if (target === undefined) {
            continue
          }
          if (check.isGitRepo) {
            existingGitRepoPaths.add(check.path)
            continue
          }
          clashIssues.push({
            path: "targetDirectory",
            message: `Target path '${check.path}' for repository '${target.repoName}' already exists and is not a Git repository.`,
          })
        }
        if (clashIssues.length > 0) {
          throw createValidationAppError(
            "Repository clone target paths conflict with existing non-git entries.",
            clashIssues,
          )
        }

        options?.onProgress?.({
          step: 4,
          totalSteps,
          label: "Cloning repositories via system git.",
        })
        let cloned = 0
        let failed = 0
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

        const toClone = cloneTargets.filter((target) => {
          if (existingGitRepoPaths.has(target.path)) {
            skippedExistingNames.push(target.repoName)
            stageRecord(target)
            return false
          }
          return true
        })
        const cloneItems = toClone.map((target, index) => ({
          ...target,
          tempPath: repositoryCloneTempPath(
            tempCloneRoot,
            target.repoName,
            index,
          ),
        }))

        const cloneResults = await mapConcurrent(
          cloneItems,
          async (target) => {
            const cleanupTempPath = async () => {
              try {
                await ports.fileSystem.applyBatch({
                  operations: [{ kind: "delete-path", path: target.tempPath }],
                  signal: options?.signal,
                })
              } catch {
                // Best effort cleanup.
              }
            }
            try {
              await cleanupTempPath()
              const ok = await initPullClone(
                ports.gitCommand,
                target.cloneUrl,
                target.tempPath,
                options?.signal,
              )
              if (ok) {
                await ports.fileSystem.applyBatch({
                  operations: [
                    {
                      kind: "copy-directory",
                      sourcePath: target.tempPath,
                      destinationPath: target.path,
                    },
                  ],
                  signal: options?.signal,
                })
                await cleanupTempPath()
                return "cloned" as const
              }
              await cleanupTempPath()
              options?.onOutput?.({
                channel: "warn",
                message: `git clone failed for '${target.repoName}': git pull returned non-zero exit code`,
              })
              return "failed" as const
            } catch (error) {
              await cleanupTempPath()
              options?.onOutput?.({
                channel: "warn",
                message: `git clone failed for '${target.repoName}': ${error instanceof Error ? error.message : String(error)}`,
              })
              return "failed" as const
            }
          },
          8,
        )
        for (let index = 0; index < cloneResults.length; index += 1) {
          if (cloneResults[index] === "cloned") {
            cloned += 1
            stageRecord(cloneItems[index])
          } else {
            failed += 1
          }
        }
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
