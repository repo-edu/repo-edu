import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { separateTeamGroups } from "../../__tests__/team-groups.js"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

const group = { groupId: "g_0001", groupName: "Group 1" }

/** GitHub's REST reference answers a refused team with 422 "Validation
 * failed" in its validation-error shape. */
const validationFailed = {
  message: "Validation Failed",
  errors: [{ resource: "Team", code: "already_exists", field: "name" }],
  documentation_url: "https://docs.github.com/rest/teams/teams#create-a-team",
  status: "422",
}

const teamRefused: MockRoute = {
  method: "POST",
  urlPattern: /\/orgs\/test-org\/teams$/,
  status: 422,
  body: validationFailed,
}

function teamPage(page: number, teams: unknown[]): MockRoute {
  return {
    method: "GET",
    urlPattern: new RegExp(`/orgs/test-org/teams\\?(.*&)?page=${page}(&|$)`),
    status: 200,
    body: teams,
  }
}

describe("github teams", () => {
  describe("createTeam", () => {
    it("creates a team named after its group and adds members", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
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
        ],
        requests,
      )

      const client = createGitHubClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "test-org",
        ...group,
        memberUsernames: ["alice", "nobody"],
        permission: "push",
      })

      assert.equal(
        JSON.parse(requests[0]?.body ?? "{}").name,
        "team-group-1-g_0001",
      )
      assert.equal(result.created, true)
      assert.equal(result.teamSlug, "hw1-team")
      assert.deepStrictEqual(result.membersAdded, ["alice"])
      assert.deepStrictEqual(result.membersNotFound, ["nobody"])
    })

    it("reuses an existing team found on a later page of the team list", async () => {
      // GitHub builds the slug by its own rule, so it is read from the
      // listed team rather than rebuilt from the name.
      const firstPage = Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        name: `other-${index}`,
        slug: `other-${index}`,
      }))
      const http = createMockHttpPort([
        teamRefused,
        teamPage(1, firstPage),
        teamPage(2, [
          { id: 142, name: "team-group-1-g_0001", slug: "team-group-1-g-0001" },
        ]),
      ])

      const client = createGitHubClient(http)
      const result = await client.createTeam(baseDraft, {
        organization: "test-org",
        ...group,
        memberUsernames: [],
        permission: "push",
      })

      assert.equal(result.created, false)
      assert.equal(result.teamSlug, "team-group-1-g-0001")
    })

    it("gives every group its own team", async () => {
      const requests: HttpRequest[] = []
      const client = createGitHubClient(
        createMockHttpPort(
          [
            {
              method: "POST",
              urlPattern: "/orgs/test-org/teams",
              status: 201,
              body: { slug: "team" },
            },
          ],
          requests,
        ),
      )
      for (const { groupId, groupName } of separateTeamGroups) {
        await client.createTeam(baseDraft, {
          organization: "test-org",
          groupId,
          groupName,
          memberUsernames: [],
          permission: "push",
        })
      }

      assert.deepStrictEqual(
        requests.map((request) => JSON.parse(request.body ?? "{}").name),
        separateTeamGroups.map((group) => group.teamName),
      )
    })
  })

  describe("createTeam failures", () => {
    const teamRequest = {
      organization: "test-org",
      ...group,
      memberUsernames: ["alice"],
      permission: "push" as const,
    }

    it("reports a team answered without its slug as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/teams",
          status: 201,
          body: { id: 1, name: "team-group-1-g_0001" },
        },
      ])

      await assert.rejects(
        createGitHubClient(http).createTeam(baseDraft, teamRequest),
        {
          message:
            "GitHub answered team 'team-group-1-g_0001' without its slug.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("reports a refused team the team list does not hold as the refusal", async () => {
      const http = createMockHttpPort([
        {
          ...teamRefused,
          body: {
            message: "Validation Failed",
            errors: [{ resource: "Team", code: "invalid", field: "privacy" }],
            status: "422",
          },
        },
        teamPage(1, [{ id: 1, name: "other", slug: "other" }]),
        teamPage(2, []),
      ])

      await assert.rejects(
        createGitHubClient(http).createTeam(baseDraft, teamRequest),
        {
          message:
            'POST /orgs/test-org/teams answered 422: Validation Failed: {"resource":"Team","code":"invalid","field":"privacy"}',
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("reports an unreadable team list or a listed team without its slug as a known failure", async () => {
      const cases: Array<[unknown, string]> = [
        [
          { message: "unexpected" },
          "GitHub answered an unreadable team list for 'test-org'.",
        ],
        [
          [{ id: 1, name: "team-group-1-g_0001" }],
          "GitHub answered team 'team-group-1-g_0001' without its slug.",
        ],
      ]
      for (const [page, message] of cases) {
        const http = createMockHttpPort([
          teamRefused,
          { ...teamPage(1, []), body: page },
        ])

        await assert.rejects(
          createGitHubClient(http).createTeam(baseDraft, teamRequest),
          { message, type: "git-effect", disposition: "completed" },
        )
      }
    })

    it("reports a refused member as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/teams",
          status: 201,
          body: { id: 1, slug: "hw1-team" },
        },
        {
          method: "PUT",
          urlPattern: "/orgs/test-org/teams/hw1-team/memberships/alice",
          status: 403,
          body: {
            message:
              "Team membership is managed by an identity provider and cannot be changed here.",
            status: "403",
          },
        },
      ])

      await assert.rejects(
        createGitHubClient(http).createTeam(baseDraft, teamRequest),
        { type: "git-effect", disposition: "completed" },
      )
    })
  })

  describe("assignRepositoriesToTeam", () => {
    it("assigns repositories to a team", async () => {
      // GitHub's REST reference answers an assignment with 204 No Content,
      // which the Node HTTP port passes on with an empty body.
      const capturedUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrls.push(request.url)
          return {
            status: 204,
            statusText: "No Content",
            headers: {},
            body: "",
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
