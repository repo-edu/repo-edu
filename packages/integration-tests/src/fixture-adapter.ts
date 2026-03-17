import {
  type PersistedAppSettings,
  type PersistedCourse,
  type PlannedRepositoryGroup,
  planRepositoryOperation,
} from "@repo-edu/domain"
import { getFixture } from "@repo-edu/test-fixtures"

export function createGiteaFixture(
  baseUrl: string,
  token: string,
  orgName: string,
): { course: PersistedCourse; settings: PersistedAppSettings } {
  const fixture = getFixture({ tier: "small", preset: "shared-teams" })

  const course: PersistedCourse = structuredClone(fixture.course)
  const settings: PersistedAppSettings = structuredClone(fixture.settings)

  const connectionId = "integration-gitea"
  settings.gitConnections = [
    { id: connectionId, provider: "gitea", baseUrl, token },
  ]
  course.gitConnectionId = connectionId
  course.organization = orgName

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
