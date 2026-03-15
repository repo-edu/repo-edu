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
        template: null,
      })

      assert.equal(result.createdCount, 1)
      assert.ok(result.repositoryUrls[0].includes("repo-1"))
    })

    it("uses template owner and name for custom templates", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/groups/template-owner")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 7, path: "template-owner" }),
            }
          }

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
        template: {
          owner: "template-owner",
          name: "course-template",
          visibility: "internal",
        },
      })

      assert.equal(result.createdCount, 1)
      assert.ok(capturedBody.includes('"use_custom_template":true'))
      assert.ok(capturedBody.includes('"template_name":"course-template"'))
      assert.ok(capturedBody.includes('"group_with_project_templates_id":7'))
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
        template: null,
      })

      assert.equal(result.createdCount, 0)
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
        template: null,
      })

      assert.ok(
        capturedUrl.includes("parent%2Fnested"),
        `Expected URL-encoded path, got: ${capturedUrl}`,
      )
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

  describe("deleteRepositories", () => {
    it("deletes repositories and reports missing", async () => {
      const http = createMockHttpPort([
        {
          method: "DELETE",
          urlPattern: "/projects/my-group%2Frepo-1",
          status: 204,
          body: {},
        },
        {
          method: "DELETE",
          urlPattern: "/projects/my-group%2Frepo-missing",
          status: 404,
          body: { message: "404 Project Not Found" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.deleteRepositories(baseDraft, {
        organization: "my-group",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result, {
        deletedCount: 1,
        missing: ["repo-missing"],
      })
    })
  })
})
