import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

describe("gitlab repositories", () => {
  describe("createRepositories", () => {
    it("creates repositories in the requested group namespace", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/target-group",
          status: 200,
          body: { id: 42, path: "target-group" },
        },
        {
          method: "POST",
          urlPattern: "/projects",
          status: 201,
          body: {
            id: 100,
            web_url: "https://gitlab.example.com/target-group/repo-1",
            http_url_to_repo:
              "https://gitlab.example.com/target-group/repo-1.git",
          },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "target-group",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.deepStrictEqual(result.created, [
        {
          repositoryName: "repo-1",
          repositoryUrl: "https://gitlab.example.com/target-group/repo-1",
          cloneUrl:
            "https://oauth2:glpat-test-token@gitlab.example.com/target-group/repo-1.git",
        },
      ])
    })

    it("creates repos with internal visibility", async () => {
      let capturedBody = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/groups/my-group")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 42, path: "my-group" }),
            }
          }

          if (request.url.includes("/projects")) {
            capturedBody = request.body ?? ""
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: 101,
                web_url: "https://gitlab.example.com/my-group/hw1-team-alpha",
                http_url_to_repo:
                  "https://gitlab.example.com/my-group/hw1-team-alpha.git",
              }),
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
      const result = await client.createRepositories(baseDraft, {
        organization: "my-group",
        repositoryNames: ["hw1-team-alpha"],
        visibility: "internal",
        autoInit: false,
      })

      assert.equal(result.created.length, 1)
      assert.ok(capturedBody.includes('"visibility":"internal"'))
    })

    it("reports a group answered without its id as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/my-group",
          status: 200,
          body: { path: "my-group" },
        },
      ])

      const client = createGitLabClient(http)
      await assert.rejects(
        client.createRepositories(baseDraft, {
          organization: "my-group",
          repositoryNames: ["repo-1"],
          visibility: "private",
          autoInit: true,
        }),
        {
          message: "GitLab answered group 'my-group' without its id.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("records a refused or incompletely answered create as that repository's failure", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/my-group",
          status: 200,
          body: { id: 42, path: "my-group" },
        },
        {
          method: "POST",
          urlPattern: /\/projects$/,
          status: 400,
          body: {
            message: {
              path: [
                "can contain only letters, digits, '_', '-' and '.'. Cannot start with '-', end in '.git' or end in '.atom'",
              ],
            },
          },
        },
      ])

      const result = await createGitLabClient(http).createRepositories(
        baseDraft,
        {
          organization: "my-group",
          repositoryNames: ["repo 1"],
          visibility: "private",
          autoInit: true,
        },
      )
      assert.equal(result.failed.length, 1)
      assert.match(
        result.failed[0]?.reason ?? "",
        /^POST \/api\/v4\/projects answered 400: /,
      )

      const incomplete = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/my-group",
          status: 200,
          body: { id: 42, path: "my-group" },
        },
        {
          method: "POST",
          urlPattern: /\/projects$/,
          status: 201,
          body: { id: 100, path: "repo-1" },
        },
      ])
      assert.deepStrictEqual(
        (
          await createGitLabClient(incomplete).createRepositories(baseDraft, {
            organization: "my-group",
            repositoryNames: ["repo-1"],
            visibility: "private",
            autoInit: true,
          })
        ).failed,
        [
          {
            repositoryName: "repo-1",
            reason:
              "GitLab created the repository but answered without its web or clone URL.",
          },
        ],
      )
    })

    it("reports every repository as failed when the group is missing", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/groups/no-such-group",
          status: 404,
          body: { message: "404 Group Not Found" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "no-such-group",
        repositoryNames: ["repo-1", "repo-2"],
        visibility: "private",
        autoInit: true,
      })

      assert.deepStrictEqual(result.created, [])
      assert.deepStrictEqual(result.alreadyExisted, [])
      assert.deepStrictEqual(result.failed, [
        {
          repositoryName: "repo-1",
          reason: "GitLab group 'no-such-group' was not found.",
        },
        {
          repositoryName: "repo-2",
          reason: "GitLab group 'no-such-group' was not found.",
        },
      ])
    })

    it("reports a failed namespace read as a known failure", async () => {
      const timeout = new DOMException(
        "The operation timed out.",
        "TimeoutError",
      )
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          throw timeout
        },
      }

      const client = createGitLabClient(http)
      await assert.rejects(
        client.createRepositories(baseDraft, {
          organization: "my-group",
          repositoryNames: ["repo-1"],
          visibility: "private",
          autoInit: true,
        }),
        {
          message: "The operation timed out.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("sends a read with the caller's signal only", async () => {
      // Gitbeaker gives every read its own five-minute timer, which would
      // otherwise read as the caller's stop.
      const groupReadSignals: Array<AbortSignal | undefined> = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          groupReadSignals.push(request.signal)
          return {
            status: 404,
            statusText: "Not Found",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "404 Group Not Found" }),
          }
        },
      }
      const request = {
        organization: "my-group",
        repositoryNames: ["repo-1"],
        visibility: "private" as const,
        autoInit: true,
      }
      const controller = new AbortController()

      const client = createGitLabClient(http)
      await client.createRepositories(baseDraft, request, controller.signal)
      await client.createRepositories(baseDraft, request)

      assert.deepStrictEqual(groupReadSignals, [controller.signal, undefined])
    })

    it("URL-encodes group paths with slashes", async () => {
      let capturedUrl = ""
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/groups/")) {
            capturedUrl = request.url
          }
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: 42, path: "nested" }),
          }
        },
      }

      const client = createGitLabClient(http)
      await client.createRepositories(baseDraft, {
        organization: "parent/nested",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.ok(
        capturedUrl.includes("parent%2Fnested"),
        `Expected URL-encoded path, got: ${capturedUrl}`,
      )
    })
  })

  describe("createRepositories alreadyExisted", () => {
    it("classifies a taken name as alreadyExisted", async () => {
      let projectPostCalled = false
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/groups/my-group")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 42, path: "my-group" }),
            }
          }
          if (request.method === "POST" && request.url.includes("/projects")) {
            projectPostCalled = true
            return {
              status: 400,
              statusText: "Bad Request",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                message: {
                  name: ["has already been taken"],
                  path: ["has already been taken"],
                },
              }),
            }
          }
          if (
            request.method === "GET" &&
            request.url.includes("/projects/my-group%2Frepo-1")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                web_url: "https://gitlab.example.com/my-group/repo-1",
                http_url_to_repo:
                  "https://gitlab.example.com/my-group/repo-1.git",
              }),
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
      const result = await client.createRepositories(baseDraft, {
        organization: "my-group",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.ok(projectPostCalled)
      assert.deepStrictEqual(result.created, [])
      assert.deepStrictEqual(result.alreadyExisted, [
        {
          repositoryName: "repo-1",
          repositoryUrl: "https://gitlab.example.com/my-group/repo-1",
          cloneUrl:
            "https://oauth2:glpat-test-token@gitlab.example.com/my-group/repo-1.git",
        },
      ])
      assert.deepStrictEqual(result.failed, [])
    })

    it("records a refused or incompletely answered lookup of an existing repository as that repository's failure", async () => {
      const createAnswersTaken: MockRoute[] = [
        {
          method: "GET",
          urlPattern: "/groups/my-group",
          status: 200,
          body: { id: 42, path: "my-group" },
        },
        {
          method: "POST",
          urlPattern: /\/projects$/,
          status: 400,
          body: {
            message: {
              name: ["has already been taken"],
              path: ["has already been taken"],
            },
          },
        },
      ]
      const lookup = (status: number, body: unknown): MockRoute => ({
        method: "GET",
        urlPattern: "/projects/my-group%2Frepo-1",
        status,
        body,
      })
      const cases: Array<[MockRoute, RegExp]> = [
        [
          lookup(404, { message: "404 Project Not Found" }),
          /^Repository exists but lookup failed: GET \/api\/v4\/projects\/my-group\/repo-1 answered 404: 404 Project Not Found$/,
        ],
        [
          lookup(200, { id: 100, path: "repo-1" }),
          /^Repository exists but GitLab answered without its web or clone URL\.$/,
        ],
      ]
      for (const [reply, reason] of cases) {
        const result = await createGitLabClient(
          createMockHttpPort([...createAnswersTaken, reply]),
        ).createRepositories(baseDraft, {
          organization: "my-group",
          repositoryNames: ["repo-1"],
          visibility: "private",
          autoInit: true,
        })

        assert.deepStrictEqual(result.alreadyExisted, [])
        assert.equal(result.failed.length, 1)
        assert.match(result.failed[0]?.reason ?? "", reason)
      }
    })
  })

  describe("resolveRepositoryCloneUrls", () => {
    it("resolves clone URLs and reports missing repositories", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/projects/my-group%2Frepo-1",
          status: 200,
          body: {
            http_url_to_repo: "https://gitlab.example.com/my-group/repo-1.git",
          },
        },
        {
          method: "GET",
          urlPattern: "/projects/my-group%2Frepo-missing",
          status: 404,
          body: { message: "404 Project Not Found" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.resolveRepositoryCloneUrls(baseDraft, {
        organization: "my-group",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result.missing, ["repo-missing"])
      assert.equal(result.resolved.length, 1)
      assert.equal(result.resolved[0]?.repositoryName, "repo-1")
      assert.ok(
        result.resolved[0]?.cloneUrl.includes("oauth2:glpat-test-token"),
      )
    })
  })

  describe("getRepositoryDefaultBranchHead", () => {
    it("returns HEAD sha and branch name", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/repository\/branches\//,
          status: 200,
          body: { commit: { id: "abc123" } },
        },
        {
          method: "GET",
          urlPattern: "/projects/",
          status: 200,
          body: { id: 50, default_branch: "main" },
        },
      ])

      const client = createGitLabClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
      })

      assert.deepStrictEqual(result, { sha: "abc123", branchName: "main" })
    })

    it("answers a missing project or default branch with null", async () => {
      // An empty repository names a default branch that does not exist yet.
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/projects/my-org%2Fmissing",
          status: 404,
          body: { message: "404 Project Not Found" },
        },
        {
          method: "GET",
          urlPattern: "/projects/51/repository/branches/main",
          status: 404,
          body: { message: "404 Branch Not Found" },
        },
        {
          method: "GET",
          urlPattern: "/projects/my-org%2Fempty",
          status: 200,
          body: { id: 51, default_branch: "main" },
        },
      ])

      const client = createGitLabClient(http)
      for (const repositoryName of ["missing", "empty"]) {
        const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
          owner: "my-org",
          repositoryName,
        })
        assert.equal(result, null)
      }
    })

    it("reports a project or branch answered without its head as a known failure", async () => {
      // GitLab leaves out the default branch without read access to code.
      const cases: Array<{ routes: MockRoute[]; message: string }> = [
        {
          routes: [
            {
              method: "GET",
              urlPattern: "/projects/my-org%2Ftemplate",
              status: 200,
              body: { id: 50, name: "template" },
            },
          ],
          message:
            "GitLab answered project 'my-org/template' without its id or default branch.",
        },
        {
          routes: [
            {
              method: "GET",
              urlPattern: "/projects/50/repository/branches/main",
              status: 200,
              body: { name: "main" },
            },
            {
              method: "GET",
              urlPattern: "/projects/my-org%2Ftemplate",
              status: 200,
              body: { id: 50, default_branch: "main" },
            },
          ],
          message:
            "GitLab answered branch 'main' of 'my-org/template' without its commit.",
        },
      ]
      for (const { routes, message } of cases) {
        await assert.rejects(
          createGitLabClient(
            createMockHttpPort(routes),
          ).getRepositoryDefaultBranchHead(baseDraft, {
            owner: "my-org",
            repositoryName: "template",
          }),
          { message, type: "git-effect", disposition: "completed" },
        )
      }
    })
  })
})
