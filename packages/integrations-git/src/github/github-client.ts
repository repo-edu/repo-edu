import { Octokit } from "@octokit/rest";
import type { HttpPort } from "@repo-edu/host-runtime-contract";
import type {
  CreateRepositoriesRequest,
  CreateRepositoriesResult,
  DeleteRepositoriesRequest,
  DeleteRepositoriesResult,
  GitConnectionDraft,
  GitProviderClient,
  ResolveRepositoryCloneUrlsRequest,
  ResolveRepositoryCloneUrlsResult,
  GitUsernameStatus,
} from "@repo-edu/integrations-git-contract";
import { createHttpPortFetch } from "./http-port-fetch.js";

function resolveApiBaseUrl(draft: GitConnectionDraft): string {
  if (draft.baseUrl === null || draft.baseUrl === "") {
    return "https://api.github.com";
  }
  const base = draft.baseUrl.replace(/\/+$/, "");
  if (base === "https://github.com" || base === "http://github.com") {
    return "https://api.github.com";
  }
  return `${base}/api/v3`;
}

function createOctokit(http: HttpPort, draft: GitConnectionDraft): Octokit {
  return new Octokit({
    auth: draft.token,
    baseUrl: resolveApiBaseUrl(draft),
    request: {
      fetch: createHttpPortFetch(http),
    },
  });
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}

function withGitHubToken(cloneUrl: string, token: string): string {
  const url = new URL(cloneUrl);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

export function createGitHubClient(http: HttpPort): GitProviderClient {
  return {
    async verifyConnection(
      draft: GitConnectionDraft,
      signal?: AbortSignal,
    ): Promise<{ verified: boolean }> {
      const octokit = createOctokit(http, draft);
      const org = draft.organization;
      if (!org) {
        return { verified: false };
      }

      try {
        await octokit.orgs.get({
          org,
          request: { signal },
        });
        return { verified: true };
      } catch {
        return { verified: false };
      }
    },

    async verifyGitUsernames(
      draft: GitConnectionDraft,
      usernames: string[],
      signal?: AbortSignal,
    ): Promise<GitUsernameStatus[]> {
      const octokit = createOctokit(http, draft);
      const results: GitUsernameStatus[] = [];

      for (const username of usernames) {
        if (signal?.aborted) break;

        try {
          await octokit.users.getByUsername({
            username,
            request: { signal },
          });
          results.push({ username, exists: true });
        } catch {
          results.push({ username, exists: false });
        }
      }

      return results;
    },

    async createRepositories(
      draft: GitConnectionDraft,
      request: CreateRepositoriesRequest,
      signal?: AbortSignal,
    ): Promise<CreateRepositoriesResult> {
      const octokit = createOctokit(http, draft);
      const urls: string[] = [];

      for (const repoName of request.repositoryNames) {
        if (signal?.aborted) break;

        try {
          let htmlUrl: string;
          if (request.template) {
            const response = await octokit.repos.createUsingTemplate({
              template_owner: request.template.owner,
              template_repo: request.template.name,
              owner: request.organization,
              name: repoName,
              private: request.template.visibility === "private",
              request: { signal },
            });
            htmlUrl = response.data.html_url;
          } else {
            const response = await octokit.repos.createInOrg({
              org: request.organization,
              name: repoName,
              private: true,
              auto_init: false,
              request: { signal },
            });
            htmlUrl = response.data.html_url;
          }
          urls.push(htmlUrl);
        } catch {
          // Individual repository creation failure is non-fatal;
          // the caller inspects the counts to detect partial success.
        }
      }

      return {
        createdCount: urls.length,
        repositoryUrls: urls,
      };
    },
    async resolveRepositoryCloneUrls(
      draft: GitConnectionDraft,
      request: ResolveRepositoryCloneUrlsRequest,
      signal?: AbortSignal,
    ): Promise<ResolveRepositoryCloneUrlsResult> {
      const octokit = createOctokit(http, draft);
      const resolved: ResolveRepositoryCloneUrlsResult["resolved"] = [];
      const missing: string[] = [];

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break;
        }

        try {
          const response = await octokit.repos.get({
            owner: request.organization,
            repo: repositoryName,
            request: { signal },
          });
          resolved.push({
            repositoryName,
            cloneUrl: withGitHubToken(response.data.clone_url, draft.token),
          });
        } catch (error) {
          if (isNotFoundError(error)) {
            missing.push(repositoryName);
            continue;
          }
          throw error;
        }
      }

      return {
        resolved,
        missing,
      };
    },
    async deleteRepositories(
      draft: GitConnectionDraft,
      request: DeleteRepositoriesRequest,
      signal?: AbortSignal,
    ): Promise<DeleteRepositoriesResult> {
      const octokit = createOctokit(http, draft);
      let deletedCount = 0;
      const missing: string[] = [];

      for (const repositoryName of request.repositoryNames) {
        if (signal?.aborted) {
          break;
        }

        try {
          await octokit.repos.delete({
            owner: request.organization,
            repo: repositoryName,
            request: { signal },
          });
          deletedCount += 1;
        } catch (error) {
          if (isNotFoundError(error)) {
            missing.push(repositoryName);
            continue;
          }
          throw error;
        }
      }

      return {
        deletedCount,
        missing,
      };
    },
  };
}
