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
    /** Gitea fills `active` and `prohibit_login` only for a site admin or
     * the account itself; every other caller reads `false` for both. */
    const user = (login: string) => ({
      id: 1,
      login,
      username: login,
      active: false,
      prohibit_login: false,
    })

    it("answers each account by its existence", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/users/alice",
          status: 200,
          body: user("alice"),
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
        "missing",
      ])

      assert.deepStrictEqual(result, [
        { username: "alice", exists: true },
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
          body: user("alice"),
        },
      ])

      const result = await createGiteaClient(http).verifyGitUsernames(
        baseDraft,
        ["Alice"],
      )

      assert.deepStrictEqual(result, [{ username: "Alice", exists: true }])
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
