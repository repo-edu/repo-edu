import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

describe("gitlab template-changes", () => {
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
