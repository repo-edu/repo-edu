import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft } from "./harness.js"

describe("gitea teams", () => {
  describe("createTeam", () => {
    it("creates a team and adds members", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "POST" &&
            request.url.includes("/api/v1/orgs/course-org/teams")
          ) {
            capturedBody = request.body ?? ""
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 42, name: "hw1-team" }),
            }
          }
          if (
            request.method === "PUT" &&
            request.url.includes("/teams/42/members/alice")
          ) {
            return {
              status: 204,
              statusText: "No Content",
              headers: { "content-type": "application/json" },
              body: "",
            }
          }
          if (
            request.method === "PUT" &&
            request.url.includes("/teams/42/members/nobody")
          ) {
            return {
              status: 404,
              statusText: "Not Found",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "Not Found" }),
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
      const result = await client.createTeam(baseDraft, {
        organization: "course-org",
        teamName: "hw1-team",
        memberUsernames: ["alice", "nobody"],
        permission: "push",
      })

      assert.equal(result.created, true)
      assert.equal(result.teamSlug, "42")
      assert.deepStrictEqual(result.membersAdded, ["alice"])
      assert.deepStrictEqual(result.membersNotFound, ["nobody"])
      assert.ok(capturedBody.includes('"permission":"write"'))
      assert.ok(capturedBody.includes('"units":["repo.code"'))
      assert.ok(capturedBody.includes('"repo.packages"'))
    })

    it("falls back to existing team on HTTP 409", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "POST" &&
            request.url.includes("/api/v1/orgs/course-org/teams")
          ) {
            return {
              status: 409,
              statusText: "Conflict",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "team already exists" }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("/api/v1/orgs/course-org/teams")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify([{ id: 42, name: "hw1-team" }]),
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
      const result = await client.createTeam(baseDraft, {
        organization: "course-org",
        teamName: "hw1-team",
        memberUsernames: [],
        permission: "push",
      })

      assert.equal(result.created, false)
      assert.equal(result.teamSlug, "42")
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("assigns repositories to a team", async () => {
      const capturedUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrls.push(`${request.method} ${request.url}`)
          return {
            status: 204,
            statusText: "No Content",
            headers: { "content-type": "application/json" },
            body: "",
          }
        },
      }

      const client = createGiteaClient(http)
      await client.assignRepositoriesToTeam(baseDraft, {
        organization: "course-org",
        teamSlug: "42",
        repositoryNames: ["repo-1"],
        permission: "push",
      })

      assert.equal(capturedUrls.length, 1)
      assert.ok(capturedUrls[0]?.includes("/teams/42/repos/course-org/repo-1"))
    })
  })
})
