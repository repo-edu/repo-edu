import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

describe("gitea branch-review", () => {
  describe("createPullRequest", () => {
    it("creates a pull request and returns URL", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: "/api/v1/repos/my-org/repo-1/pulls",
          status: 201,
          body: {
            html_url: "https://gitea.example.com/my-org/repo-1/pulls/1",
          },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.createPullRequest(baseDraft, {
        owner: "my-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, true)
      assert.ok(result.url.includes("pulls/1"))
    })
  })
})
