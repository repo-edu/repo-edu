import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"

export type IntegrationTeam = {
  id: string | number
  name: string
}

export type GitProviderHarness = {
  label: string
  isConfigured: boolean
  supportsUserProvisioning: boolean
  assertTeamMemberAssignments: boolean
  fixtureGitUsernames: readonly string[]
  ensureReady(): Promise<void>
  getConnectionDraft(): GitConnectionDraft
  createOrganization(orgName: string): Promise<string>
  cleanupOrganization(orgName: string): Promise<void>
  seedUsers(usernames: string[]): Promise<void>
  seedTemplateRepository(orgName: string, repoName: string): Promise<void>
  seedOrganizationRepository(
    orgName: string,
    repoName: string,
    options?: { autoInit?: boolean },
  ): Promise<void>
  deleteOrganizationRepository(orgName: string, repoName: string): Promise<void>
  verifyRepositoriesExist(orgName: string, names: string[]): Promise<string[]>
  verifyTeams(orgName: string): Promise<IntegrationTeam[]>
  verifyTeamMembers(orgName: string, team: IntegrationTeam): Promise<string[]>
  verifyTeamRepos(orgName: string, team: IntegrationTeam): Promise<string[]>
}

function parseProviderList(input: string): string[] {
  return input
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function selectedGitProviders(): string[] {
  const configured = process.env.INTEGRATION_GIT_PROVIDERS
  if (!configured || configured.trim() === "") {
    return ["gitea"]
  }
  return parseProviderList(configured)
}
