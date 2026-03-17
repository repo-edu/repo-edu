import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import { createGitHubClient } from "../github-client.js"

const baseDraft: GitConnectionDraft = {
  provider: "github",
  baseUrl: "https://github.com",
  token: "ghp_test_token",
}

type MockRoute = {
  method: string
  urlPattern: string | RegExp
  status: number
  body: unknown
}

function createMockHttpPort(routes: MockRoute[]): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      for (const route of routes) {
        const methodMatch =
          request.method === route.method ||
          (!request.method && route.method === "GET")
        const urlMatch =
          typeof route.urlPattern === "string"
            ? request.url.includes(route.urlPattern)
            : route.urlPattern.test(request.url)

        if (methodMatch && urlMatch) {
          return {
            status: route.status,
            statusText: route.status === 200 ? "OK" : "Error",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(route.body),
          }
        }
      }

      return {
        status: 404,
        statusText: "Not Found",
        headers: {},
        body: JSON.stringify({ message: "Not Found" }),
      }
    },
  }
}

describe("createGitHubClient", () => {
  describe("verifyConnection", () => {
    it("returns verified true when authenticated user exists", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/user",
          status: 200,
          body: { login: "test-user", id: 1 },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.verifyConnection(baseDraft)
      assert.deepStrictEqual(result, { verified: true })
    })

    it("returns verified false when authentication fails", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/user",
          status: 401,
          body: { message: "Bad credentials" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.verifyConnection(baseDraft)
      assert.deepStrictEqual(result, { verified: false })
    })
  })

  describe("verifyGitUsernames", () => {
    it("returns mixed results for existing and non-existing users", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/users/alice",
          status: 200,
          body: { login: "alice", id: 1 },
        },
        {
          method: "GET",
          urlPattern: "/users/nobody",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.verifyGitUsernames(baseDraft, [
        "alice",
        "nobody",
      ])

      assert.equal(result.length, 2)
      assert.deepStrictEqual(result[0], { username: "alice", exists: true })
      assert.deepStrictEqual(result[1], { username: "nobody", exists: false })
    })

    it("respects abort signal", async () => {
      const controller = new AbortController()
      controller.abort()

      const http = createMockHttpPort([])
      const client = createGitHubClient(http)
      const result = await client.verifyGitUsernames(
        baseDraft,
        ["alice", "bob"],
        controller.signal,
      )

      assert.equal(result.length, 0)
    })
  })

  describe("createRepositories", () => {
    it("creates repositories without template", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 201,
          body: { html_url: "https://github.com/test-org/repo-1" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.equal(result.created.length, 1)
      assert.deepStrictEqual(result.created[0], {
        repositoryName: "repo-1",
        repositoryUrl: "https://github.com/test-org/repo-1",
      })
      assert.deepStrictEqual(result.alreadyExisted, [])
      assert.deepStrictEqual(result.failed, [])
    })

    it("creates repositories with non-public visibility", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 201,
          body: { html_url: "https://github.com/test-org/hw1-team-alpha" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["hw1-team-alpha"],
        visibility: "private",
        autoInit: false,
      })

      assert.equal(result.created.length, 1)
      assert.ok(result.created[0]?.repositoryUrl.includes("hw1-team-alpha"))
    })

    it("handles partial failure gracefully", async () => {
      let callCount = 0
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          callCount++
          if (callCount === 1) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                html_url: "https://github.com/test-org/repo-1",
              }),
            }
          }
          throw new Error("Network error")
        },
      }

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1", "repo-2"],
        visibility: "private",
        autoInit: true,
      })

      assert.equal(result.created.length, 1)
      assert.equal(result.failed.length, 1)
    })
  })

  describe("createRepositories alreadyExisted", () => {
    it("classifies HTTP 422 already-exists as alreadyExisted", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 422,
          body: { message: "Repository name already exists on this owner" },
        },
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1",
          status: 200,
          body: { html_url: "https://github.com/test-org/repo-1" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.deepStrictEqual(result.created, [])
      assert.equal(result.alreadyExisted.length, 1)
      assert.equal(result.alreadyExisted[0]?.repositoryName, "repo-1")
      assert.equal(
        result.alreadyExisted[0]?.repositoryUrl,
        "https://github.com/test-org/repo-1",
      )
      assert.deepStrictEqual(result.failed, [])
    })
  })

  describe("createTeam", () => {
    it("creates a team and adds members", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/teams",
          status: 201,
          body: { slug: "hw1-team" },
        },
        {
          method: "PUT",
          urlPattern: "/orgs/test-org/teams/hw1-team/memberships/alice",
          status: 200,
          body: { state: "active" },
        },
        {
          method: "PUT",
          urlPattern: "/orgs/test-org/teams/hw1-team/memberships/nobody",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "test-org",
        teamName: "hw1-team",
        memberUsernames: ["alice", "nobody"],
        permission: "push",
      })

      assert.equal(result.created, true)
      assert.equal(result.teamSlug, "hw1-team")
      assert.deepStrictEqual(result.membersAdded, ["alice"])
      assert.deepStrictEqual(result.membersNotFound, ["nobody"])
    })

    it("falls back to existing team on HTTP 422", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/teams",
          status: 422,
          body: { message: "Validation Failed" },
        },
        {
          method: "GET",
          urlPattern: "/orgs/test-org/teams/hw1-team",
          status: 200,
          body: { slug: "hw1-team" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "test-org",
        teamName: "hw1-team",
        memberUsernames: [],
        permission: "push",
      })

      assert.equal(result.created, false)
      assert.equal(result.teamSlug, "hw1-team")
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("assigns repositories to a team", async () => {
      const capturedUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrls.push(request.url)
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          }
        },
      }

      const client = createGitHubClient(http)
      await client.assignRepositoriesToTeam(baseDraft, {
        organization: "test-org",
        teamSlug: "hw1-team",
        repositoryNames: ["repo-1", "repo-2"],
        permission: "push",
      })

      assert.equal(capturedUrls.length, 2)
      assert.ok(
        capturedUrls[0]?.includes("/teams/hw1-team/repos/test-org/repo-1"),
      )
      assert.ok(
        capturedUrls[1]?.includes("/teams/hw1-team/repos/test-org/repo-2"),
      )
    })
  })

  describe("getRepositoryDefaultBranchHead", () => {
    it("returns HEAD sha and branch name", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/repos\/my-org\/template-repo\/branches\/main/,
          status: 200,
          body: { commit: { sha: "abc123" } },
        },
        {
          method: "GET",
          urlPattern: "/repos/my-org/template-repo",
          status: 200,
          body: { default_branch: "main" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "template-repo",
      })

      assert.deepStrictEqual(result, { sha: "abc123", branchName: "main" })
    })

    it("returns null for missing repository", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/my-org/missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "missing",
      })

      assert.equal(result, null)
    })
  })

  describe("getTemplateDiff", () => {
    it("returns changed files between two commits", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/my-org/template/compare/sha1...sha2",
          status: 200,
          body: {
            files: [
              { filename: "README.md", status: "modified" },
              { filename: "old.txt", status: "removed" },
            ],
          },
        },
        {
          method: "GET",
          urlPattern: "/repos/my-org/template/contents/README.md",
          status: 200,
          body: { content: "dXBkYXRlZA==", encoding: "base64", type: "file" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getTemplateDiff(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
        fromSha: "sha1",
        toSha: "sha2",
      })

      assert.ok(result)
      assert.equal(result.files.length, 2)
      assert.equal(result.files[0]?.path, "README.md")
      assert.equal(result.files[0]?.status, "modified")
      assert.equal(result.files[0]?.contentBase64, "dXBkYXRlZA==")
      assert.equal(result.files[1]?.path, "old.txt")
      assert.equal(result.files[1]?.status, "removed")
      assert.equal(result.files[1]?.contentBase64, null)
    })

    it("returns null for missing repository", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/my-org/missing/compare",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getTemplateDiff(baseDraft, {
        owner: "my-org",
        repositoryName: "missing",
        fromSha: "sha1",
        toSha: "sha2",
      })

      assert.equal(result, null)
    })
  })

  describe("createBranch", () => {
    it("creates a branch and commits files", async () => {
      const capturedUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrls.push(`${request.method} ${request.url}`)
          if (request.method === "POST" && request.url.includes("/git/refs")) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ref: "refs/heads/template-update" }),
            }
          }
          if (request.method === "GET" && request.url.includes("/contents/")) {
            return {
              status: 404,
              statusText: "Not Found",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "Not Found" }),
            }
          }
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: {} }),
          }
        },
      }

      const client = createGitHubClient(http)
      await client.createBranch(baseDraft, {
        owner: "test-org",
        repositoryName: "repo-1",
        branchName: "template-update",
        baseSha: "abc123",
        commitMessage: "Template update",
        files: [
          {
            path: "README.md",
            previousPath: null,
            status: "modified",
            contentBase64: "dXBkYXRlZA==",
          },
        ],
      })

      assert.ok(
        capturedUrls.some((url) => url.includes("/git/refs")),
        "Should create a git ref",
      )
      assert.ok(
        capturedUrls.some((url) => url.includes("/contents/README.md")),
        "Should update file contents",
      )
    })
  })

  describe("createPullRequest", () => {
    it("creates a pull request and returns URL", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/repos/test-org/repo-1/pulls",
          status: 201,
          body: { html_url: "https://github.com/test-org/repo-1/pull/1" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createPullRequest(baseDraft, {
        owner: "test-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, true)
      assert.equal(result.url, "https://github.com/test-org/repo-1/pull/1")
    })

    it("returns existing PR when no changes error", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/repos/test-org/repo-1/pulls",
          status: 422,
          body: { message: "No commits between main and template-update" },
        },
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1/pulls",
          status: 200,
          body: [{ html_url: "https://github.com/test-org/repo-1/pull/5" }],
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createPullRequest(baseDraft, {
        owner: "test-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, false)
      assert.equal(result.url, "https://github.com/test-org/repo-1/pull/5")
    })
  })

  describe("resolveRepositoryCloneUrls", () => {
    it("returns clone URLs for existing repositories and missing names", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1",
          status: 200,
          body: { clone_url: "https://github.com/test-org/repo-1.git" },
        },
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.resolveRepositoryCloneUrls(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result.missing, ["repo-missing"])
      assert.equal(result.resolved.length, 1)
      assert.equal(result.resolved[0]?.repositoryName, "repo-1")
      assert.ok(
        result.resolved[0]?.cloneUrl.includes("x-access-token:ghp_test_token"),
      )
    })
  })

  describe("deleteRepositories", () => {
    it("deletes existing repositories and returns missing names", async () => {
      const http = createMockHttpPort([
        {
          method: "DELETE",
          urlPattern: "/repos/test-org/repo-1",
          status: 200,
          body: {},
        },
        {
          method: "DELETE",
          urlPattern: "/repos/test-org/repo-missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.deleteRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result, {
        deletedCount: 1,
        missing: ["repo-missing"],
      })
    })
  })
})
