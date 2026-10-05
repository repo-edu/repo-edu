import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpRequest } from "@repo-edu/host-runtime-contract"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

const swaggerUrl = "https://gitea.example.com/api/swagger"

const teamRequest = {
  organization: "course-org",
  teamName: "hw1-team",
  memberUsernames: [] as string[],
  permission: "push" as const,
}

/** Gitea 1.27 answers an existing team name with 422 and this wording. */
const teamExists: MockRoute = {
  method: "POST",
  urlPattern: /\/api\/v1\/orgs\/course-org\/teams$/,
  status: 422,
  body: {
    message: "team already exists [org_id: 3, name: hw1-team]",
    url: swaggerUrl,
  },
}

function teamPage(page: number, teams: unknown[]): MockRoute {
  return {
    method: "GET",
    urlPattern: `/api/v1/orgs/course-org/teams?limit=50&page=${page}`,
    status: 200,
    body: teams,
  }
}

describe("gitea teams", () => {
  describe("createTeam", () => {
    it("creates a team and adds members", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          {
            method: "POST",
            urlPattern: /\/api\/v1\/orgs\/course-org\/teams$/,
            status: 201,
            body: { id: 42, name: "hw1-team" },
          },
          {
            method: "PUT",
            urlPattern: "/teams/42/members/alice",
            status: 204,
          },
          {
            method: "PUT",
            urlPattern: "/teams/42/members/nobody",
            status: 404,
            body: { message: "not found", url: swaggerUrl },
          },
        ],
        requests,
      )

      const client = createGiteaClient(http)
      const result = await client.createTeam(baseDraft, {
        ...teamRequest,
        memberUsernames: ["alice", "nobody"],
      })

      assert.deepStrictEqual(result, {
        created: true,
        teamSlug: "42",
        membersAdded: ["alice"],
        membersNotFound: ["nobody"],
      })
      const capturedBody = requests[0]?.body ?? ""
      assert.ok(capturedBody.includes('"permission":"write"'))
      assert.ok(capturedBody.includes('"units":["repo.code"'))
      assert.ok(capturedBody.includes('"repo.packages"'))
    })

    it("reuses an existing team found on a later page of the team list", async () => {
      const firstPage = Array.from({ length: 50 }, (_, index) => ({
        id: index + 1,
        name: `other-${index}`,
      }))
      const http = createMockHttpPort([
        teamExists,
        teamPage(1, firstPage),
        teamPage(2, [{ id: 142, name: "HW1-Team" }]),
      ])

      const result = await createGiteaClient(http).createTeam(
        baseDraft,
        teamRequest,
      )

      assert.equal(result.created, false)
      assert.equal(result.teamSlug, "142")
    })

    it("reports an existing team missing from the team list as a known failure", async () => {
      const http = createMockHttpPort([
        teamExists,
        teamPage(1, [{ id: 1, name: "other" }]),
        teamPage(2, []),
      ])

      await assert.rejects(
        createGiteaClient(http).createTeam(baseDraft, teamRequest),
        {
          message:
            "Gitea answered that team 'hw1-team' exists but does not list it.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("reports a refused team name as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: /\/api\/v1\/orgs\/course-org\/teams$/,
          status: 422,
          body: { message: "[Name]: AlphaDashDot", url: swaggerUrl },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).createTeam(baseDraft, teamRequest),
        {
          message:
            "POST /api/v1/orgs/course-org/teams answered 422: [Name]: AlphaDashDot",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("reports a created team answered without its id as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: /\/api\/v1\/orgs\/course-org\/teams$/,
          status: 201,
          body: { name: "hw1-team" },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).createTeam(baseDraft, teamRequest),
        {
          message: "Gitea created team 'hw1-team' but answered without its id.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("reports a refused member as a known failure", async () => {
      // Gitea refuses a user the organization has blocked.
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: /\/api\/v1\/orgs\/course-org\/teams$/,
          status: 201,
          body: { id: 42, name: "hw1-team" },
        },
        {
          method: "PUT",
          urlPattern: "/teams/42/members/alice",
          status: 403,
          body: { message: "user is blocked", url: swaggerUrl },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).createTeam(baseDraft, {
          ...teamRequest,
          memberUsernames: ["alice"],
        }),
        { type: "git-effect", disposition: "completed" },
      )
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("assigns repositories to a team", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          {
            method: "PUT",
            urlPattern: "/teams/42/repos/course-org/repo-1",
            status: 204,
          },
        ],
        requests,
      )

      const client = createGiteaClient(http)
      await client.assignRepositoriesToTeam(baseDraft, {
        organization: "course-org",
        teamSlug: "42",
        repositoryNames: ["repo-1"],
        permission: "push",
      })

      assert.deepStrictEqual(
        requests.map((request) => `${request.method} ${request.url}`),
        [
          "PUT https://gitea.example.com/api/v1/teams/42/repos/course-org/repo-1",
        ],
      )
    })

    it("reports a refused assignment as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "PUT",
          urlPattern: "/teams/42/repos/course-org/repo-1",
          status: 403,
          body: {
            message: "Must have admin-level access to the repository",
            url: swaggerUrl,
          },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).assignRepositoriesToTeam(baseDraft, {
          organization: "course-org",
          teamSlug: "42",
          repositoryNames: ["repo-1"],
          permission: "push",
        }),
        {
          message:
            "PUT /api/v1/teams/42/repos/course-org/repo-1 answered 403: Must have admin-level access to the repository",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })
  })
})
