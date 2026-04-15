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
import type { FileSystemPort } from "@repo-edu/host-runtime-contract"
import { createValidationAppError } from "../core.js"
import {
  isSharedAppError,
  normalizeProviderError,
  resolveAppSettingsSnapshot,
  resolveGitDraft,
  throwIfAborted,
} from "../workflow-helpers.js"
import { normalizeRepositoryExecutionError } from "./common.js"
import {
  initPullClone,
  isGitRepositoryPath,
  mapConcurrent,
} from "./git-helpers.js"
import {
  normalizeTargetDirectory,
  repositoryCloneTempPath,
  repositoryCloneTempRoot,
} from "./paths.js"
import type { RepositoryWorkflowPorts } from "./ports.js"

function sanitizeRepoName(name: string): string {
  // Leaf repo names returned from a provider are already safe slugs, but guard
  // against separators to prevent path traversal.
  return name.replaceAll(/[\\/]/g, "_")
}

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
        const settings = resolveAppSettingsSnapshot(input.appSettings)
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
        const folderCollisionsByPath = new Map<string, string[]>()
        for (const entry of input.repositories) {
          const folderPath = `${targetDirectory}/${sanitizeRepoName(entry.name)}`
          const existing = folderCollisionsByPath.get(folderPath)
          if (existing === undefined) {
            folderCollisionsByPath.set(folderPath, [entry.identifier])
          } else {
            existing.push(entry.identifier)
          }
        }
        const collisionIssues: AppValidationIssue[] = []
        for (const [folderPath, identifiers] of folderCollisionsByPath) {
          if (identifiers.length > 1) {
            collisionIssues.push({
              path: "repositories",
              message: `Multiple repositories would clone into '${folderPath}': ${identifiers.join(", ")}.`,
            })
          }
        }
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
              path: `${targetDirectory}/${sanitizeRepoName(entry.name)}`,
            }
          })
          .filter(
            (target): target is NonNullable<typeof target> => target !== null,
          )

        try {
          await ports.fileSystem.applyBatch({
            operations: [
              { kind: "ensure-directory", path: targetDirectory },
              { kind: "ensure-directory", path: tempCloneRoot },
            ],
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
          if (entry.kind === "missing") continue
          const target = targetByPath.get(entry.path)
          if (target === undefined) continue
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
          if (target === undefined) continue
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
            "Repository bulk clone target paths conflict with existing non-git entries.",
            clashIssues,
          )
        }

        options?.onProgress?.({
          step: 3,
          totalSteps,
          label: "Cloning repositories via system git.",
        })
        let cloned = 0
        let failed = 0
        const toClone = cloneTargets.filter(
          (target) => !existingGitRepoPaths.has(target.path),
        )
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
        for (const result of cloneResults) {
          if (result === "cloned") cloned += 1
          else failed += 1
        }
        options?.onOutput?.({
          channel: "info",
          message: `Bulk clone summary: planned ${input.repositories.length}, cloned ${cloned}, missing remote ${resolved.missing.length}, existing local ${existingGitRepoPaths.size}, failed ${failed}.`,
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
