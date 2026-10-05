import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

const notFound = {
  message: "Not Found",
  documentation_url: "https://docs.github.com/rest",
  status: "404",
}

describe("github template-changes", () => {
  describe("getRepositoryDefaultBranchHead", () => {
    it("returns HEAD sha and branch name", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/repos\/my-org\/template-repo\/branches\/main/,
          status: 200,
          body: { commit: { sha: "abc123" } },
        },
        {
          method: "GET",
          urlPattern: "/repos/my-org/template-repo",
          status: 200,
          body: { default_branch: "main" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "template-repo",
      })

      assert.deepStrictEqual(result, { sha: "abc123", branchName: "main" })
    })

    it("answers a missing repository or default branch with null", async () => {
      // An empty repository names a default branch that does not exist yet.
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/my-org/missing",
          status: 404,
          body: notFound,
        },
        {
          method: "GET",
          urlPattern: /\/repos\/my-org\/empty\/branches\/main/,
          status: 404,
          body: { message: "Branch not found", status: "404" },
        },
        {
          method: "GET",
          urlPattern: "/repos/my-org/empty",
          status: 200,
          body: { name: "empty", default_branch: "main" },
        },
      ])

      const client = createGitHubClient(http)
      for (const repositoryName of ["missing", "empty"]) {
        const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
          owner: "my-org",
          repositoryName,
        })
        assert.equal(result, null)
      }
    })

    it("reports a repository or branch answered without its head as a known failure", async () => {
      const cases: Array<{ routes: MockRoute[]; message: string }> = [
        {
          routes: [
            {
              method: "GET",
              urlPattern: "/repos/my-org/template-repo",
              status: 200,
              body: { name: "template-repo" },
            },
          ],
          message:
            "GitHub answered repository 'my-org/template-repo' without its default branch.",
        },
        {
          routes: [
            {
              method: "GET",
              urlPattern: /\/repos\/my-org\/template-repo\/branches\/main/,
              status: 200,
              body: { name: "main" },
            },
            {
              method: "GET",
              urlPattern: "/repos/my-org/template-repo",
              status: 200,
              body: { name: "template-repo", default_branch: "main" },
            },
          ],
          message:
            "GitHub answered branch 'main' of 'my-org/template-repo' without its commit.",
        },
      ]
      for (const { routes, message } of cases) {
        await assert.rejects(
          createGitHubClient(
            createMockHttpPort(routes),
          ).getRepositoryDefaultBranchHead(baseDraft, {
            owner: "my-org",
            repositoryName: "template-repo",
          }),
          { message, type: "git-effect", disposition: "completed" },
        )
      }
    })
  })
})
