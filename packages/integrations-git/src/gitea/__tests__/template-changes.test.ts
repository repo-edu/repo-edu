import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort } from "./harness.js"

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

    it("returns null for missing repository", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/api/v1/repos/my-org/missing",
          status: 404,
          body: { message: "Not Found" },
        },
      ])

      const client = createGiteaClient(http)
      const result = await client.getRepositoryDefaultBranchHead(baseDraft, {
        owner: "my-org",
        repositoryName: "missing",
      })

      assert.equal(result, null)
    })
  })

  describe("getTemplateDiff", () => {
    it("returns changed files between two commits", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (request.url.includes("/compare/")) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                files: [{ filename: "README.md", status: "modified" }],
              }),
            }
          }
          if (request.url.includes("/contents/README.md")) {
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

      const client = createGiteaClient(http)
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
