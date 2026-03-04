import type { GitProviderKind } from "@repo-edu/domain";
import type { HttpPort } from "@repo-edu/host-runtime-contract";
import type { GitProviderClient } from "@repo-edu/integrations-git-contract";
import { packageId as contractPackageId } from "@repo-edu/integrations-git-contract";
import { createGiteaClient } from "./gitea/index.js";
import { createGitHubClient } from "./github/index.js";
import { createGitLabClient } from "./gitlab/index.js";

export const packageId = "@repo-edu/integrations-git";
export const workspaceDependencies = [contractPackageId] as const;

export { createGiteaClient } from "./gitea/index.js";
export { createGitHubClient } from "./github/index.js";
export { createGitLabClient } from "./gitlab/index.js";

export function createGitProviderClient(
  provider: GitProviderKind,
  http: HttpPort,
): GitProviderClient {
  switch (provider) {
    case "github":
      return createGitHubClient(http);
    case "gitlab":
      return createGitLabClient(http);
    case "gitea":
      return createGiteaClient(http);
  }
}
