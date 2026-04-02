import { activeMemberIds, resolveGitUsernames } from "./group-set.js"
import { importValidationError } from "./group-set-import-export.js"
import type {
  Assignment,
  Group,
  NamedGroupSet,
  PlannedRepositoryGroup,
  RepoCollision,
  RepoCollisionKind,
  RepoOperationMode,
  RepoPreflightResult,
  RepositoryOperationPlan,
  Roster,
  SkippedGroup,
  UsernameGroupSet,
  ValidationResult,
} from "./types.js"

const maxSlugLength = 100
export const defaultRepoTemplate = "{group}-{surnames}"

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
  return slug.slice(0, maxSlugLength).replace(/-+$/g, "")
}

export function expandTemplate(
  template: string,
  assignment: Assignment | null,
  group: Group,
  options?: { surnames?: string; members?: string },
): string {
  return template
    .replaceAll("{assignment}", assignment?.name ?? "")
    .replaceAll("{group}", group.name)
    .replaceAll("{group_id}", group.id)
    .replaceAll("{initials}", "")
    .replaceAll("{surnames}", options?.surnames ?? "")
    .replaceAll("{members}", options?.members ?? "")
}

export function computeRepoName(
  template: string,
  assignment: Assignment | null,
  group: Group,
  options?: { surnames?: string; members?: string },
): string {
  return slugify(expandTemplate(template, assignment, group, options))
}

function activeGroupGitUsernameToken(
  group: Group,
  memberById: ReadonlyMap<string, Roster["students"][number]>,
): string {
  const usernames = [
    ...new Set(
      group.memberIds
        .map((memberId) => memberById.get(memberId))
        .filter(
          (member): member is NonNullable<typeof member> =>
            member !== undefined && member.status === "active",
        )
        .map((member) => member.gitUsername?.trim().toLowerCase() ?? "")
        .filter((username) => username.length > 0),
    ),
  ]

  usernames.sort((left, right) => left.localeCompare(right))
  return usernames.join("-")
}

function findAssignment(
  roster: Roster,
  assignmentId: string,
): Assignment | undefined {
  return roster.assignments.find((candidate) => candidate.id === assignmentId)
}

function isReadonlyMap(
  value: ReadonlyMap<string, boolean> | Record<string, boolean>,
): value is ReadonlyMap<string, boolean> {
  return typeof (value as ReadonlyMap<string, boolean>).get === "function"
}

function repoExistsLookup(
  repoExistsByName: ReadonlyMap<string, boolean> | Record<string, boolean>,
  repoName: string,
): boolean | undefined {
  if (isReadonlyMap(repoExistsByName)) {
    return repoExistsByName.get(repoName)
  }
  return repoExistsByName[repoName]
}

function repoCollisionKindForMode(mode: RepoOperationMode): RepoCollisionKind {
  return mode === "create" ? "already_exists" : "not_found"
}

function resolveNamedGroupSetGroups(
  roster: Roster,
  groupSet: NamedGroupSet,
): Group[] {
  return groupSet.groupIds.flatMap((groupId) => {
    const group = roster.groups.find((candidate) => candidate.id === groupId)
    return group === undefined ? [] : [group]
  })
}

function normalizeGitUsernames(usernames: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of usernames) {
    const normalized = raw.trim().toLowerCase()
    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  result.sort((a, b) => a.localeCompare(b))
  return result
}

function planNamedGroups(
  roster: Roster,
  assignment: Assignment,
  groupSet: NamedGroupSet,
  template: string,
): { groups: PlannedRepositoryGroup[]; skippedGroups: SkippedGroup[] } {
  const groups: PlannedRepositoryGroup[] = []
  const skippedGroups: SkippedGroup[] = []
  const resolvedGroups = resolveNamedGroupSetGroups(roster, groupSet)
  const memberById = new Map(
    roster.students
      .concat(roster.staff)
      .map((member) => [member.id, member] as const),
  )

  for (const group of resolvedGroups) {
    const activeIds = activeMemberIds(roster, group)
    if (activeIds.length === 0) {
      skippedGroups.push({
        assignmentId: assignment.id,
        groupId: group.id,
        groupName: group.name,
        reason: "empty_group",
        context: null,
      })
      continue
    }

    const { resolved } = resolveGitUsernames(roster, activeIds)
    const gitUsernames = normalizeGitUsernames(
      resolved.map((entry) => entry.gitUsername),
    )

    groups.push({
      assignmentId: assignment.id,
      assignmentName: assignment.name,
      groupId: group.id,
      groupName: group.name,
      repoName: computeRepoName(template, assignment, group, {
        members: activeGroupGitUsernameToken(group, memberById),
      }),
      activeMemberIds: activeIds,
      gitUsernames,
    })
  }

  return { groups, skippedGroups }
}

