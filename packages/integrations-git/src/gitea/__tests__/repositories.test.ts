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
      assert.equal(result.alreadyExisted.length, 1)
      assert.equal(result.alreadyExisted[0]?.repositoryName, "repo-1")
      assert.deepStrictEqual(result.failed, [])
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
