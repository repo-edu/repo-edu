import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("github teams", () => {
  describe("createTeam", () => {
    it("creates a team and adds members", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/teams",
          status: 201,
          body: { slug: "hw1-team" },
        },
        {
          method: "PUT",
          urlPattern: "/orgs/test-org/teams/hw1-team/memberships/alice",
          status: 200,
          body: { state: "active" },
        },
        {
          method: "PUT",
          urlPattern: "/orgs/test-org/teams/hw1-team/memberships/nobody",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "test-org",
        teamName: "hw1-team",
        memberUsernames: ["alice", "nobody"],
        permission: "push",
      })

      assert.equal(result.created, true)
      assert.equal(result.teamSlug, "hw1-team")
      assert.deepStrictEqual(result.membersAdded, ["alice"])
      assert.deepStrictEqual(result.membersNotFound, ["nobody"])
    })

    it("falls back to existing team on HTTP 422", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/teams",
          status: 422,
          body: { message: "Validation Failed" },
        },
        {
          method: "GET",
          urlPattern: "/orgs/test-org/teams/hw1-team",
          status: 200,
          body: { slug: "hw1-team" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "test-org",
        teamName: "hw1-team",
        memberUsernames: [],
        permission: "push",
      })

      assert.equal(result.created, false)
      assert.equal(result.teamSlug, "hw1-team")
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("assigns repositories to a team", async () => {
      const capturedUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrls.push(request.url)
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          }
        },
      }

      const client = createGitHubClient(http)
      await client.assignRepositoriesToTeam(baseDraft, {
        organization: "test-org",
        teamSlug: "hw1-team",
        repositoryNames: ["repo-1", "repo-2"],
        permission: "push",
      })

      assert.equal(capturedUrls.length, 2)
      assert.ok(
        capturedUrls[0]?.includes("/teams/hw1-team/repos/test-org/repo-1"),
      )
      assert.ok(
        capturedUrls[1]?.includes("/teams/hw1-team/repos/test-org/repo-2"),
      )
    })
  })
})
