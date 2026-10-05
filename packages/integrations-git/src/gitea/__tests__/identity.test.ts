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
        userAgent: "Name / Organization / email@example.com",
      })

      assert.equal(
        capturedHeaders?.["User-Agent"],
        "Name / Organization / email@example.com",
      )
    })
  })

  describe("verifyGitUsernames", () => {
    const notFound = {
      message: "not found",
      url: "https://gitea.example.com/api/swagger",
    }
    const user = (login: string, active: boolean, prohibitLogin: boolean) => ({
      id: 1,
      login,
      username: login,
      active,
      prohibit_login: prohibitLogin,
    })

    it("answers each account by its existence and state", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/users/alice",
          status: 200,
          body: user("alice", true, false),
        },
        {
          method: "GET",
          urlPattern: "/api/v1/users/inactive",
          status: 200,
          body: user("inactive", false, false),
        },
        {
          method: "GET",
          urlPattern: "/api/v1/users/blocked",
          status: 200,
          body: user("blocked", true, true),
        },
        {
          method: "GET",
          urlPattern: "/api/v1/users/missing",
          status: 404,
          body: notFound,
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.verifyGitUsernames(baseDraft, [
        "alice",
        "inactive",
        "blocked",
        "missing",
      ])

      assert.deepStrictEqual(result, [
        { username: "alice", exists: true },
        { username: "inactive", exists: false },
        { username: "blocked", exists: false },
        { username: "missing", exists: false },
      ])
    })

    it("finds an account whatever the case of its name", async () => {
      // Gitea looks a user up by its lower-case name.
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/users/Alice",
          status: 200,
          body: user("alice", true, false),
        },
      ])

      const result = await createGiteaClient(http).verifyGitUsernames(
        baseDraft,
        ["Alice"],
      )

      assert.deepStrictEqual(result, [{ username: "Alice", exists: true }])
    })

    it("reports an account answered without its state as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/users/alice",
          status: 200,
          body: { id: 1, login: "alice", username: "alice" },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).verifyGitUsernames(baseDraft, ["alice"]),
        {
          message: "Gitea answered user 'alice' without its account state.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("rejects username lookup when baseUrl is missing", async () => {
      const client = createGiteaClient(createMockHttpPort([]))

      await assert.rejects(
        client.verifyGitUsernames({ ...baseDraft, baseUrl: "" }, ["alice"]),
        { message: "Gitea baseUrl is required.", type: "git-effect" },
      )
    })
  })
})
