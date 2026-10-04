import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { guardGitProviderClient } from "../invocation-guard.js"
import { createGitHubBranchReview } from "./branch-review.js"
import { createGitHubDiscovery } from "./discovery.js"
import { createGitHubIdentity } from "./identity.js"
import { createGitHubRepositories } from "./repositories.js"
import { createGitHubTeams } from "./teams.js"
import { createGitHubTemplateChanges } from "./template-changes.js"

export function createGitHubClient(http: HttpPort): GitProviderClient {
  return guardGitProviderClient({
    ...createGitHubIdentity(http),
    ...createGitHubRepositories(http),
    ...createGitHubTeams(http),
    ...createGitHubTemplateChanges(http),
    ...createGitHubBranchReview(http),
    ...createGitHubDiscovery(http),
  })
}
