import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

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

    it("returns null for missing repository", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/my-org/missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "missing",
      })

      assert.equal(result, null)
    })
  })

  describe("getTemplateDiff", () => {
    it("returns changed files between two commits", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/my-org/template/compare/sha1...sha2",
          status: 200,
          body: {
            files: [
              { filename: "README.md", status: "modified" },
              { filename: "old.txt", status: "removed" },
            ],
          },
        },
        {
          method: "GET",
          urlPattern: "/repos/my-org/template/contents/README.md",
          status: 200,
          body: { content: "dXBkYXRlZA==", encoding: "base64", type: "file" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getTemplateDiff(baseDraft, {
        owner: "my-org",
        repositoryName: "template",
        fromSha: "sha1",
        toSha: "sha2",
      })

      assert.ok(result)
      assert.equal(result.files.length, 2)
      assert.equal(result.files[0]?.path, "README.md")
      assert.equal(result.files[0]?.status, "modified")
      assert.equal(result.files[0]?.contentBase64, "dXBkYXRlZA==")
      assert.equal(result.files[1]?.path, "old.txt")
      assert.equal(result.files[1]?.status, "removed")
      assert.equal(result.files[1]?.contentBase64, null)
    })

    it("returns null for missing repository", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/repos/my-org/missing/compare",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGitHubClient(http)
      const result = await client.getTemplateDiff(baseDraft, {
        owner: "my-org",
        repositoryName: "missing",
        fromSha: "sha1",
        toSha: "sha2",
      })

      assert.equal(result, null)
    })
  })
})
