import type {
  AppValidationIssue,
  DiagnosticOutput,
} from "@repo-edu/application-contract"
import type { FileSystemPort } from "@repo-edu/host-runtime-contract"
import { createValidationAppError } from "../core.js"
import { normalizeRepositoryExecutionError } from "./common.js"
import {
  initPullClone,
  isGitRepositoryPath,
  mapConcurrent,
} from "./git-helpers.js"
import { repositoryCloneTempPath } from "./paths.js"
import type { RepositoryWorkflowPorts } from "./ports.js"

export type RepositoryCloneTarget = {
  readonly repoName: string
  readonly cloneUrl: string
  readonly path: string
}

export type RepositoryCloneAdmission<T extends RepositoryCloneTarget> = {
  readonly toClone: readonly T[]
  readonly existing: readonly T[]
}

export type RepositoryCloneExecution<T extends RepositoryCloneTarget> = {
  readonly cloned: readonly T[]
  readonly failed: readonly T[]
}

type ClonePorts = Pick<RepositoryWorkflowPorts, "fileSystem" | "gitCommand">

export async function admitRepositoryCloneTargets<
  T extends RepositoryCloneTarget,
>(options: {
  ports: ClonePorts
  targets: readonly T[]
  parentDirectories: Iterable<string>
  conflictMessage: string
  signal?: AbortSignal
}): Promise<RepositoryCloneAdmission<T>> {
  const { ports, targets, conflictMessage, signal } = options

  try {
    await ports.fileSystem.applyBatch({
      operations: Array.from(options.parentDirectories).map((path) => ({
        kind: "ensure-directory" as const,
        path,
      })),
      signal,
    })
  } catch (error) {
    throw normalizeRepositoryExecutionError(error, "ensureDirectories")
  }

  let inspected: Awaited<ReturnType<FileSystemPort["inspect"]>> = []
  try {
    inspected = await ports.fileSystem.inspect({
      paths: targets.map((target) => target.path),
      signal,
    })
  } catch (error) {
    throw normalizeRepositoryExecutionError(error, "inspectCloneTargets")
  }

  const targetByPath = new Map(targets.map((target) => [target.path, target]))
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
    async (path) => ({
      path,
      isGitRepo: await isGitRepositoryPath(ports.gitCommand, path, signal),
    }),
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
    throw createValidationAppError(conflictMessage, clashIssues)
  }

  return {
    toClone: targets.filter((target) => !existingGitRepoPaths.has(target.path)),
    existing: targets.filter((target) => existingGitRepoPaths.has(target.path)),
  }
}

export async function runRepositoryClones<
  T extends RepositoryCloneTarget,
>(options: {
  ports: ClonePorts
  targets: readonly T[]
  tempCloneRoot: string
  signal?: AbortSignal
  onOutput?: (output: DiagnosticOutput) => void
}): Promise<RepositoryCloneExecution<T>> {
  const { ports, targets, tempCloneRoot, signal, onOutput } = options
  const cloneItems = targets.map((target, index) => ({
    target,
    tempPath: repositoryCloneTempPath(tempCloneRoot, target.repoName, index),
  }))

  const cloneResults = await mapConcurrent(
    cloneItems,
    async ({ target, tempPath }) => {
      const cleanupTempPath = async () => {
        try {
          await ports.fileSystem.applyBatch({
            operations: [{ kind: "delete-path", path: tempPath }],
            signal,
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
          tempPath,
          signal,
        )
        if (ok) {
          await ports.fileSystem.applyBatch({
            operations: [
              {
                kind: "copy-directory",
                sourcePath: tempPath,
                destinationPath: target.path,
              },
            ],
            signal,
          })
          await cleanupTempPath()
          return "cloned" as const
        }
        await cleanupTempPath()
        onOutput?.({
          channel: "warn",
          message: `git clone failed for '${target.repoName}': git pull returned non-zero exit code`,
        })
        return "failed" as const
      } catch (error) {
        await cleanupTempPath()
        onOutput?.({
          channel: "warn",
          message: `git clone failed for '${target.repoName}': ${error instanceof Error ? error.message : String(error)}`,
        })
        return "failed" as const
      }
    },
    8,
  )

  const cloned: T[] = []
  const failed: T[] = []
  for (let index = 0; index < cloneResults.length; index += 1) {
    if (cloneResults[index] === "cloned") {
      cloned.push(cloneItems[index].target)
    } else {
      failed.push(cloneItems[index].target)
    }
  }
  return { cloned, failed }
}
