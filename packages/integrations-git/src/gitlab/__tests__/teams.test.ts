import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft } from "./harness.js"

describe("gitlab teams", () => {
  describe("createTeam", () => {
    it("creates a subgroup team and adds members", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/groups/my-org")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 10, path: "my-org" }),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/groups") &&
            !request.url.includes("/members")
          ) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 77, path: "hw1-team" }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("username=alice")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify([
                { id: 5, username: "alice", state: "active" },
              ]),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("username=nobody")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify([]),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/groups/77/members")
          ) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
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
      const result = await client.createTeam(baseDraft, {
        organization: "my-org",
        teamName: "hw1-team",
        memberUsernames: ["alice", "nobody"],
        permission: "push",
      })

      assert.equal(result.created, true)
      assert.equal(result.teamSlug, "team-hw1-team")
      assert.deepStrictEqual(result.membersAdded, ["alice"])
      assert.deepStrictEqual(result.membersNotFound, ["nobody"])
    })

    it("reports a missing organization with a clear error", async () => {
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "404 Group Not Found" }),
          }
        },
      }

      const client = createGitLabClient(http)
      await assert.rejects(
        client.createTeam(baseDraft, {
          organization: "ghost-org",
          teamName: "hw1-team",
          memberUsernames: [],
          permission: "push",
        }),
        /Organization 'ghost-org' was not found on GitLab\./,
      )
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("shares projects with the team group", async () => {
      const capturedShareUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/groups/my-org%2Fhw1-team")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 77, path: "hw1-team" }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("/projects/my-org%2Frepo-1")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 100 }),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/projects/100/share")
          ) {
            capturedShareUrls.push(request.url)
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
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
      await client.assignRepositoriesToTeam(baseDraft, {
        organization: "my-org",
        teamSlug: "hw1-team",
        repositoryNames: ["repo-1"],
        permission: "push",
      })

      assert.equal(capturedShareUrls.length, 1)
      assert.ok(capturedShareUrls[0]?.includes("/projects/100/share"))
    })
  })
})