function planUnnamedTeams(
  assignment: Assignment,
  groupSet: UsernameGroupSet,
  template: string,
): { groups: PlannedRepositoryGroup[]; skippedGroups: SkippedGroup[] } {
  const groups: PlannedRepositoryGroup[] = []
  const skippedGroups: SkippedGroup[] = []

  for (const team of groupSet.teams) {
    const gitUsernames = normalizeGitUsernames(team.gitUsernames)
    if (gitUsernames.length === 0) {
      skippedGroups.push({
        assignmentId: assignment.id,
        groupId: team.id,
        groupName: "",
        reason: "empty_group",
        context: null,
      })
      continue
    }

    const templateGroup: Group = {
      id: team.id,
      name: "",
      memberIds: [],
      origin: "local",
      lmsGroupId: null,
    }

    groups.push({
      assignmentId: assignment.id,
      assignmentName: assignment.name,
      groupId: team.id,
      groupName: "",
      repoName: computeRepoName(template, assignment, templateGroup, {
        members: gitUsernames.join("-"),
      }),
      activeMemberIds: [],
      gitUsernames,
    })
  }

  return { groups, skippedGroups }
}

function templateUsesGroupToken(template: string): boolean {
  return /\{group\}/.test(template)
}

export function planRepositoryOperation(
  roster: Roster,
  assignmentId: string,
  template = defaultRepoTemplate,
): ValidationResult<RepositoryOperationPlan> {
  const assignment = findAssignment(roster, assignmentId)
  if (assignment === undefined) {
    return importValidationError("assignmentId", "Assignment not found")
  }

  const groupSet = roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  )
  if (groupSet === undefined) {
    return importValidationError("groupSetId", "Group set not found")
  }

  if (groupSet.nameMode === "unnamed" && templateUsesGroupToken(template)) {
    return importValidationError(
      "template",
      "The {group} token is not valid for unnamed group sets",
    )
  }

  const { groups, skippedGroups } =
    groupSet.nameMode === "named"
      ? planNamedGroups(roster, assignment, groupSet, template)
      : planUnnamedTeams(assignment, groupSet, template)

  return {
    ok: true,
    value: {
      assignment,
      template,
      groups,
      skippedGroups,
    },
  }
}

export function preflightRepositoryOperation(
  mode: RepoOperationMode,
  plan: RepositoryOperationPlan,
  repoExistsByName: ReadonlyMap<string, boolean> | Record<string, boolean>,
): ValidationResult<RepoPreflightResult> {
  const collisions: RepoCollision[] = []
  const expectedCollisionKind = repoCollisionKindForMode(mode)

  for (const group of plan.groups) {
    const exists = repoExistsLookup(repoExistsByName, group.repoName)
    if (exists === undefined) {
      return importValidationError(
        "repoExistsByName",
        `Missing repository existence lookup for '${group.repoName}'`,
      )
    }

    const collides =
      (mode === "create" && exists) || (mode !== "create" && !exists)
    if (!collides) {
      continue
    }

    collisions.push({
      groupId: group.groupId,
      groupName: group.groupName,
      repoName: group.repoName,
      kind: expectedCollisionKind,
    })
  }

  return {
    ok: true,
    value: {
      collisions,
      readyCount: Math.max(plan.groups.length - collisions.length, 0),
    },
  }
}

export function skippedGroupsFromRepoCollisions(
  assignmentId: string,
  collisions: readonly RepoCollision[],
): SkippedGroup[] {
  return collisions.map((collision) => ({
    assignmentId,
    groupId: collision.groupId,
    groupName: collision.groupName,
    reason:
      collision.kind === "already_exists" ? "repo_exists" : "repo_not_found",
    context: collision.repoName,
  }))
}
