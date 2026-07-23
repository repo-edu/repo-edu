import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpPort, HttpResponse } from "@repo-edu/host-runtime-contract"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

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
        cloneUrl:
          "https://x-access-token:ghp_test_token@github.com/test-org/repo-1.git",
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

    it("handles partial failure gracefully", async () => {
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
      const result = await client.createRepositories(baseDraft, {
        organization: "test-org",
        repositoryNames: ["repo-1", "repo-2"],
        visibility: "private",
        autoInit: true,
      })

      assert.equal(result.created.length, 1)
      assert.equal(result.failed.length, 1)
    })
  })

  describe("createRepositories alreadyExisted", () => {
    it("classifies HTTP 422 already-exists as alreadyExisted", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/orgs/test-org/repos",
          status: 422,
          body: { message: "Repository name already exists on this owner" },
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
      assert.equal(result.alreadyExisted.length, 1)
      assert.equal(result.alreadyExisted[0]?.repositoryName, "repo-1")
      assert.equal(
        result.alreadyExisted[0]?.repositoryUrl,
        "https://github.com/test-org/repo-1",
      )
      assert.deepStrictEqual(result.failed, [])
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
      assert.ok(
        result.resolved[0]?.cloneUrl.includes("x-access-token:ghp_test_token"),
      )
    })
  })
})
