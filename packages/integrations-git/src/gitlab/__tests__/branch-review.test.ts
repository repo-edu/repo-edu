import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft } from "./harness.js"

describe("gitlab branch-review", () => {
  describe("createPullRequest", () => {
    it("creates a merge request and returns URL", async () => {
      const http: HttpPort = {
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.method === "GET" &&
            request.url.includes("/projects/my-org%2Frepo-1")
          ) {
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: 100 }),
            }
          }
          if (
            request.method === "POST" &&
            request.url.includes("/merge_requests")
          ) {
            return {
              status: 201,
              statusText: "Created",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                web_url:
                  "https://gitlab.example.com/my-org/repo-1/-/merge_requests/1",
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
      const result = await client.createPullRequest(baseDraft, {
        owner: "my-org",
        repositoryName: "repo-1",
        headBranch: "template-update",
        baseBranch: "main",
        title: "Template update",
        body: "Updated files",
      })

      assert.equal(result.created, true)
      assert.ok(result.url.includes("merge_requests/1"))
    })
  })
})
