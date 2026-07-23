import type { Gitlab } from "@gitbeaker/rest"
import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { resolveProjectId } from "./repository-api.js"
import { createGitLabApi, gitLabRestPost } from "./transport.js"
import { resolveGitLabUserId } from "./users.js"

function toTeamPathSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.startsWith("team-") ? slug : `team-${slug}`
}

export async function resolveGroupId(
  api: Gitlab,
  groupPath: string,
): Promise<number | null> {
  const group = await api.Groups.show(groupPath)
  const id = (group as { id?: unknown }).id
  return typeof id === "number" ? id : null
}

type TeamsCapability = Pick<
  GitProviderClient,
  "createTeam" | "assignRepositoriesToTeam"
>

export function createGitLabTeams(http: HttpPort): TeamsCapability {
  return {
    async createTeam(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const organizationId = await resolveGroupId(api, request.organization)
      if (organizationId === null) {
        throw new Error(
          `Organization '${request.organization}' was not found on GitLab.`,
        )
      }
      const teamSlug = toTeamPathSlug(request.teamName)
      const teamPath = `${request.organization}/${teamSlug}`
      let created = false
      let teamId: number | null = null
      const createdGroup = await gitLabRestPost(
        http,
        draft,
        "/groups",
        {
          name: request.teamName,
          path: teamSlug,
          parentId: organizationId,
          visibility: "private",
        },
        signal,
      )
      if (createdGroup.status >= 200 && createdGroup.status < 300) {
        const id = (createdGroup.data as { id?: unknown } | null)?.id
        if (typeof id === "number") {
          teamId = id
          created = true
        }
      }
      if (teamId === null) {
        if (createdGroup.status !== 400 && createdGroup.status !== 409) {
          throw new Error(
            `Failed to create team '${request.teamName}' (${createdGroup.status}).`,
          )
        }
        teamId = await resolveGroupId(api, teamPath)
      }
      if (teamId === null) {
        throw new Error(`Failed to resolve GitLab team '${teamPath}'.`)
      }

      const membersAdded: string[] = []
      const membersNotFound: string[] = []
      const accessLevel =
        request.permission === "admin"
          ? 40
          : request.permission === "pull"
            ? 20
            : 30
      for (const username of request.memberUsernames) {
        if (signal?.aborted) break
        const userId = await resolveGitLabUserId(api, username)
        if (userId === null) {
          membersNotFound.push(username)
          continue
        }
        const response = await gitLabRestPost(
          http,
          draft,
          `/groups/${teamId}/members`,
          { userId, accessLevel },
          signal,
        )
        if (
          (response.status >= 200 && response.status < 300) ||
          response.status === 409
        ) {
          membersAdded.push(username)
          continue
        }
        throw new Error(
          `Failed to add '${username}' to team '${request.teamName}' (${response.status}).`,
        )
      }
      return { created, teamSlug, membersAdded, membersNotFound }
    },
    async assignRepositoriesToTeam(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const teamPath = `${request.organization}/${request.teamSlug}`
      const teamId = await resolveGroupId(api, teamPath)
      if (teamId === null) {
        throw new Error(`GitLab team '${teamPath}' not found.`)
      }
      const groupAccess =
        request.permission === "admin"
          ? 40
          : request.permission === "pull"
            ? 20
            : 30
      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) break
        const projectPath = `${request.organization}/${repositoryName}`
        const projectId = await resolveProjectId(api, projectPath)
        if (projectId === null) {
          throw new Error(`GitLab project '${projectPath}' not found.`)
        }
        const response = await gitLabRestPost(
          http,
          draft,
          `/projects/${projectId}/share`,
          { groupId: teamId, groupAccess },
          signal,
        )
        if (
          (response.status >= 200 && response.status < 300) ||
          response.status === 409
        ) {
          continue
        }
        throw new Error(
          `Failed to assign '${repositoryName}' to team '${request.teamSlug}' (${response.status}).`,
        )
      }
    },
  }
}
