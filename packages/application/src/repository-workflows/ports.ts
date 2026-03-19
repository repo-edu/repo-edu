import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"
import type { GitProviderClient } from "@repo-edu/integrations-git-contract"

export type RepositoryWorkflowPorts = {
  git: Pick<
    GitProviderClient,
    | "createRepositories"
    | "createTeam"
    | "assignRepositoriesToTeam"
    | "getRepositoryDefaultBranchHead"
    | "getTemplateDiff"
    | "createBranch"
    | "createPullRequest"
    | "resolveRepositoryCloneUrls"
  >
  gitCommand: GitCommandPort
  fileSystem: FileSystemPort
}
