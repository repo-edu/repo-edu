import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import {
  gitEffectFailure,
  throwIfGitEffectAborted,
} from "../invocation-guard.js"
import { buildTeamName } from "../team-name.js"
import {
  isAlreadySharedWithGroup,
  isMemberAlreadyExists,
  isNameTaken,
} from "./errors.js"
import { resolveGroupId } from "./namespace.js"
import { resolveProjectId } from "./repository-api.js"
import { createGitLabApi, gitLabRestPost } from "./transport.js"
import { resolveGitLabUserId } from "./users.js"

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
        throw gitEffectFailure(
          "completed",
          `Organization '${request.organization}' was not found on GitLab.`,
        )
      }
      // GitLab refuses a sibling group with the same name or path, so both
      // carry the team's name.
      const teamSlug = buildTeamName(request)
      const teamPath = `${request.organization}/${teamSlug}`
      let created = false
      let teamId: number | null
      try {
        const group = await gitLabRestPost(
          http,
          draft,
          "/groups",
          {
            name: teamSlug,
            path: teamSlug,
            parentId: organizationId,
            visibility: "private",
          },
          signal,
        )
        const id = (group as { id?: unknown } | null)?.id
        if (typeof id !== "number") {
          throw gitEffectFailure(
            "completed",
            `GitLab created team group '${teamPath}' but answered without its id.`,
          )
        }
        teamId = id
        created = true
      } catch (error) {
        if (!isNameTaken(error)) throw error
        teamId = await resolveGroupId(api, teamPath)
      }
      if (teamId === null) {
        throw gitEffectFailure(
          "completed",
          `GitLab answered that team '${teamSlug}' is taken, but no group exists at '${teamPath}'.`,
        )
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
        throwIfGitEffectAborted(signal)
        const userId = await resolveGitLabUserId(api, username)
        if (userId === null) {
          membersNotFound.push(username)
          continue
        }
        try {
          await gitLabRestPost(
            http,
            draft,
            `/groups/${teamId}/members`,
            { userId, accessLevel },
            signal,
          )
        } catch (error) {
          if (!isMemberAlreadyExists(error)) throw error
        }
        membersAdded.push(username)
      }
      return { created, teamSlug, membersAdded, membersNotFound }
    },
    async assignRepositoriesToTeam(draft, request, signal) {
      const api = createGitLabApi(http, draft, signal)
      const teamPath = `${request.organization}/${request.teamSlug}`
      const teamId = await resolveGroupId(api, teamPath)
      if (teamId === null) {
        throw gitEffectFailure(
          "completed",
          `GitLab team '${teamPath}' not found.`,
        )
      }
      const groupAccess =
        request.permission === "admin"
          ? 40
          : request.permission === "pull"
            ? 20
            : 30
      for (const repositoryName of request.repositoryNames) {
        throwIfGitEffectAborted(signal)
        const projectPath = `${request.organization}/${repositoryName}`
        const projectId = await resolveProjectId(api, projectPath)
        if (projectId === null) {
          throw gitEffectFailure(
            "completed",
            `GitLab project '${projectPath}' not found.`,
          )
        }
        try {
          await gitLabRestPost(
            http,
            draft,
            `/projects/${projectId}/share`,
            { groupId: teamId, groupAccess },
            signal,
          )
        } catch (error) {
          if (!isAlreadySharedWithGroup(error)) throw error
        }
      }
    },
  }
}
