import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { REPO_ROOT } from "./constants.js"
import { fail } from "./log.js"

export type CohortTeamIdentity = {
  name: string
  email: string
  gitUsername?: string
}

export type CohortTeamSelection = {
  sourcePath: string
  assignmentId: string
  teamIndex: number
  teamId: string
  members: CohortTeamIdentity[]
}

type LmsCohortShape = {
  students?: Record<string, CohortTeamIdentity>
  groupSets?: Record<string, { groups?: string[] }>
  groups?: Record<string, { memberIds?: string[] }>
  assignments?: Record<string, { groupSetId?: string }>
}

type RepobeeCohortShape = {
  teamSets?: Record<string, { teams?: string[] }>
  teams?: Record<string, { members?: CohortTeamIdentity[] }>
  assignments?: Record<string, { teamSetId?: string }>
}

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\")
}

function assertObject(
  value: unknown,
  sourcePath: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${sourcePath}: expected a JSON object`)
  }
  return value as Record<string, unknown>
}

function assertIdentity(
  value: unknown,
  sourcePath: string,
  label: string,
): CohortTeamIdentity {
  const obj = assertObject(value, sourcePath)
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    fail(`${sourcePath}: ${label}.name missing`)
  }
  if (typeof obj.email !== "string" || obj.email.length === 0) {
    fail(`${sourcePath}: ${label}.email missing`)
  }
  if (obj.gitUsername !== undefined && typeof obj.gitUsername !== "string") {
    fail(`${sourcePath}: ${label}.gitUsername must be a string`)
  }
  return {
    name: obj.name,
    email: obj.email,
    ...(obj.gitUsername ? { gitUsername: obj.gitUsername } : {}),
  }
}

function readJson(path: string): unknown {
  if (!existsSync(path)) fail(`team source not found: ${path}`)
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    fail(`${path}: invalid JSON (${detail})`)
  }
}

function resolveLiteralOrWorkspacePath(
  value: string,
  workspaceRelativeDir: string,
): string {
  if (isAbsolute(value)) return value
  if (hasPathSeparator(value)) return resolve(value)
  return resolve(REPO_ROOT(), workspaceRelativeDir, value)
}

export function resolveTeamSourcePath(value: string): string {
  return resolveLiteralOrWorkspacePath(
    value,
    "apps/docs/src/fixtures/demo-cohorts",
  )
}

export function resolveProjectSpec(value: string): {
  projectId: string
  projectPath: string
} {
  if (isAbsolute(value) || hasPathSeparator(value)) {
    return {
      projectId:
        value.replace(/\\/g, "/").split("/").filter(Boolean).at(-2) ?? value,
      projectPath: isAbsolute(value) ? value : resolve(value),
    }
  }

  return {
    projectId: value,
    projectPath: resolve(
      REPO_ROOT(),
      "apps/docs/src/fixtures/projects",
      value,
      "spec.md",
    ),
  }
}

export function parseTeamSelectionList(raw: string): number[] {
  const trimmed = raw.trim()
  if (trimmed.length === 0) fail("--teams must not be empty")

  const indices: number[] = []
  for (const token of trimmed.split(",")) {
    const part = token.trim()
    if (part.length === 0) fail(`--teams contains an empty item: "${raw}"`)
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start < 1 || end < 1 || end < start) {
        fail(`--teams has invalid range "${part}"`)
      }
      for (let index = start; index <= end; index++) indices.push(index)
      continue
    }
    if (!/^\d+$/.test(part)) fail(`--teams has invalid item "${part}"`)
    const index = Number(part)
    if (index < 1) fail(`--teams indices are 1-based, got ${index}`)
    indices.push(index)
  }

  return [...new Set(indices)]
}

function resolveLmsTeams(
  cohort: LmsCohortShape,
  sourcePath: string,
  assignmentId: string,
): Array<{ teamId: string; members: CohortTeamIdentity[] }> | null {
  const assignment = cohort.assignments?.[assignmentId]
  if (!assignment?.groupSetId) return null
  const groupSet = cohort.groupSets?.[assignment.groupSetId]
  if (!Array.isArray(groupSet?.groups)) {
    fail(
      `${sourcePath}: assignment ${assignmentId} references missing group set ${assignment.groupSetId}`,
    )
  }

  return groupSet.groups.map((groupId) => {
    const group = cohort.groups?.[groupId]
    if (!Array.isArray(group?.memberIds)) {
      fail(
        `${sourcePath}: group set ${assignment.groupSetId} references missing group ${groupId}`,
      )
    }
    return {
      teamId: groupId,
      members: group.memberIds.map((memberId) =>
        assertIdentity(
          cohort.students?.[memberId],
          sourcePath,
          `student ${memberId} in group ${groupId}`,
        ),
      ),
    }
  })
}

function resolveRepobeeTeams(
  cohort: RepobeeCohortShape,
  sourcePath: string,
  assignmentId: string,
): Array<{ teamId: string; members: CohortTeamIdentity[] }> | null {
  const assignment = cohort.assignments?.[assignmentId]
  if (!assignment?.teamSetId) return null
  const teamSet = cohort.teamSets?.[assignment.teamSetId]
  if (!Array.isArray(teamSet?.teams)) {
    fail(
      `${sourcePath}: assignment ${assignmentId} references missing team set ${assignment.teamSetId}`,
    )
  }

  return teamSet.teams.map((teamId) => {
    const team = cohort.teams?.[teamId]
    if (!Array.isArray(team?.members)) {
      fail(
        `${sourcePath}: team set ${assignment.teamSetId} references missing team ${teamId}`,
      )
    }
    return {
      teamId,
      members: team.members.map((member, index) =>
        assertIdentity(
          member,
          sourcePath,
          `team ${teamId} member ${index + 1}`,
        ),
      ),
    }
  })
}

export function loadCohortTeamSelections(
  sourcePath: string,
  assignmentId: string,
  teamsRaw: string,
): CohortTeamSelection[] {
  const raw = assertObject(readJson(sourcePath), sourcePath)
  const allTeams =
    resolveLmsTeams(raw as LmsCohortShape, sourcePath, assignmentId) ??
    resolveRepobeeTeams(raw as RepobeeCohortShape, sourcePath, assignmentId)

  if (!allTeams) {
    fail(
      `${sourcePath}: assignment ${assignmentId} missing groupSetId/teamSetId`,
    )
  }

  const indices = parseTeamSelectionList(teamsRaw)
  return indices.map((teamIndex) => {
    const team = allTeams[teamIndex - 1]
    if (!team) {
      fail(
        `${sourcePath}: --teams index ${teamIndex} out of range for assignment ${assignmentId} (${allTeams.length} teams)`,
      )
    }
    if (team.members.length === 0) {
      fail(`${sourcePath}: selected team ${team.teamId} has no members`)
    }
    return {
      sourcePath,
      assignmentId,
      teamIndex,
      teamId: team.teamId,
      members: team.members,
    }
  })
}
