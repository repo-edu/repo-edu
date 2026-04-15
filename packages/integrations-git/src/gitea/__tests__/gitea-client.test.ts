import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import { createGiteaClient } from "../gitea-client.js"

const baseDraft: GitConnectionDraft = {
  provider: "gitea",
  baseUrl: "https://gitea.example.com",
  token: "gitea-test-token",
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
            statusText: route.status < 300 ? "OK" : "Error",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(route.body),
          }
        }
      }

      return {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Not Found" }),
      }
    },
  }
}

describe("createGiteaClient", () => {
  describe("verifyConnection", () => {
    it("returns verified true when authenticated user exists", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/user",
          status: 200,
          body: { username: "test-user" },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.verifyConnection(baseDraft)

      assert.deepStrictEqual(result, { verified: true })
    })

    it("returns verified false when baseUrl is missing", async () => {
      const client = createGiteaClient(createMockHttpPort([]))
      const result = await client.verifyConnection({
        ...baseDraft,
        baseUrl: "",
      })

      assert.deepStrictEqual(result, { verified: false })
    })

    it("sends the default user-agent when draft has none", async () => {
      let capturedHeaders: Record<string, string> | undefined
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedHeaders = request.headers
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "test-user" }),
          }
        },
      }

      const client = createGiteaClient(http)
      await client.verifyConnection(baseDraft)

      assert.equal(capturedHeaders?.["User-Agent"], "repo-edu")
    })

    it("sends the configured user-agent when draft sets one", async () => {
      let capturedHeaders: Record<string, string> | undefined
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedHeaders = request.headers
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: "test-user" }),
          }
        },
      }

      const client = createGiteaClient(http)
      await client.verifyConnection({
        ...baseDraft,
        userAgent: "Name / Organization / email@example.edu",
      })

      assert.equal(
        capturedHeaders?.["User-Agent"],
        "Name / Organization / email@example.edu",
      )
    })
  })

  describe("verifyGitUsernames", () => {
    it("returns mixed results", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/users/alice",
          status: 200,
          body: { username: "alice", active: true },
        },
        {
          method: "GET",
          urlPattern: "/api/v1/users/blocked",
          status: 200,
          body: { username: "blocked", active: false },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.verifyGitUsernames(baseDraft, [
        "alice",
        "blocked",
        "missing",
      ])

      assert.deepStrictEqual(result, [
        { username: "alice", exists: true },
        { username: "blocked", exists: false },
        { username: "missing", exists: false },
      ])
    })

    it("returns false results when baseUrl is missing", async () => {
      const client = createGiteaClient(createMockHttpPort([]))
      const result = await client.verifyGitUsernames(
        { ...baseDraft, baseUrl: "" },
        ["alice"],
      )

      assert.deepStrictEqual(result, [{ username: "alice", exists: false }])
    })
  })

  describe("createRepositories", () => {
    it("creates repositories for an organization", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/api/v1/orgs/course-org/repos")) {
            capturedBody = request.body ?? ""
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                html_url: "https://gitea.example.com/course-org/repo-1",
              }),
            }
          }

          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Not Found" }),
          }
        },
      }

      const client = createGiteaClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "course-org",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.equal(result.created.length, 1)
      assert.ok(result.created[0]?.repositoryUrl.includes("repo-1"))
      assert.ok(capturedBody.includes('"private":true'))
      assert.ok(capturedBody.includes('"auto_init":true'))
    })

    it("creates public repos when visibility is public", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/api/v1/orgs/course-org/repos")) {
            capturedBody = request.body ?? ""
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                html_url: "https://gitea.example.com/course-org/hw1-team-alpha",
              }),
            }
          }

          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Not Found" }),
          }
        },
      }

      const client = createGiteaClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "course-org",
        repositoryNames: ["hw1-team-alpha"],
        visibility: "public",
        autoInit: false,
      })

      assert.equal(result.created.length, 1)
      assert.ok(capturedBody.includes('"name":"hw1-team-alpha"'))
      assert.ok(capturedBody.includes('"private":false'))
    })

    it("returns empty result when baseUrl is missing", async () => {
      const client = createGiteaClient(createMockHttpPort([]))
      const result = await client.createRepositories(
        { ...baseDraft, baseUrl: "" },
        {
          organization: "course-org",
          repositoryNames: ["repo-1"],
          visibility: "private",
          autoInit: true,
        },
      )

      assert.deepStrictEqual(result, {
        created: [],
        alreadyExisted: [],
        failed: [],
      })
    })
  })

  describe("createRepositories alreadyExisted", () => {
    it("classifies HTTP 409 already-exists as alreadyExisted", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "POST" &&
            request.url.includes("/api/v1/orgs/course-org/repos")
          ) {
            return {
              status: 409,
              statusText: "Conflict",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                message: "The repository with the same name already exists.",
              }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("/api/v1/repos/course-org/repo-1")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                html_url: "https://gitea.example.com/course-org/repo-1",
              }),
            }
          }
          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Not Found" }),
          }
        },
      }

      const client = createGiteaClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "course-org",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.deepStrictEqual(result.created, [])
      assert.equal(result.alreadyExisted.length, 1)
      assert.equal(result.alreadyExisted[0]?.repositoryName, "repo-1")
      assert.deepStrictEqual(result.failed, [])
    })
  })

  describe("createTeam", () => {
    it("creates a team and adds members", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "POST" &&
            request.url.includes("/api/v1/orgs/course-org/teams")
          ) {
            capturedBody = request.body ?? ""
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 42, name: "hw1-team" }),
            }
          }
          if (
            request.method === "PUT" &&
            request.url.includes("/teams/42/members/alice")
          ) {
            return {
              status: 204,
              statusText: "No Content",
              headers: { "content-type": "application/json" },
              body: "",
            }
          }
          if (
            request.method === "PUT" &&
            request.url.includes("/teams/42/members/nobody")
          ) {
            return {
              status: 404,
              statusText: "Not Found",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "Not Found" }),
            }
          }
          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Not Found" }),
          }
        },
      }

      const client = createGiteaClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "course-org",
        teamName: "hw1-team",
        memberUsernames: ["alice", "nobody"],
        permission: "push",
      })

      assert.equal(result.created, true)
      assert.equal(result.teamSlug, "42")
      assert.deepStrictEqual(result.membersAdded, ["alice"])
      assert.deepStrictEqual(result.membersNotFound, ["nobody"])
      assert.ok(capturedBody.includes('"permission":"write"'))
      assert.ok(capturedBody.includes('"units":["repo.code"'))
      assert.ok(capturedBody.includes('"repo.packages"'))
    })

    it("falls back to existing team on HTTP 409", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "POST" &&
            request.url.includes("/api/v1/orgs/course-org/teams")
          ) {
            return {
              status: 409,
              statusText: "Conflict",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "team already exists" }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("/api/v1/orgs/course-org/teams")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify([{ id: 42, name: "hw1-team" }]),
            }
          }
          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Not Found" }),
          }
        },
      }

      const client = createGiteaClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "course-org",
        teamName: "hw1-team",
        memberUsernames: [],
        permission: "push",
      })

      assert.equal(result.created, false)
      assert.equal(result.teamSlug, "42")
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("assigns repositories to a team", async () => {
      const capturedUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrls.push(`${request.method} ${request.url}`)
          return {
            status: 204,
            statusText: "No Content",
            headers: { "content-type": "application/json" },
            body: "",
          }
        },
      }

      const client = createGiteaClient(http)
      await client.assignRepositoriesToTeam(baseDraft, {
        organization: "course-org",
        teamSlug: "42",
        repositoryNames: ["repo-1"],
        permission: "push",
      })

      assert.equal(capturedUrls.length, 1)
      assert.ok(capturedUrls[0]?.includes("/teams/42/repos/course-org/repo-1"))
    })
  })

  describe("getRepositoryDefaultBranchHead", () => {
    it("returns HEAD sha and branch name", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/api\/v1\/repos\/my-org\/template\/branches\/main/,
          status: 200,
          body: { commit: { id: "abc123" } },
        },
        {
          method: "GET",
          urlPattern: "/api/v1/repos/my-org/template",
          status: 200,
          body: { default_branch: "main" },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
      })

      assert.deepStrictEqual(result, { sha: "abc123", branchName: "main" })
    })

    it("returns null for missing repository", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/repos/my-org/missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "missing",
      })

      assert.equal(result, null)
    })
  })

  describe("getTemplateDiff", () => {
    it("returns changed files between two commits", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/compare/")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                files: [{ filename: "README.md", status: "modified" }],
              }),
            }
          }
          if (request.url.includes("/contents/README.md")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                content: "dXBkYXRlZA==",
                encoding: "base64",
              }),
            }
          }
          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Not Found" }),
          }
        },
      }

      const client = createGiteaClient(http)
      const result = await client.getTemplateDiff(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
        fromSha: "sha1",
        toSha: "sha2",
      })

      assert.ok(result)
      assert.equal(result.files.length, 1)
      assert.equal(result.files[0]?.path, "README.md")
      assert.equal(result.files[0]?.status, "modified")
      assert.equal(result.files[0]?.contentBase64, "dXBkYXRlZA==")
    })
  })

  describe("createPullRequest", () => {
    it("creates a pull request and returns URL", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/api/v1/repos/my-org/repo-1/pulls",
          status: 201,
          body: {
            html_url: "https://gitea.example.com/my-org/repo-1/pulls/1",
          },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.createPullRequest(baseDraft, {
        owner: "my-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, true)
      assert.ok(result.url.includes("pulls/1"))
    })
  })

  describe("resolveRepositoryCloneUrls", () => {
    it("returns authenticated clone URLs and missing repositories", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/repos/course-org/repo-1",
          status: 200,
          body: {
            clone_url: "https://gitea.example.com/course-org/repo-1.git",
          },
        },
        {
          method: "GET",
          urlPattern: "/api/v1/repos/course-org/repo-missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.resolveRepositoryCloneUrls(baseDraft, {
        organization: "course-org",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result.missing, ["repo-missing"])
      assert.equal(result.resolved.length, 1)
      assert.equal(result.resolved[0]?.repositoryName, "repo-1")
      assert.ok(result.resolved[0]?.cloneUrl.includes("token:gitea-test-token"))
    })
  })
})
