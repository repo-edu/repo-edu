import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("github branch-review", () => {
  describe("createBranch", () => {
    it("creates a branch and commits files", async () => {
      const capturedUrls: string[] = []
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          capturedUrls.push(`${request.method} ${request.url}`)
          if (request.method === "POST" && request.url.includes("/git/refs")) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ref: "refs/heads/template-update" }),
            }
          }
          if (request.method === "GET" && request.url.includes("/contents/")) {
            return {
              status: 404,
              statusText: "Not Found",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: "Not Found" }),
            }
          }
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content: {} }),
          }
        },
      }

      const client = createGitHubClient(http)
      await client.createBranch(baseDraft, {
        owner: "test-org",
        repositoryName: "repo-1",
        branchName: "template-update",
        baseSha: "abc123",
        commitMessage: "Template update",
        files: [
          {
            path: "README.md",
            previousPath: null,
            status: "modified",
            contentBase64: "dXBkYXRlZA==",
          },
        ],
      })

      assert.ok(
        capturedUrls.some((url) => url.includes("/git/refs")),
        "Should create a git ref",
      )
      assert.ok(
        capturedUrls.some((url) => url.includes("/contents/README.md")),
        "Should update file contents",
      )
    })
  })

  describe("createPullRequest", () => {
    it("creates a pull request and returns URL", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/repos/test-org/repo-1/pulls",
          status: 201,
          body: { html_url: "https://github.com/test-org/repo-1/pull/1" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createPullRequest(baseDraft, {
        owner: "test-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, true)
      assert.equal(result.url, "https://github.com/test-org/repo-1/pull/1")
    })

    it("returns existing PR when no changes error", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/repos/test-org/repo-1/pulls",
          status: 422,
          body: { message: "No commits between main and template-update" },
        },
        {
          method: "GET",
          urlPattern: "/repos/test-org/repo-1/pulls",
          status: 200,
          body: [{ html_url: "https://github.com/test-org/repo-1/pull/5" }],
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.createPullRequest(baseDraft, {
        owner: "test-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, false)
      assert.equal(result.url, "https://github.com/test-org/repo-1/pull/5")
    })
  })
})
