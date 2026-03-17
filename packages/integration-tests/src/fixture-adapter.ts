import {
  type GitProviderKind,
  type PersistedAppSettings,
  type PersistedCourse,
  type PlannedRepositoryGroup,
  planRepositoryOperation,
} from "@repo-edu/domain"
import { getFixture } from "@repo-edu/test-fixtures"

function applyGroupNameSuffix(course: PersistedCourse, suffix: string): void {
  for (const group of course.roster.groups) {
    group.name = `${group.name}-${suffix}`
  }
}

function applyGitUsernameOverrides(
  course: PersistedCourse,
  usernames: readonly string[],
): void {
  const pool = usernames.map((entry) => entry.trim()).filter(Boolean)
  if (pool.length === 0) {
    return
  }

  let index = 0
  for (const member of [...course.roster.students, ...course.roster.staff]) {
    if ((member.gitUsername ?? "").trim() === "") {
      continue
    }
    member.gitUsername = pool[index % pool.length] ?? member.gitUsername
    index += 1
  }
}

export function createGitFixture(input: {
  provider: GitProviderKind
  baseUrl: string
  token: string
  organization: string
  scopeSuffix: string
  fixtureGitUsernames?: readonly string[]
}): { course: PersistedCourse; settings: PersistedAppSettings } {
  const fixture = getFixture({ tier: "small", preset: "shared-teams" })

  const course: PersistedCourse = structuredClone(fixture.course)
  const settings: PersistedAppSettings = structuredClone(fixture.settings)

  applyGroupNameSuffix(course, input.scopeSuffix)
  if (input.fixtureGitUsernames && input.fixtureGitUsernames.length > 0) {
    applyGitUsernameOverrides(course, input.fixtureGitUsernames)
  }

  const connectionId = `integration-${input.provider}`
  settings.gitConnections = [
    {
      id: connectionId,
      provider: input.provider,
      baseUrl: input.baseUrl,
      token: input.token,
    },
  ]
  course.gitConnectionId = connectionId
  course.organization = input.organization

  return { course, settings }
}

export function collectExpectedRepoNames(
  course: PersistedCourse,
  assignmentId: string,
): {
  repoNames: string[]
  groupNames: string[]
  groups: PlannedRepositoryGroup[]
} {
  const plan = planRepositoryOperation(course.roster, assignmentId)
  if (!plan.ok) {
    throw new Error(
      `planRepositoryOperation failed: ${plan.issues.map((issue) => issue.message).join(", ")}`,
    )
  }

  return {
    repoNames: plan.value.groups.map((group) => group.repoName),
    groupNames: plan.value.groups.map((group) => group.groupName),
    groups: plan.value.groups,
  }
}

export function collectFixtureGitUsernames(course: PersistedCourse): string[] {
  const usernames = new Set<string>()
  for (const student of course.roster.students) {
    const gitUsername = (student.gitUsername ?? "").trim()
    if (gitUsername !== "") {
      usernames.add(gitUsername)
    }
  }
  return Array.from(usernames)
}
