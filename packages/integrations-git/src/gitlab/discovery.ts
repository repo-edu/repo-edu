import { compileRepoNamePattern } from "@repo-edu/domain/pattern-matching"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type {
  GitProviderClient,
  ListRepositoriesResult,
} from "@repo-edu/integrations-git-contract"
import { isNotFoundError } from "./errors.js"
import { resolveGroupId } from "./namespace.js"
import { createGitLabApi } from "./transport.js"
import { resolveGitLabUserId } from "./users.js"

function normalizeNamespacePath(namespace: string): string {
  return namespace.trim().replace(/^\/+|\/+$/g, "")
}

function resolveIdentity(
  project: { path?: unknown; name?: unknown; path_with_namespace?: unknown },
  namespace: string,
): { name: string; identifier: string } | null {
  const name =
    typeof project.path === "string" && project.path.length > 0
      ? project.path
      : String(project.name ?? "")
  if (name === "") return null
  const fullPath =
    typeof project.path_with_namespace === "string"
      ? project.path_with_namespace
      : ""
  const normalizedNamespace = normalizeNamespacePath(namespace)
  const prefix = `${normalizedNamespace}/`
  const identifier =
    normalizedNamespace !== "" &&
    fullPath.startsWith(prefix) &&
    fullPath.length > prefix.length
      ? fullPath.slice(prefix.length)
      : name
  return { name, identifier }
}

function appendProjects(
  repositories: ListRepositoriesResult["repositories"],
  projects: unknown[],
  namespace: string,
  includeArchived: boolean | undefined,
  matches: (name: string) => boolean,
  signal?: AbortSignal,
): void {
  for (const project of projects) {
    if (signal?.aborted) break
    const identity = resolveIdentity(
      project as {
        path?: unknown
        name?: unknown
        path_with_namespace?: unknown
      },
      namespace,
    )
    if (identity === null || !matches(identity.name)) continue
    const archived = Boolean((project as { archived?: unknown }).archived)
    if (archived && !includeArchived) continue
    repositories.push({ ...identity, archived })
  }
}

type DiscoveryCapability = Pick<GitProviderClient, "listRepositories">

export function createGitLabDiscovery(http: HttpPort): DiscoveryCapability {
  return {
    async listRepositories(draft, request, signal) {
      if (!request.namespace) return { repositories: [] }
      const matches = compileRepoNamePattern(request.filter)
      const api = createGitLabApi(http, draft, signal)
      const repositories: ListRepositoriesResult["repositories"] = []
      const groupId = await resolveGroupId(api, request.namespace)
      if (groupId !== null) {
        const projects = await api.Groups.allProjects(groupId, {
          perPage: 100,
          includeSubgroups: true,
        })
        appendProjects(
          repositories,
          projects,
          request.namespace,
          request.includeArchived,
          matches,
          signal,
        )
        return { repositories }
      }
      try {
        const userId = await resolveGitLabUserId(api, request.namespace)
        if (userId !== null) {
          appendProjects(
            repositories,
            await api.Users.allProjects(userId, { perPage: 100 }),
            request.namespace,
            request.includeArchived,
            matches,
            signal,
          )
        }
      } catch (error) {
        if (!isNotFoundError(error)) throw error
        // An unresolved namespace has no repository result.
      }
      return { repositories }
    },
  }
}
