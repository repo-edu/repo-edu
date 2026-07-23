import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("gitlab repositories", () => {
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
            http_url_to_repo:
              "https://gitlab.example.com/target-group/repo-1.git",
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

      assert.deepStrictEqual(result.created, [
        {
          repositoryName: "repo-1",
          repositoryUrl: "https://gitlab.example.com/target-group/repo-1",
          cloneUrl:
            "https://oauth2:glpat-test-token@gitlab.example.com/target-group/repo-1.git",
        },
      ])
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
                http_url_to_repo:
                  "https://gitlab.example.com/my-group/hw1-team-alpha.git",
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

    it("propagates provider failures while resolving the namespace", async () => {
      const timeout = new DOMException(
        "The operation timed out.",
        "TimeoutError",
      )
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          throw timeout
        },
      }

      const client = createGitLabClient(http)
      await assert.rejects(
        client.createRepositories(baseDraft, {
          organization: "my-group",
          repositoryNames: ["repo-1"],
          visibility: "private",
          autoInit: true,
        }),
        timeout,
      )
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
                http_url_to_repo:
                  "https://gitlab.example.com/my-group/repo-1.git",
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
      assert.deepStrictEqual(result.alreadyExisted, [
        {
          repositoryName: "repo-1",
          repositoryUrl: "https://gitlab.example.com/my-group/repo-1",
          cloneUrl:
            "https://oauth2:glpat-test-token@gitlab.example.com/my-group/repo-1.git",
        },
      ])
      assert.deepStrictEqual(result.failed, [])
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
