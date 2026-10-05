import type {
  AppValidationIssue,
  DiagnosticOutput,
} from "@repo-edu/application-contract"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import type {
  RemoteRepositoryTemplate,
  RepositoryTemplate,
} from "@repo-edu/domain/types"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import {
  commandValidationError as createValidationAppError,
  isCompletedCommandFailure,
} from "../command-outcomes.js"
import {
  checkRepositoryFolder,
  cloneRemoteTemplateToTmpdir,
  initPullClone,
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
type Output = ((output: DiagnosticOutput) => void) | undefined

/** Removal ignores Cancel. A proven stop leaves no Git process writing to the
 * temporary folder, so the delete may run after it. */
async function removeTemporaryFolder(
  ports: Pick<RepositoryWorkflowPorts, "fileSystem">,
  path: string,
  onOutput: Output,
): Promise<void> {
  try {
    await ports.fileSystem.applyBatch({
      operations: [{ kind: "delete-path", path }],
    })
  } catch (error) {
    if (!isCompletedCommandFailure(error)) throw error
    onOutput?.({
      channel: "warn",
      message: `Could not remove the temporary folder '${path}': ${error.message}`,
    })
  }
}

/** Unknown outside work must not be followed by deletion of its folder. */
function leavesUnknownWork(error: unknown): boolean {
  return (
    error instanceof CommandOutcomeError &&
    error.outcome.disposition === "uncertain"
  )
}

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

  const inspected = await ports.fileSystem.inspect({
    paths: targets.map((target) => target.path),
    signal,
  })

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
      check: await checkRepositoryFolder(ports.gitCommand, path, signal),
    }),
    8,
  )
  for (const { path, check } of existingDirectoryChecks) {
    const target = targetByPath.get(path)
    if (target === undefined) continue
    if (check.ok) {
      existingGitRepoPaths.add(path)
      continue
    }
    clashIssues.push({
      path: "targetDirectory",
      message: `Target path '${path}' for repository '${target.repoName}' already exists and is not a readable Git repository: ${check.detail}`,
    })
  }
  if (clashIssues.length > 0) {
    throw createValidationAppError(conflictMessage, clashIssues)
  }

  await ports.fileSystem.applyBatch({
    operations: Array.from(options.parentDirectories).map((path) => ({
      kind: "ensure-directory" as const,
      path,
    })),
    signal,
  })

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
      try {
        await removeTemporaryFolder(ports, tempPath, onOutput)
        const clone = await initPullClone(
          ports.gitCommand,
          target.cloneUrl,
          tempPath,
          signal,
        )
        if (clone.ok) {
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
          await removeTemporaryFolder(ports, tempPath, onOutput)
          return "cloned" as const
        }
        await removeTemporaryFolder(ports, tempPath, onOutput)
        onOutput?.({
          channel: "warn",
          message: `git clone failed for '${target.repoName}': ${clone.detail}`,
        })
        return "failed" as const
      } catch (error) {
        if (!leavesUnknownWork(error))
          await removeTemporaryFolder(ports, tempPath, onOutput)
        throw error
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

export type TemplateCheckout =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly detail: string }

/** Create and Update read a template from a local folder: a local template in
 * place and a remote one from a temporary clone. The clone is removed on
 * every ending except an unknown one. */
export async function withTemplateCheckout<T>(options: {
  ports: Pick<RepositoryWorkflowPorts, "git" | "gitCommand" | "fileSystem">
  gitDraft: GitConnectionDraft
  template: RepositoryTemplate
  signal?: AbortSignal
  onOutput?: (output: DiagnosticOutput) => void
  read: (checkout: TemplateCheckout) => Promise<T>
}): Promise<T> {
  const { ports, template, onOutput, read } = options
  if (template.kind === "local") return read({ ok: true, path: template.path })

  const tempPath =
    await ports.fileSystem.createTempDirectory("repo-edu-template-")
  let result: T
  try {
    result = await read(
      await cloneTemplate(
        ports,
        options.gitDraft,
        template,
        tempPath,
        options.signal,
      ),
    )
  } catch (error) {
    if (!leavesUnknownWork(error))
      await removeTemporaryFolder(ports, tempPath, onOutput)
    throw error
  }
  await removeTemporaryFolder(ports, tempPath, onOutput)
  return result
}

async function cloneTemplate(
  ports: Pick<RepositoryWorkflowPorts, "git" | "gitCommand">,
  gitDraft: GitConnectionDraft,
  template: RemoteRepositoryTemplate,
  tempPath: string,
  signal: AbortSignal | undefined,
): Promise<TemplateCheckout> {
  const resolved = await ports.git.resolveRepositoryCloneUrls(
    gitDraft,
    { organization: template.owner, repositoryNames: [template.name] },
    signal,
  )
  const cloneUrl = resolved.resolved.find(
    (entry) => entry.repositoryName === template.name,
  )?.cloneUrl
  if (cloneUrl === undefined) {
    return {
      ok: false,
      detail: `the Git server has no repository '${template.owner}/${template.name}'.`,
    }
  }
  const cloned = await cloneRemoteTemplateToTmpdir(
    ports.gitCommand,
    cloneUrl,
    tempPath,
    signal,
  )
  return cloned.ok ? { ok: true, path: tempPath } : cloned
}
