import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("gitea repositories", () => {
  it("does not report a lost create response as a known repository failure", async () => {
    const lost = new Error("Response lost.")
    const client = createGiteaClient({
      async fetch() {
        throw lost
      },
    })
    await assert.rejects(
      client.createRepositories(baseDraft, {
        organization: "course-org",
        repositoryNames: ["repo"],
        visibility: "private",
        autoInit: true,
      }),
      (error) => error === lost,
    )
  })

  it("preserves a completed create response racing cancellation", async () => {
    const abort = new AbortController()
    const client = createGiteaClient({
      async fetch() {
        abort.abort()
        return {
          status: 201,
          statusText: "Created",
          headers: {},
          body: JSON.stringify({
            html_url: "https://example.test/repo",
            clone_url: "https://example.test/repo.git",
          }),
        }
      },
    })
    const result = await client.createRepositories(
      baseDraft,
      {
        organization: "course-org",
        repositoryNames: ["repo"],
        visibility: "private",
        autoInit: true,
      },
      abort.signal,
    )
    assert.equal(result.created.length, 1)
  })

  it("proves a stopped batch before the next mutation begins", async () => {
    const abort = new AbortController()
    let calls = 0
    const client = createGiteaClient({
      async fetch() {
        calls += 1
        abort.abort()
        return {
          status: 201,
          statusText: "Created",
          headers: {},
          body: JSON.stringify({
            html_url: "https://example.test/repo",
            clone_url: "https://example.test/repo.git",
          }),
        }
      },
    })
    await assert.rejects(
      client.createRepositories(
        baseDraft,
        {
          organization: "course-org",
          repositoryNames: ["repo", "next"],
          visibility: "private",
          autoInit: true,
        },
        abort.signal,
      ),
      (error) =>
        error instanceof Error &&
        "type" in error &&
        error.type === "git-effect" &&
        "disposition" in error &&
        error.disposition === "stopped",
    )
    assert.equal(calls, 1)
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
                clone_url: "https://gitea.example.com/course-org/repo-1.git",
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

      assert.deepStrictEqual(result.created, [
        {
          repositoryName: "repo-1",
          repositoryUrl: "https://gitea.example.com/course-org/repo-1",
          cloneUrl:
            "https://token:gitea-test-token@gitea.example.com/course-org/repo-1.git",
        },
      ])
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
                clone_url:
                  "https://gitea.example.com/course-org/hw1-team-alpha.git",
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

    it("reports a missing baseUrl as a known failure", async () => {
      const client = createGiteaClient(createMockHttpPort([]))
      await assert.rejects(
        client.createRepositories(
          { ...baseDraft, baseUrl: "" },
          {
            organization: "course-org",
            repositoryNames: ["repo-1"],
            visibility: "private",
            autoInit: true,
          },
        ),
        {
          message: "Gitea baseUrl is required.",
          type: "git-effect",
          disposition: "completed",
        },
      )
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
                url: "https://gitea.example.com/api/swagger",
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
                clone_url: "https://gitea.example.com/course-org/repo-1.git",
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
      assert.deepStrictEqual(result.alreadyExisted, [
        {
          repositoryName: "repo-1",
          repositoryUrl: "https://gitea.example.com/course-org/repo-1",
          cloneUrl:
            "https://token:gitea-test-token@gitea.example.com/course-org/repo-1.git",
        },
      ])
      assert.deepStrictEqual(result.failed, [])
    })
  })

  describe("createRepositories failures", () => {
    const request = {
      organization: "course-org",
      repositoryNames: ["repo-1"],
      visibility: "private" as const,
      autoInit: true,
    }

    it("records a refused create as that repository's failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/api/v1/orgs/course-org/repos",
          status: 422,
          body: {
            message: "name is reserved [name: repo-1]",
            url: "https://gitea.example.com/api/swagger",
          },
        },
      ])

      const result = await createGiteaClient(http).createRepositories(
        baseDraft,
        request,
      )

      assert.deepStrictEqual(result, {
        created: [],
        alreadyExisted: [],
        failed: [
          {
            repositoryName: "repo-1",
            reason:
              "POST /api/v1/orgs/course-org/repos answered 422: name is reserved [name: repo-1]",
          },
        ],
      })
    })

    it("records a created repository answered without its URLs as that repository's failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/api/v1/orgs/course-org/repos",
          status: 201,
          body: { id: 7, name: "repo-1" },
        },
      ])

      const result = await createGiteaClient(http).createRepositories(
        baseDraft,
        request,
      )

      assert.deepStrictEqual(result.failed, [
        {
          repositoryName: "repo-1",
          reason:
            "Gitea created the repository but answered without its web or clone URL.",
        },
      ])
    })

    it("records a refused lookup of an existing repository as that repository's failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/api/v1/orgs/course-org/repos",
          status: 409,
          body: {
            message: "The repository with the same name already exists.",
            url: "https://gitea.example.com/api/swagger",
          },
        },
        {
          method: "GET",
          urlPattern: "/api/v1/repos/course-org/repo-1",
          status: 403,
          body: {
            message: "token does not have at least one of required scope(s)",
            url: "https://gitea.example.com/api/swagger",
          },
        },
      ])

      const result = await createGiteaClient(http).createRepositories(
        baseDraft,
        request,
      )

      assert.deepStrictEqual(result.failed, [
        {
          repositoryName: "repo-1",
          reason:
            "Repository exists but lookup failed: GET /api/v1/repos/course-org/repo-1 answered 403: token does not have at least one of required scope(s)",
        },
      ])
    })

    it("records an existing repository answered without its URLs as that repository's failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/api/v1/orgs/course-org/repos",
          status: 409,
          body: {
            message: "The repository with the same name already exists.",
            url: "https://gitea.example.com/api/swagger",
          },
        },
        {
          method: "GET",
          urlPattern: "/api/v1/repos/course-org/repo-1",
          status: 200,
          body: { id: 7, name: "repo-1" },
        },
      ])

      const result = await createGiteaClient(http).createRepositories(
        baseDraft,
        request,
      )

      assert.deepStrictEqual(result.failed, [
        {
          repositoryName: "repo-1",
          reason:
            "Repository exists but Gitea answered without its web or clone URL.",
        },
      ])
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
          body: {
            message: "not found",
            url: "https://gitea.example.com/api/swagger",
          },
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
