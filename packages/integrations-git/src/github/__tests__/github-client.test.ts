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
        template: null,
      })

      assert.equal(result.createdCount, 1)
      assert.deepStrictEqual(result.repositoryUrls, [
        "https://github.com/test-org/repo-1",
      ])
    })

    it("creates repositories with template", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/repos/my-org/template/generate",
          status: 201,
          body: { html_url: "https://github.com/test-org/hw1-team-alpha" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["hw1-team-alpha"],
        template: {
          owner: "my-org",
          name: "template",
          visibility: "private",
        },
      })

      assert.equal(result.createdCount, 1)
      assert.ok(result.repositoryUrls[0].includes("hw1-team-alpha"))
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
        template: null,
      })

      assert.equal(result.createdCount, 1)
      assert.equal(result.repositoryUrls.length, 1)
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
