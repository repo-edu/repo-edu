import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort, findUserAgent } from "./harness.js"

describe("github identity", () => {
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

    it("sends the default user-agent when draft has none", async () => {
      let capturedHeaders: Record<string, string> | undefined
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedHeaders = request.headers
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ login: "test-user", id: 1 }),
          }
        },
      }

      const client = createGitHubClient(http)
      await client.verifyConnection(baseDraft)

      const userAgent = findUserAgent(capturedHeaders)
      assert.ok(
        userAgent?.startsWith("repo-edu"),
        `expected user-agent to start with "repo-edu", got: ${userAgent}`,
      )
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
            body: JSON.stringify({ login: "test-user", id: 1 }),
          }
        },
      }

      const client = createGitHubClient(http)
      await client.verifyConnection({
        ...baseDraft,
        userAgent: "Name / Organization / email@example.edu",
      })

      const userAgent = findUserAgent(capturedHeaders)
      assert.ok(
        userAgent?.startsWith("Name / Organization / email@example.edu"),
        `expected user-agent to start with the configured value, got: ${userAgent}`,
      )
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
      await assert.rejects(
        client.verifyGitUsernames(
          baseDraft,
          ["alice", "bob"],
          controller.signal,
        ),
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError",
      )
    })
  })
})
