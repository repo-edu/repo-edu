import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

const swaggerUrl = "https://gitea.example.com/api/swagger"

describe("gitea template-changes", () => {
  describe("getRepositoryDefaultBranchHead", () => {
    it("returns HEAD sha and branch name", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: /\/api\/v1\/repos\/my-org\/template\/branches\/main/,
          status: 200,
          body: { commit: { id: "abc123" } },
        },
        {
          method: "GET",
          urlPattern: "/api/v1/repos/my-org/template",
          status: 200,
          body: { default_branch: "main" },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
      })

      assert.deepStrictEqual(result, { sha: "abc123", branchName: "main" })
    })

    it("answers a missing repository or default branch with null", async () => {
      // An empty repository names a default branch that does not exist yet.
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/repos/my-org/missing",
          status: 404,
          body: { message: "not found", url: swaggerUrl },
        },
        {
          method: "GET",
          urlPattern: /\/api\/v1\/repos\/my-org\/empty\/branches\/main/,
          status: 404,
          body: { message: "not found", url: swaggerUrl },
        },
        {
          method: "GET",
          urlPattern: "/api/v1/repos/my-org/empty",
          status: 200,
          body: { name: "empty", default_branch: "main", empty: true },
        },
      ])

      const client = createGiteaClient(http)
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
              urlPattern: "/api/v1/repos/my-org/template",
              status: 200,
              body: { name: "template" },
            },
          ],
          message:
            "Gitea answered repository 'my-org/template' without its default branch.",
        },
        {
          routes: [
            {
              method: "GET",
              urlPattern: /\/api\/v1\/repos\/my-org\/template\/branches\/main/,
              status: 200,
              body: { name: "main" },
            },
            {
              method: "GET",
              urlPattern: "/api/v1/repos/my-org/template",
              status: 200,
              body: { name: "template", default_branch: "main" },
            },
          ],
          message:
            "Gitea answered branch 'main' of 'my-org/template' without its commit.",
        },
      ]
      for (const { routes, message } of cases) {
        await assert.rejects(
          createGiteaClient(
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
