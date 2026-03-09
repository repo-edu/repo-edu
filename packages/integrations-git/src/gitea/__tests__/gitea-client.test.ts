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
  organization: "course-org",
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
    it("returns verified true when org exists", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/orgs/course-org",
          status: 200,
          body: { username: "course-org" },
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
        baseUrl: null,
      })

      assert.deepStrictEqual(result, { verified: false })
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
        { ...baseDraft, baseUrl: null },
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
        template: null,
      })

      assert.equal(result.createdCount, 1)
      assert.ok(result.repositoryUrls[0].includes("repo-1"))
      assert.ok(capturedBody.includes('"private":true'))
    })

    it("uses the template generate endpoint when a template is provided", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.url.includes(
              "/api/v1/repos/templates/course-template/generate",
            )
          ) {
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
        template: {
          owner: "templates",
          name: "course-template",
          visibility: "public",
        },
      })

      assert.equal(result.createdCount, 1)
      assert.ok(capturedBody.includes('"owner":"course-org"'))
      assert.ok(capturedBody.includes('"name":"hw1-team-alpha"'))
      assert.ok(capturedBody.includes('"private":false'))
    })

    it("returns empty result when baseUrl is missing", async () => {
      const client = createGiteaClient(createMockHttpPort([]))
      const result = await client.createRepositories(
        { ...baseDraft, baseUrl: null },
        {
          organization: "course-org",
          repositoryNames: ["repo-1"],
          template: null,
        },
      )

      assert.deepStrictEqual(result, {
        createdCount: 0,
        repositoryUrls: [],
      })
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

  describe("deleteRepositories", () => {
    it("deletes repositories and reports missing", async () => {
      const http = createMockHttpPort([
        {
          method: "DELETE",
          urlPattern: "/api/v1/repos/course-org/repo-1",
          status: 204,
          body: {},
        },
        {
          method: "DELETE",
          urlPattern: "/api/v1/repos/course-org/repo-missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.deleteRepositories(baseDraft, {
        organization: "course-org",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result, {
        deletedCount: 1,
        missing: ["repo-missing"],
      })
    })
  })
})
