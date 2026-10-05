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
        userAgent: "Name / Organization / email@example.com",
      })

      assert.equal(
        capturedHeaders?.["User-Agent"],
        "Name / Organization / email@example.com",
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
          userAgent: "Name / Organization / email@example.com",
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
        "Name / Organization / email@example.com",
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
        { type: "git-effect", disposition: "stopped" },
      )
      assert.equal(transportSignal?.aborted, true)
    })
  })

  describe("verifyGitUsernames", () => {
    it("answers each account by its existence and state", async () => {
      // GitLab matches the username filter without regard to case.
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /username=Alice/,
          status: 200,
          body: [{ id: 1, username: "alice", state: "active" }],
        },
        {
          method: "GET",
          urlPattern: /username=nobody/,
          status: 200,
          body: [],
        },
        {
          method: "GET",
          urlPattern: /username=blocked/,
          status: 200,
          body: [{ id: 2, username: "blocked", state: "blocked" }],
        },
        {
          method: "GET",
          urlPattern: /username=banned/,
          status: 200,
          body: [{ id: 3, username: "banned", state: "banned" }],
        },
        {
          method: "GET",
          urlPattern: /username=dormant/,
          status: 200,
          body: [{ id: 4, username: "dormant", state: "deactivated" }],
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.verifyGitUsernames(baseDraft, [
        "Alice",
        "nobody",
        "blocked",
        "banned",
        "dormant",
      ])

      assert.deepStrictEqual(result, [
        { username: "Alice", exists: true },
        { username: "nobody", exists: false },
        { username: "blocked", exists: false },
        { username: "banned", exists: false },
        { username: "dormant", exists: false },
      ])
    })

    it("reports an account answered without its state as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /username=alice/,
          status: 200,
          body: [{ id: 1, username: "alice" }],
        },
      ])

      await assert.rejects(
        createGitLabClient(http).verifyGitUsernames(baseDraft, ["alice"]),
        {
          message:
            "GitLab answered user 'alice' without its id or account state.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("reports an unreadable user search as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /username=alice/,
          status: 200,
          body: { message: "unexpected" },
        },
      ])

      await assert.rejects(
        createGitLabClient(http).verifyGitUsernames(baseDraft, ["alice"]),
        {
          message: "GitLab answered an unreadable user search for 'alice'.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })
  })
})
