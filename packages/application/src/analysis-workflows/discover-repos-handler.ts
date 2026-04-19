import type {
  DiscoveredRepo,
  DiscoverReposProgress,
  WorkflowCallOptions,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import { basename, joinPath } from "../path-utils.js"
import { isGitRepositoryPath } from "../repository-workflows/git-helpers.js"
import { throwIfAborted } from "../workflow-helpers.js"
import type { AnalysisWorkflowPorts } from "./ports.js"

function isCancellationError(error: unknown): boolean {
  return (
    (isAppError(error) && error.type === "cancelled") ||
    (error instanceof DOMException && error.name === "AbortError")
  )
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

  if (await isGitRepositoryPath(ports.gitCommand, searchFolder, signal)) {
    return [{ name: basename(searchFolder), path: searchFolder }]
  }

  if (maxDepth <= 0) return []

  const entries = await ports.fileSystem.listDirectory({
    path: searchFolder,
    signal,
  })
  const systemDirectories = new Set(ports.fileSystem.userHomeSystemDirectories)
  const directories = entries.filter(
    (e) => e.kind === "directory" && !e.name.startsWith("."),
  )

  const repos: DiscoveredRepo[] = []
  const nonRepoDirs: string[] = []

  for (const dir of directories) {
    throwIfAborted(signal)
    const fullPath = joinPath(searchFolder, dir.name)
    if (systemDirectories.has(fullPath)) continue
    if (await isGitRepositoryPath(ports.gitCommand, fullPath, signal)) {
      repos.push({ name: dir.name, path: fullPath })
    } else {
      nonRepoDirs.push(fullPath)
    }
  }

  if (maxDepth > 1) {
    for (const dir of nonRepoDirs) {
      throwIfAborted(signal)
      try {
        const nested = await discoverRepos(
          ports,
          dir,
          maxDepth - 1,
          signal,
          onProgress,
        )
        repos.push(...nested)
      } catch (error) {
        if (isCancellationError(error)) {
          throw error
        }
      }
    }
  }

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
