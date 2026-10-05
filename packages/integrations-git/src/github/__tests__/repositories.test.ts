import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

describe("github repositories", () => {
  describe("createRepositories", () => {
    it("creates repositories without template", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 201,
          body: {
            html_url: "https://github.com/test-org/repo-1",
            clone_url: "https://github.com/test-org/repo-1.git",
          },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.equal(result.created.length, 1)
      assert.deepStrictEqual(result.created[0], {
        repositoryName: "repo-1",
        repositoryUrl: "https://github.com/test-org/repo-1",
        cloneUrl: "https://x-access-token:token@github.com/test-org/repo-1.git",
      })
      assert.deepStrictEqual(result.alreadyExisted, [])
      assert.deepStrictEqual(result.failed, [])
    })

    it("creates repositories with non-public visibility", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 201,
          body: {
            html_url: "https://github.com/test-org/hw1-team-alpha",
            clone_url: "https://github.com/test-org/hw1-team-alpha.git",
          },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["hw1-team-alpha"],
        visibility: "private",
        autoInit: false,
      })

      assert.equal(result.created.length, 1)
      assert.ok(result.created[0]?.repositoryUrl.includes("hw1-team-alpha"))
    })

    it("propagates a lost response after an earlier repository was created", async () => {
      let callCount = 0
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          callCount++
          if (callCount === 1) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                html_url: "https://github.com/test-org/repo-1",
                clone_url: "https://github.com/test-org/repo-1.git",
              }),
            }
          }
          throw new Error("Network error")
        },
      }

      const client = createGitHubClient(http)
      await assert.rejects(
        client.createRepositories(baseDraft, {
          organization: "test-org",
          repositoryNames: ["repo-1", "repo-2"],
          visibility: "private",
          autoInit: true,
        }),
        /Network error/,
      )
      assert.equal(callCount, 2)
    })
  })

  describe("createRepositories alreadyExisted", () => {
    it("classifies HTTP 422 already-exists as alreadyExisted", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 422,
          body: {
            message: "Repository creation failed.",
            errors: [
              {
                resource: "Repository",
                code: "custom",
                field: "name",
                message: "name already exists on this account",
              },
            ],
            documentation_url:
              "https://docs.github.com/rest/repos/repos#create-an-organization-repository",
            status: "422",
          },
        },
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1",
          status: 200,
          body: {
            html_url: "https://github.com/test-org/repo-1",
            clone_url: "https://github.com/test-org/repo-1.git",
          },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1"],
        visibility: "private",
        autoInit: true,
      })

      assert.deepStrictEqual(result.created, [])
      assert.deepStrictEqual(result.alreadyExisted, [
        {
          repositoryName: "repo-1",
          repositoryUrl: "https://github.com/test-org/repo-1",
          cloneUrl:
            "https://x-access-token:token@github.com/test-org/repo-1.git",
        },
      ])
      assert.deepStrictEqual(result.failed, [])
    })
  })

  describe("createRepositories failures", () => {
    const request = {
      organization: "test-org",
      repositoryNames: ["repo-1"],
      visibility: "private" as const,
      autoInit: true,
    }
    const createAnswersExisting: MockRoute = {
      method: "POST",
      urlPattern: "/orgs/test-org/repos",
      status: 422,
      body: {
        message: "Repository creation failed.",
        errors: [
          {
            resource: "Repository",
            code: "custom",
            field: "name",
            message: "name already exists on this account",
          },
        ],
        status: "422",
      },
    }

    it("records a refused create as that repository's failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 422,
          body: {
            message: "Repository creation failed.",
            errors: [
              {
                resource: "Repository",
                code: "custom",
                field: "name",
                message: "name is too long (maximum is 100 characters)",
              },
            ],
            documentation_url:
              "https://docs.github.com/rest/repos/repos#create-an-organization-repository",
            status: "422",
          },
        },
      ])

      const result = await createGitHubClient(http).createRepositories(
        baseDraft,
        request,
      )

      assert.deepStrictEqual(result.created, [])
      assert.deepStrictEqual(result.alreadyExisted, [])
      assert.equal(result.failed.length, 1)
      assert.match(
        result.failed[0]?.reason ?? "",
        /^POST \/orgs\/test-org\/repos answered 422: Repository creation failed\./,
      )
    })

    it("records a repository answered without its URLs as that repository's failure", async () => {
      const created = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 201,
          body: { id: 1, name: "repo-1" },
        },
      ])
      assert.deepStrictEqual(
        (
          await createGitHubClient(created).createRepositories(
            baseDraft,
            request,
          )
        ).failed,
        [
          {
            repositoryName: "repo-1",
            reason:
              "GitHub created the repository but answered without its web or clone URL.",
          },
        ],
      )

      const existing = createMockHttpPort([
        createAnswersExisting,
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1",
          status: 200,
          body: { id: 1, name: "repo-1" },
        },
      ])
      assert.deepStrictEqual(
        (
          await createGitHubClient(existing).createRepositories(
            baseDraft,
            request,
          )
        ).failed,
        [
          {
            repositoryName: "repo-1",
            reason:
              "Repository exists but GitHub answered without its web or clone URL.",
          },
        ],
      )
    })

    it("records a refused lookup of an existing repository as that repository's failure", async () => {
      const http = createMockHttpPort([
        createAnswersExisting,
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1",
          status: 403,
          body: {
            message: "Resource not accessible by integration",
            documentation_url:
              "https://docs.github.com/rest/repos/repos#get-a-repository",
            status: "403",
          },
        },
      ])

      const result = await createGitHubClient(http).createRepositories(
        baseDraft,
        request,
      )

      assert.deepStrictEqual(result.alreadyExisted, [])
      assert.equal(result.failed.length, 1)
      assert.match(
        result.failed[0]?.reason ?? "",
        /^Repository exists but lookup failed: GET \/repos\/test-org\/repo-1 answered 403/,
      )
    })
  })

  describe("resolveRepositoryCloneUrls", () => {
    it("returns clone URLs for existing repositories and missing names", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1",
          status: 200,
          body: { clone_url: "https://github.com/test-org/repo-1.git" },
        },
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.resolveRepositoryCloneUrls(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1", "repo-missing"],
      })

      assert.deepStrictEqual(result.missing, ["repo-missing"])
      assert.equal(result.resolved.length, 1)
      assert.equal(result.resolved[0]?.repositoryName, "repo-1")
      assert.ok(result.resolved[0]?.cloneUrl.includes("x-access-token:token@"))
    })
  })
})
