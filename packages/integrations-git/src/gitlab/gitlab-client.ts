import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { guardGitProviderClient } from "../invocation-guard.js"
import { createGitLabBranchReview } from "./branch-review.js"
import { createGitLabDiscovery } from "./discovery.js"
import { createGitLabIdentity } from "./identity.js"
import { createGitLabRepositories } from "./repositories.js"
import { createGitLabTeams } from "./teams.js"
import { createGitLabTemplateChanges } from "./template-changes.js"

export function createGitLabClient(http: HttpPort): GitProviderClient {
  return guardGitProviderClient({
    ...createGitLabIdentity(http),
    ...createGitLabRepositories(http),
    ...createGitLabTeams(http),
    ...createGitLabTemplateChanges(http),
    ...createGitLabBranchReview(http),
    ...createGitLabDiscovery(http),
  })
}
