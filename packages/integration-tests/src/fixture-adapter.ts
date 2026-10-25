import type { GitProviderKind } from "@repo-edu/domain/connection"
import { planRepositoryOperation } from "@repo-edu/domain/repository-planning"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type {
  PersistedCourse,
  PlannedRepositoryGroup,
} from "@repo-edu/domain/types"
import { getFixture } from "@repo-edu/test-fixtures"

function applyGroupNamePrefix(course: PersistedCourse, prefix: string): void {
  for (const group of course.roster.groups) {
    group.name = `${prefix} ${group.name}`
  }
}

export function prefixIntegrationResource(
  resourcePrefix: string,
  name: string,
): string {
  return `${resourcePrefix}-${name}`
}

export function createIntegrationResourcePrefix(): string {
  return `test${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
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
  resourcePrefix: string
  fixtureGitUsernames?: readonly string[]
}): { course: PersistedCourse; settings: PersistedAppSettings } {
  const fixture = getFixture({ tier: "small", preset: "shared-teams" })

  const course: PersistedCourse = structuredClone(fixture.course)
  const settings: PersistedAppSettings = structuredClone(fixture.settings)

  applyGroupNamePrefix(course, input.resourcePrefix)
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
  settings.activeGitConnectionId = connectionId
  course.organization = input.organization

  return { course, settings }
}

export function collectExpectedRepoNames(
  course: PersistedCourse,
  assignmentId: string,
): {
  repoNames: string[]
  groups: PlannedRepositoryGroup[]
} {
  const plan = planRepositoryOperation(course, assignmentId, "create")
  if (!plan.ok) {
    throw new Error(
      `planRepositoryOperation failed: ${plan.issues.map((issue) => issue.message).join(", ")}`,
    )
  }

  return {
    repoNames: plan.value.groups.map((group) => group.repoName),
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
