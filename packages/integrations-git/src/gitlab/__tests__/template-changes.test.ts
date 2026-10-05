import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
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

  describe("getTemplateDiff", () => {
    it("returns changed files between two commits", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/repository/compare")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                diffs: [
                  {
                    new_path: "README.md",
                    old_path: "README.md",
                    new_file: false,
                    deleted_file: false,
                    renamed_file: false,
                  },
                ],
              }),
            }
          }
          if (request.url.includes("/repository/files/")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                content: "dXBkYXRlZA==",
                encoding: "base64",
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
      const result = await client.getTemplateDiff(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
        fromSha: "sha1",
        toSha: "sha2",
      })

      assert.ok(result)
      assert.equal(result.files.length, 1)
      assert.equal(result.files[0]?.path, "README.md")
      assert.equal(result.files[0]?.status, "modified")
      assert.equal(result.files[0]?.contentBase64, "dXBkYXRlZA==")
    })
  })
})
