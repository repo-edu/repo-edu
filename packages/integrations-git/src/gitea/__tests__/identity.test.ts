import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("gitea identity", () => {
  describe("verifyConnection", () => {
    it("returns verified true when authenticated user exists", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/user",
          status: 200,
          body: { username: "test-user" },
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
        baseUrl: "",
      })

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
            body: JSON.stringify({ username: "test-user" }),
          }
        },
      }

      const client = createGiteaClient(http)
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
            body: JSON.stringify({ username: "test-user" }),
          }
        },
      }

      const client = createGiteaClient(http)
      await client.verifyConnection({
        ...baseDraft,
        userAgent: "Name / Organization / email@example.edu",
      })

      assert.equal(
        capturedHeaders?.["User-Agent"],
        "Name / Organization / email@example.edu",
      )
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
        { ...baseDraft, baseUrl: "" },
        ["alice"],
      )

      assert.deepStrictEqual(result, [{ username: "alice", exists: false }])
    })
  })
})
