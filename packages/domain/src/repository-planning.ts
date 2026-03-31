import { resolveAssignmentGroups } from "./group-selection.js"
import { activeMemberIds } from "./group-set.js"
import { importValidationError } from "./group-set-import-export.js"
import type {
  Assignment,
  Group,
  PlannedRepositoryGroup,
  RepoCollision,
  RepoCollisionKind,
  RepoOperationMode,
  RepoPreflightResult,
  RepositoryOperationPlan,
  Roster,
  SkippedGroup,
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

export function planRepositoryOperation(
  roster: Roster,
  assignmentId: string,
  template = defaultRepoTemplate,
): ValidationResult<RepositoryOperationPlan> {
  const assignment = findAssignment(roster, assignmentId)
  if (assignment === undefined) {
    return importValidationError("assignmentId", "Assignment not found")
  }

  const skippedGroups: SkippedGroup[] = []
  const groups: PlannedRepositoryGroup[] = []
  const resolvedGroups = resolveAssignmentGroups(roster, assignment)
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

    groups.push({
      assignmentId: assignment.id,
      assignmentName: assignment.name,
      groupId: group.id,
      groupName: group.name,
      repoName: computeRepoName(template, assignment, group, {
        members: activeGroupGitUsernameToken(group, memberById),
      }),
      activeMemberIds: activeIds,
    })
  }

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
