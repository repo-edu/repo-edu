import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
import { createGitLabClient } from "../gitlab-client.js"

const baseDraft: GitConnectionDraft = {
  provider: "gitlab",
  baseUrl: "https://gitlab.example.com",
  token: "glpat-test-token",
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
        headers: {},
        body: JSON.stringify({ message: "Not Found" }),
      }
    },
  }
}

describe("createGitLabClient", () => {
  describe("verifyConnection", () => {
    it("returns verified true when authenticated user exists", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/user",
          status: 200,
          body: { id: 1, username: "test-user" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.verifyConnection(baseDraft)
      assert.deepStrictEqual(result, { verified: true })
    })

    it("returns verified false when authentication fails", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/user",
          status: 401,
          body: { message: "401 Unauthorized" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.verifyConnection(baseDraft)
      assert.deepStrictEqual(result, { verified: false })
    })

    it("sends private-token header", async () => {
      let capturedHeaders: Record<string, string> | undefined
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedHeaders = request.headers
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: 1, username: "test-user" }),
          }
        },
      }

      const client = createGitLabClient(http)
      await client.verifyConnection(baseDraft)

      assert.ok(capturedHeaders)
      assert.equal(capturedHeaders["private-token"], "glpat-test-token")
    })

    it("uses default gitlab.com when baseUrl is empty", async () => {
      let capturedUrl = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrl = request.url
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: 1, username: "test-user" }),
          }
        },
      }

      const client = createGitLabClient(http)
      await client.verifyConnection({ ...baseDraft, baseUrl: "" })

      assert.ok(capturedUrl.startsWith("https://gitlab.com/api/v4"))
    })
  })

  describe("verifyGitUsernames", () => {
    it("returns mixed results", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /username=alice/,
          status: 200,
          body: [{ username: "alice", state: "active" }],
        },
        {
          method: "GET",
          urlPattern: /username=nobody/,
          status: 200,
          body: [],
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.verifyGitUsernames(baseDraft, [
        "alice",
        "nobody",
      ])

      assert.equal(result.length, 2)
      assert.deepStrictEqual(result[0], { username: "alice", exists: true })
      assert.deepStrictEqual(result[1], { username: "nobody", exists: false })
    })

    it("treats blocked users as not existing", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /username=blocked/,
          status: 200,
          body: [{ username: "blocked", state: "blocked" }],
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.verifyGitUsernames(baseDraft, ["blocked"])

      assert.deepStrictEqual(result[0], { username: "blocked", exists: false })
    })
  })

  describe("createRepositories", () => {
    it("creates repositories in the requested group namespace", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/target-group",
          status: 200,
          body: { id: 42, path: "target-group" },
        },
        {
          method: "POST",
          urlPattern: "/projects",
          status: 201,
          body: {
            id: 100,
            web_url: "https://gitlab.example.com/target-group/repo-1",
          },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "target-group",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.equal(result.created.length, 1)
      assert.ok(result.created[0]?.repositoryUrl.includes("repo-1"))
    })

    it("creates repos with internal visibility", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/groups/my-group")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 42, path: "my-group" }),
            }
          }

          if (request.url.includes("/projects")) {
            capturedBody = request.body ?? ""
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: 101,
                web_url: "https://gitlab.example.com/my-group/hw1-team-alpha",
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

      const client = createGitLabClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "my-group",
        repositoryNames: ["hw1-team-alpha"],
        visibility: "internal",
        autoInit: false,
      })

      assert.equal(result.created.length, 1)
      assert.ok(capturedBody.includes('"visibility":"internal"'))
    })

    it("returns empty result when org has no namespace id", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/my-group",
          status: 200,
          body: { path: "my-group" }, // no id
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "my-group",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.equal(result.created.length, 0)
    })

    it("URL-encodes group paths with slashes", async () => {
      let capturedUrl = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/groups/")) {
            capturedUrl = request.url
          }
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: 42, path: "nested" }),
          }
        },
      }

      const client = createGitLabClient(http)
      await client.createRepositories(baseDraft, {
        organization: "parent/nested",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.ok(
        capturedUrl.includes("parent%2Fnested"),
        `Expected URL-encoded path, got: ${capturedUrl}`,
      )
    })
  })

  describe("createRepositories alreadyExisted", () => {
    it("classifies HTTP 400 already-exists as alreadyExisted", async () => {
      let projectPostCalled = false
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/groups/my-group")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 42, path: "my-group" }),
            }
          }
          if (request.method === "POST" && request.url.includes("/projects")) {
            projectPostCalled = true
            return {
              status: 400,
              statusText: "Bad Request",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                message: { name: ["has already been taken"] },
              }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("/projects/my-group%2Frepo-1")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                web_url: "https://gitlab.example.com/my-group/repo-1",
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

      const client = createGitLabClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "my-group",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.ok(projectPostCalled)
      assert.deepStrictEqual(result.created, [])
      assert.equal(result.alreadyExisted.length, 1)
      assert.equal(result.alreadyExisted[0]?.repositoryName, "repo-1")
      assert.deepStrictEqual(result.failed, [])
    })
  })

  describe("createTeam", () => {
    it("creates a subgroup team and adds members", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/groups/my-org")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 10, path: "my-org" }),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/groups") &&
            !request.url.includes("/members")
          ) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 77, path: "hw1-team" }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("username=alice")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify([
                { id: 5, username: "alice", state: "active" },
              ]),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("username=nobody")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify([]),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/groups/77/members")
          ) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
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

      const client = createGitLabClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "my-org",
        teamName: "hw1-team",
        memberUsernames: ["alice", "nobody"],
        permission: "push",
      })

      assert.equal(result.created, true)
      assert.equal(result.teamSlug, "team-hw1-team")
      assert.deepStrictEqual(result.membersAdded, ["alice"])
      assert.deepStrictEqual(result.membersNotFound, ["nobody"])
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("shares projects with the team group", async () => {
      const capturedShareUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/groups/my-org%2Fhw1-team")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 77, path: "hw1-team" }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("/projects/my-org%2Frepo-1")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 100 }),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/projects/100/share")
          ) {
            capturedShareUrls.push(request.url)
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
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

      const client = createGitLabClient(http)
      await client.assignRepositoriesToTeam(baseDraft, {
        organization: "my-org",
        teamSlug: "hw1-team",
        repositoryNames: ["repo-1"],
        permission: "push",
      })

      assert.equal(capturedShareUrls.length, 1)
      assert.ok(capturedShareUrls[0]?.includes("/projects/100/share"))
    })
  })

  describe("getRepositoryDefaultBranchHead", () => {
    it("returns HEAD sha and branch name", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/repository\/branches\//,
          status: 200,
          body: { commit: { id: "abc123" } },
        },
        {
          method: "GET",
          urlPattern: "/projects/",
          status: 200,
          body: { id: 50, default_branch: "main" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
      })

      assert.deepStrictEqual(result, { sha: "abc123", branchName: "main" })
    })

    it("returns null for missing project", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/projects/",
          status: 404,
          body: { message: "404 Project Not Found" },
        },
      ])

      const client = createGitLabClient(http)
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
          if (request.url.includes("/repository/compare")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                diffs: [
                  {
                    new_path: "README.md",
                    old_path: "README.md",
                    new_file: false,
                    deleted_file: false,
                    renamed_file: false,
                  },
                ],
              }),
            }
          }
          if (request.url.includes("/repository/files/")) {
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

      const client = createGitLabClient(http)
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
    it("creates a merge request and returns URL", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/projects/my-org%2Frepo-1")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 100 }),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/merge_requests")
          ) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                web_url:
                  "https://gitlab.example.com/my-org/repo-1/-/merge_requests/1",
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

      const client = createGitLabClient(http)
      const result = await client.createPullRequest(baseDraft, {
        owner: "my-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, true)
      assert.ok(result.url.includes("merge_requests/1"))
    })
  })

  describe("resolveRepositoryCloneUrls", () => {
    it("resolves clone URLs and reports missing repositories", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/projects/my-group%2Frepo-1",
          status: 200,
          body: {
            http_url_to_repo: "https://gitlab.example.com/my-group/repo-1.git",
          },
        },
        {
          method: "GET",
          urlPattern: "/projects/my-group%2Frepo-missing",
          status: 404,
          body: { message: "404 Project Not Found" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.resolveRepositoryCloneUrls(baseDraft, {
        organization: "my-group",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result.missing, ["repo-missing"])
      assert.equal(result.resolved.length, 1)
      assert.equal(result.resolved[0]?.repositoryName, "repo-1")
      assert.ok(
        result.resolved[0]?.cloneUrl.includes("oauth2:glpat-test-token"),
      )
    })
  })
})
