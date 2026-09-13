import { basename, join } from "node:path"
import type {
  DiscoveredRepo,
  DiscoverReposProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import type { FileSystemDirectoryEntry } from "@repo-edu/host-runtime-contract"
import { resolveGitRepositoryRoot } from "../repository-workflows/git-helpers.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { AnalysisWorkflowPorts } from "./ports.js"

// A repository root carries a `.git` entry: a directory for an ordinary
// clone, a file for a worktree or submodule checkout. The walk reads that
// entry from the listing it needs anyway, so no git process runs per folder.
const GIT_ENTRY_NAME = ".git"

function isCancellationError(error: unknown): boolean {
  return (
    (isAppError(error) && error.type === "cancelled") ||
    (error instanceof DOMException && error.name === "AbortError")
  )
}

function isRepositoryRoot(entries: readonly FileSystemDirectoryEntry[]) {
  return entries.some((entry) => entry.name === GIT_ENTRY_NAME)
}

type WalkContext = {
  ports: AnalysisWorkflowPorts
  systemDirectories: ReadonlySet<string>
  signal: AbortSignal | undefined
  onProgress: ((progress: DiscoverReposProgress) => void) | undefined
}

/** Walks the child folders of one listed folder while depth remains. A
 * listing failure inside a child skips that child, while cancellation always
 * propagates. */
async function walkChildren(
  context: WalkContext,
  folder: string,
  entries: readonly FileSystemDirectoryEntry[],
  remainingDepth: number,
): Promise<DiscoveredRepo[]> {
  if (remainingDepth <= 0) return []
  const repos: DiscoveredRepo[] = []
  for (const entry of entries) {
    if (entry.kind !== "directory" || entry.name.startsWith(".")) continue
    const childPath = join(folder, entry.name)
    if (context.systemDirectories.has(childPath)) continue
    try {
      repos.push(...(await walkFolder(context, childPath, remainingDepth - 1)))
    } catch (error) {
      if (isCancellationError(error)) throw error
    }
  }
  return repos
}

/** Lists one folder: a repository root ends the walk there, any other folder
 * descends into its children. */
async function walkFolder(
  context: WalkContext,
  folder: string,
  remainingDepth: number,
): Promise<DiscoveredRepo[]> {
  throwIfAborted(context.signal)
  context.onProgress?.({ currentFolder: folder })
  const entries = await context.ports.fileSystem.listDirectory({
    path: folder,
    signal: context.signal,
  })
  if (isRepositoryRoot(entries)) {
    return [{ name: basename(folder), path: folder }]
  }
  return walkChildren(context, folder, entries, remainingDepth)
}

async function discoverRepos(
  ports: AnalysisWorkflowPorts,
  searchFolder: string,
  maxDepth: number,
  signal: AbortSignal | undefined,
  onProgress: ((progress: DiscoverReposProgress) => void) | undefined,
): Promise<DiscoveredRepo[]> {
  throwIfAborted(signal)
  onProgress?.({ currentFolder: searchFolder })

  // Only the search folder may sit inside a repository whose root lies above
  // it, so git resolves that one case. Every folder below is a root or not,
  // which its own listing tells.
  const toplevel = await resolveGitRepositoryRoot(
    ports.gitCommand,
    searchFolder,
    signal,
  )
  if (toplevel !== null) {
    return [{ name: basename(toplevel), path: toplevel }]
  }
  if (maxDepth <= 0) return []

  const context: WalkContext = {
    ports,
    systemDirectories: new Set(ports.fileSystem.userHomeSystemDirectories),
    signal,
    onProgress,
  }
  // The search folder's own listing failure is the caller's error; only
  // failures below it are skipped.
  const entries = await ports.fileSystem.listDirectory({
    path: searchFolder,
    signal,
  })
  const repos = await walkChildren(context, searchFolder, entries, maxDepth)
  repos.sort((a, b) => a.name.localeCompare(b.name))
  return repos
}

export function createDiscoverReposHandler(
  ports: AnalysisWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"analysis.discoverRepos">,
  "analysis.discoverRepos"
> {
  return {
    "analysis.discoverRepos": async (input, options) => {
      const typedOptions = options as
        | WorkflowCallOptions<DiscoverReposProgress, never>
        | undefined
      const signal = typedOptions?.signal
      const onProgress = typedOptions?.onProgress
      const repos = await discoverRepos(
        ports,
        input.searchFolder,
        input.maxDepth ?? 1,
        signal,
        onProgress,
      )
      return { repos }
    },
  }
}
