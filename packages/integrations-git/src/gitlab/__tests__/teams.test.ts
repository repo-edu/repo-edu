import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

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

  describe("createTeam answers", () => {
    const teamRequest = {
      organization: "my-org",
      teamName: "hw1-team",
      memberUsernames: [] as string[],
      permission: "push" as const,
    }
    const organization: MockRoute = {
      method: "GET",
      urlPattern: /\/groups\/my-org$/,
      status: 200,
      body: { id: 10, path: "my-org" },
    }
    // GitLab answers a taken subgroup path with this 400 wording.
    const groupTaken: MockRoute = {
      method: "POST",
      urlPattern: /\/api\/v4\/groups$/,
      status: 400,
      body: {
        message: 'Failed to save group {:path=>["has already been taken"]}',
      },
    }

    it("reuses the team group that already holds the path", async () => {
      const http = createMockHttpPort([
        organization,
        groupTaken,
        {
          method: "GET",
          urlPattern: "/groups/my-org%2Fteam-hw1-team",
          status: 200,
          body: { id: 77, path: "team-hw1-team" },
        },
      ])

      const result = await createGitLabClient(http).createTeam(
        baseDraft,
        teamRequest,
      )

      assert.equal(result.created, false)
      assert.equal(result.teamSlug, "team-hw1-team")
    })

    it("reports a taken team without a group at its path as a known failure", async () => {
      const http = createMockHttpPort([
        organization,
        groupTaken,
        {
          method: "GET",
          urlPattern: "/groups/my-org%2Fteam-hw1-team",
          status: 404,
          body: { message: "404 Group Not Found" },
        },
      ])

      await assert.rejects(
        createGitLabClient(http).createTeam(baseDraft, teamRequest),
        {
          message:
            "GitLab answered that team 'hw1-team' is taken, but no group exists at 'my-org/team-hw1-team'.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("reports a created team group answered without its id as a known failure", async () => {
      const http = createMockHttpPort([
        organization,
        {
          method: "POST",
          urlPattern: /\/api\/v4\/groups$/,
          status: 201,
          body: { path: "team-hw1-team" },
        },
      ])

      await assert.rejects(
        createGitLabClient(http).createTeam(baseDraft, teamRequest),
        {
          message:
            "GitLab created team group 'my-org/team-hw1-team' but answered without its id.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("counts an existing member as added and reports another refusal as a known failure", async () => {
      const routes = (status: number, message: string): MockRoute[] => [
        organization,
        {
          method: "POST",
          urlPattern: /\/api\/v4\/groups$/,
          status: 201,
          body: { id: 77, path: "team-hw1-team" },
        },
        {
          method: "GET",
          urlPattern: /username=alice/,
          status: 200,
          body: [{ id: 5, username: "alice", state: "active" }],
        },
        {
          method: "POST",
          urlPattern: "/groups/77/members",
          status,
          body: { message },
        },
      ]
      const request = { ...teamRequest, memberUsernames: ["alice"] }

      const result = await createGitLabClient(
        createMockHttpPort(routes(409, "Member already exists")),
      ).createTeam(baseDraft, request)
      assert.deepStrictEqual(result.membersAdded, ["alice"])

      await assert.rejects(
        createGitLabClient(
          createMockHttpPort(routes(403, "403 Forbidden")),
        ).createTeam(baseDraft, request),
        { type: "git-effect", disposition: "completed" },
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

    it("accepts a project already shared with the team and reports another refusal as a known failure", async () => {
      const routes = (status: number, message: string): MockRoute[] => [
        {
          method: "GET",
          urlPattern: "/groups/my-org%2Fhw1-team",
          status: 200,
          body: { id: 77, path: "hw1-team" },
        },
        {
          method: "GET",
          urlPattern: "/projects/my-org%2Frepo-1",
          status: 200,
          body: { id: 100 },
        },
        {
          method: "POST",
          urlPattern: "/projects/100/share",
          status,
          body: { message },
        },
      ]
      const request = {
        organization: "my-org",
        teamSlug: "hw1-team",
        repositoryNames: ["repo-1"],
        permission: "push" as const,
      }

      await createGitLabClient(
        createMockHttpPort(
          routes(409, "Project already shared with this group"),
        ),
      ).assignRepositoriesToTeam(baseDraft, request)

      await assert.rejects(
        createGitLabClient(
          createMockHttpPort(
            routes(409, "Group access is not included in the list"),
          ),
        ).assignRepositoriesToTeam(baseDraft, request),
        { type: "git-effect", disposition: "completed" },
      )
    })

    it("reports a missing team group or project as a known failure", async () => {
      const request = {
        organization: "my-org",
        teamSlug: "hw1-team",
        repositoryNames: ["repo-1"],
        permission: "push" as const,
      }
      await assert.rejects(
        createGitLabClient(
          createMockHttpPort([
            {
              method: "GET",
              urlPattern: "/groups/my-org%2Fhw1-team",
              status: 404,
              body: { message: "404 Group Not Found" },
            },
          ]),
        ).assignRepositoriesToTeam(baseDraft, request),
        {
          message: "GitLab team 'my-org/hw1-team' not found.",
          type: "git-effect",
          disposition: "completed",
        },
      )
      await assert.rejects(
        createGitLabClient(
          createMockHttpPort([
            {
              method: "GET",
              urlPattern: "/groups/my-org%2Fhw1-team",
              status: 200,
              body: { id: 77, path: "hw1-team" },
            },
            {
              method: "GET",
              urlPattern: "/projects/my-org%2Frepo-1",
              status: 404,
              body: { message: "404 Project Not Found" },
            },
          ]),
        ).assignRepositoriesToTeam(baseDraft, request),
        {
          message: "GitLab project 'my-org/repo-1' not found.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })
  })
})
