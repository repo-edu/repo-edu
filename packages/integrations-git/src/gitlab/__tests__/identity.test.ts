import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("gitlab identity", () => {
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

    it("sends the default user-agent when draft has none", async () => {
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
            body: JSON.stringify({ id: 1, username: "test-user" }),
          }
        },
      }

      const client = createGitLabClient(http)
      await client.verifyConnection({
        ...baseDraft,
        userAgent: "Name / Organization / email@example.edu",
      })

      assert.equal(
        capturedHeaders?.["User-Agent"],
        "Name / Organization / email@example.edu",
      )
    })

    it("forwards the configured user-agent on the REST path", async () => {
      const restHeaders: Record<string, string>[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          // Gitbeaker lookup path for the parent group.
          if (
            request.method === "GET" &&
            request.url.includes("/groups/my-org") &&
            !request.url.endsWith("/groups")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 10, path: "my-org" }),
            }
          }
          // REST path: POST /groups to create the subgroup.
          if (
            request.method === "POST" &&
            request.url.endsWith("/api/v4/groups")
          ) {
            restHeaders.push(request.headers ?? {})
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 77, path: "hw1-team" }),
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
      await client.createTeam(
        {
          ...baseDraft,
          userAgent: "Name / Organization / email@example.edu",
        },
        {
          organization: "my-org",
          teamName: "hw1-team",
          memberUsernames: [],
          permission: "push",
        },
      )

      assert.equal(restHeaders.length, 1)
      assert.equal(
        restHeaders[0]?.["User-Agent"],
        "Name / Organization / email@example.edu",
      )
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

    it("composes caller cancellation into Gitbeaker transport requests", async () => {
      const controller = new AbortController()
      let transportSignal: AbortSignal | undefined
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          transportSignal = request.signal
          controller.abort(new Error("caller stopped"))
          throw request.signal?.reason
        },
      }

      await assert.rejects(
        createGitLabClient(http).verifyConnection(baseDraft, controller.signal),
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError",
      )
      assert.equal(transportSignal?.aborted, true)
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
})
