import type { HttpPort } from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"
import { guardGitProviderClient } from "../invocation-guard.js"
import { createGiteaBranchReview } from "./branch-review.js"
import { createGiteaDiscovery } from "./discovery.js"
import { createGiteaIdentity } from "./identity.js"
import { createGiteaRepositories } from "./repositories.js"
import { createGiteaTeams } from "./teams.js"
import { createGiteaTemplateChanges } from "./template-changes.js"

export function createGiteaClient(http: HttpPort): GitProviderClient {
  return guardGitProviderClient({
    ...createGiteaIdentity(http),
    ...createGiteaRepositories(http),
    ...createGiteaTeams(http),
    ...createGiteaTemplateChanges(http),
    ...createGiteaBranchReview(http),
    ...createGiteaDiscovery(http),
  })
}
