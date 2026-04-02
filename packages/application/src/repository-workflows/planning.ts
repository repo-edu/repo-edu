import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type {
  PersistedCourse,
  PlannedRepositoryGroup,
  RepositoryTemplate,
  ValidationResult,
} from "@repo-edu/domain/types"

type PlannedRepositoryWithTemplate = {
  group: PlannedRepositoryGroup
  template: RepositoryTemplate | null
}

type RepositoryCreateBatch = {
  template: RepositoryTemplate | null
  repositoryNames: string[]
}

type PlannedTeamSetup = {
  groupId: string
  teamName: string
  gitUsernames: string[]
  repositoryNames: string[]
}

export function resolveAssignment(
  course: PersistedCourse,
  assignmentId: string,
): PersistedCourse["roster"]["assignments"][number] | null {
  return (
    course.roster.assignments.find(
      (assignment) => assignment.id === assignmentId,
    ) ?? null
  )
}

function resolveGroupSetRepoNameTemplate(
  course: PersistedCourse,
  assignmentId: string,
): string | undefined {
  const assignment = resolveAssignment(course, assignmentId)
  if (assignment === null) {
    return undefined
  }
  const groupSet = course.roster.groupSets.find(
    (candidate) => candidate.id === assignment.groupSetId,
  )
  if (groupSet?.repoNameTemplate === null || groupSet === undefined) {
    return undefined
  }
  return groupSet.repoNameTemplate
}

export function resolveAssignmentRepositoryTemplate(
  course: PersistedCourse,
  assignmentId: string,
  fallbackTemplate: RepositoryTemplate | null,
): RepositoryTemplate | null {
  const assignment = resolveAssignment(course, assignmentId)
  if (assignment?.repositoryTemplate !== undefined) {
    return assignment.repositoryTemplate
  }
  return fallbackTemplate
}

export function templateKey(template: RepositoryTemplate | null): string {
  if (template === null) {
    return "__none__"
  }
  if (template.kind === "local") {
    return `local:${template.path}:${template.visibility}`
  }
  return `remote:${template.owner}/${template.name}:${template.visibility}`
}

export function describeTemplate(template: RepositoryTemplate | null): string {
  if (template === null) {
    return "no template"
  }
  if (template.kind === "local") {
    return `local:${template.path} (${template.visibility})`
  }
  return `${template.owner}/${template.name} (${template.visibility})`
}

export function collectRepositoryGroups(
  course: PersistedCourse,
  assignmentId: string | null,
): ValidationResult<PlannedRepositoryGroup[]> {
  const assignmentIds =
    assignmentId === null
      ? course.roster.assignments.map((assignment) => assignment.id)
      : [assignmentId]

  const plannedGroups: PlannedRepositoryGroup[] = []
  for (const selectedAssignmentId of assignmentIds) {
    const repoNameTemplate = resolveGroupSetRepoNameTemplate(
      course,
      selectedAssignmentId,
    )
    const plan = planRepositoryOperation(
      course.roster,
      selectedAssignmentId,
      repoNameTemplate,
    )
    if (!plan.ok) {
      return plan
    }
    plannedGroups.push(...plan.value.groups)
  }

  return {
    ok: true,
    value: plannedGroups,
  }
}

export function planRepositoriesWithTemplates(
  course: PersistedCourse,
  groups: readonly PlannedRepositoryGroup[],
  fallbackTemplate: RepositoryTemplate | null,
): ValidationResult<PlannedRepositoryWithTemplate[]> {
  const repoTemplateKeyByName = new Map<string, string>()
  const groupIdByRepoName = new Map<string, string>()
  const planned: PlannedRepositoryWithTemplate[] = []

  for (const group of groups) {
    const effectiveTemplate = resolveAssignmentRepositoryTemplate(
      course,
      group.assignmentId,
      fallbackTemplate,
    )
    const key = templateKey(effectiveTemplate)
    const existingTemplateKey = repoTemplateKeyByName.get(group.repoName)
    if (existingTemplateKey !== undefined && existingTemplateKey !== key) {
      return {
        ok: false,
        issues: [
          {
            path: "input.assignmentId",
            message: `Repository '${group.repoName}' resolves to multiple templates. Use unique repo names or a single template per repository name.`,
          },
        ],
      }
    }

    const existingGroupId = groupIdByRepoName.get(group.repoName)
    if (existingGroupId !== undefined && existingGroupId !== group.groupId) {
      return {
        ok: false,
        issues: [
          {
            path: "input.assignmentId",
            message: `Repository name collision: '${group.repoName}' is produced by multiple groups.`,
          },
        ],
      }
    }

    repoTemplateKeyByName.set(group.repoName, key)
    groupIdByRepoName.set(group.repoName, group.groupId)
    planned.push({
      group,
      template: effectiveTemplate,
    })
  }

  return {
    ok: true,
    value: planned,
  }
}

export function createRepositoryBatches(
  planned: readonly PlannedRepositoryWithTemplate[],
): RepositoryCreateBatch[] {
  const batchesByTemplateKey = new Map<
    string,
    { template: RepositoryTemplate | null; repositoryNames: Set<string> }
  >()

  for (const entry of planned) {
    const key = templateKey(entry.template)
    const existing = batchesByTemplateKey.get(key)
    if (existing) {
      existing.repositoryNames.add(entry.group.repoName)
      continue
    }
    batchesByTemplateKey.set(key, {
      template: entry.template,
      repositoryNames: new Set([entry.group.repoName]),
    })
  }

  return Array.from(batchesByTemplateKey.values()).map((batch) => ({
    template: batch.template,
    repositoryNames: Array.from(batch.repositoryNames),
  }))
}

export function planTeamSetup(
  groups: readonly PlannedRepositoryGroup[],
): PlannedTeamSetup[] {
  const teamsByGroupId = new Map<
    string,
    {
      teamName: string
      gitUsernames: Set<string>
      repositoryNames: Set<string>
    }
  >()

  for (const group of groups) {
    const resolvedTeamName =
      group.groupName.trim().length > 0 ? group.groupName : group.groupId
    const existing = teamsByGroupId.get(group.groupId)
    if (existing) {
      group.gitUsernames.forEach((username) => {
        existing.gitUsernames.add(username)
      })
      existing.repositoryNames.add(group.repoName)
      continue
    }

    teamsByGroupId.set(group.groupId, {
      teamName: resolvedTeamName,
      gitUsernames: new Set(group.gitUsernames),
      repositoryNames: new Set([group.repoName]),
    })
  }

  return Array.from(teamsByGroupId.entries()).map(([groupId, team]) => ({
    groupId,
    teamName: team.teamName,
    gitUsernames: Array.from(team.gitUsernames).sort((a, b) =>
      a.localeCompare(b),
    ),
    repositoryNames: Array.from(team.repositoryNames),
  }))
}

export function uniqueRepositoryNames(
  groups: readonly PlannedRepositoryGroup[],
): string[] {
  return Array.from(new Set(groups.map((group) => group.repoName)))
}
