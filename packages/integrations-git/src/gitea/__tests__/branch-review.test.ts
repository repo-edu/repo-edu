import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpRequest } from "@repo-edu/host-runtime-contract"
import type { CreateBranchRequest } from "@repo-edu/integrations-git-contract"
import { createGiteaClient } from "../gitea-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

const swaggerUrl = "https://gitea.example.com/api/swagger"
const route = "/api/v1/repos/my-org/repo-1"

const branchRequest: CreateBranchRequest = {
  owner: "my-org",
  repositoryName: "repo-1",
  branchName: "template-update",
  baseSha: "abc123",
  commitMessage: "Template update",
  files: [],
}

const branchCreated: MockRoute = {
  method: "POST",
  urlPattern: `${route}/branches`,
  status: 201,
  body: { name: "template-update", commit: { id: "abc123" } },
}

function fileOnBranch(path: string, sha: string): MockRoute {
  return {
    method: "GET",
    urlPattern: `${route}/contents/${encodeURIComponent(path)}?ref=template-update`,
    status: 200,
    body: {
      name: path,
      path,
      sha,
      type: "file",
      content: "",
      encoding: "base64",
    },
  }
}

function fileMissing(path: string): MockRoute {
  return {
    method: "GET",
    urlPattern: `${route}/contents/${encodeURIComponent(path)}?ref=template-update`,
    status: 404,
    body: {
      message: `object does not exist [id: , rel_path: ${path}]`,
      url: swaggerUrl,
    },
  }
}

function sent(requests: HttpRequest[]): string[] {
  return requests
    .filter((request) => request.method !== "GET")
    .map(
      (request) =>
        `${request.method} ${new URL(request.url).pathname} ${request.body ?? ""}`,
    )
}

describe("gitea branch-review", () => {
  describe("createBranch", () => {
    it("branches from the base commit and writes each changed file", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          branchCreated,
          fileOnBranch("README.md", "readme-blob"),
          fileMissing("docs/new.md"),
          fileOnBranch("old.txt", "old-blob"),
          {
            method: "PUT",
            urlPattern: `${route}/contents/`,
            status: 200,
            body: {},
          },
          {
            method: "DELETE",
            urlPattern: `${route}/contents/`,
            status: 200,
            body: {},
          },
        ],
        requests,
      )

      await createGiteaClient(http).createBranch(baseDraft, {
        ...branchRequest,
        files: [
          {
            path: "README.md",
            previousPath: null,
            status: "modified",
            contentBase64: "dXBkYXRlZA==",
          },
          {
            path: "docs/new.md",
            previousPath: null,
            status: "added",
            contentBase64: "bmV3",
          },
          {
            path: "old.txt",
            previousPath: null,
            status: "removed",
            contentBase64: null,
          },
        ],
      })

      assert.deepStrictEqual(sent(requests), [
        `POST ${route}/branches {"new_branch_name":"template-update","old_ref_name":"abc123"}`,
        `PUT ${route}/contents/README.md {"branch":"template-update","message":"Template update","content":"dXBkYXRlZA==","sha":"readme-blob"}`,
        `PUT ${route}/contents/docs%2Fnew.md {"branch":"template-update","message":"Template update","content":"bmV3"}`,
        `DELETE ${route}/contents/old.txt {"branch":"template-update","message":"Template update","sha":"old-blob"}`,
      ])
    })

    it("reuses a branch that already exists and skips a removed file already gone", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          {
            method: "POST",
            urlPattern: `${route}/branches`,
            status: 409,
            body: { message: "The branch already exists.", url: swaggerUrl },
          },
          fileMissing("old.txt"),
        ],
        requests,
      )

      await createGiteaClient(http).createBranch(baseDraft, {
        ...branchRequest,
        files: [
          {
            path: "old.txt",
            previousPath: null,
            status: "removed",
            contentBase64: null,
          },
        ],
      })

      assert.equal(sent(requests).length, 1)
    })

    it("reports a branch name refused for another reason as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: `${route}/branches`,
          status: 409,
          body: {
            message: "The branch with the same tag already exists.",
            url: swaggerUrl,
          },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).createBranch(baseDraft, branchRequest),
        {
          message: `POST ${route}/branches answered 409: The branch with the same tag already exists.`,
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("treats a file deleted before its delete arrives as gone", async () => {
      const http = createMockHttpPort([
        branchCreated,
        fileOnBranch("old.txt", "old-blob"),
        {
          method: "DELETE",
          urlPattern: `${route}/contents/old.txt`,
          status: 404,
          body: {
            message: "repository file does not exist [path: old.txt]",
            url: swaggerUrl,
          },
        },
      ])

      await createGiteaClient(http).createBranch(baseDraft, {
        ...branchRequest,
        files: [
          {
            path: "old.txt",
            previousPath: null,
            status: "removed",
            contentBase64: null,
          },
        ],
      })
    })

    it("refuses to write over a path that is not a plain file", async () => {
      const entries: unknown[] = [
        [{ name: "README.md", path: "docs/README.md", type: "file", sha: "x" }],
        { name: "README.md", path: "README.md", type: "symlink", sha: "link" },
      ]
      for (const entry of entries) {
        const http = createMockHttpPort([
          branchCreated,
          {
            method: "GET",
            urlPattern: `${route}/contents/README.md`,
            status: 200,
            body: entry,
          },
        ])
        await assert.rejects(
          createGiteaClient(http).createBranch(baseDraft, {
            ...branchRequest,
            files: [
              {
                path: "README.md",
                previousPath: null,
                status: "modified",
                contentBase64: "dXBkYXRlZA==",
              },
            ],
          }),
          {
            message:
              "'README.md' on branch 'template-update' is not a plain file, so the update cannot write it.",
            type: "git-effect",
            disposition: "completed",
          },
        )
      }
    })

    it("reports a file answered without its blob as a known failure", async () => {
      const http = createMockHttpPort([
        branchCreated,
        {
          method: "GET",
          urlPattern: `${route}/contents/README.md`,
          status: 200,
          body: { name: "README.md", path: "README.md", type: "file" },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).createBranch(baseDraft, {
          ...branchRequest,
          files: [
            {
              path: "README.md",
              previousPath: null,
              status: "modified",
              contentBase64: "dXBkYXRlZA==",
            },
          ],
        }),
        {
          message:
            "Gitea answered file 'README.md' on branch 'template-update' without its blob.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("refuses a changed file without content", async () => {
      const http = createMockHttpPort([branchCreated])

      await assert.rejects(
        createGiteaClient(http).createBranch(baseDraft, {
          ...branchRequest,
          files: [
            {
              path: "README.md",
              previousPath: null,
              status: "modified",
              contentBase64: null,
            },
          ],
        }),
        {
          message: "Changed file 'README.md' has no content to write.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })
  })

  describe("createPullRequest", () => {
    const pullRequest = {
      owner: "my-org",
      repositoryName: "repo-1",
      headBranch: "template-update",
      baseBranch: "main",
      title: "Template update",
      body: "Updated files",
    }

    it("creates a pull request and returns URL", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: `${route}/pulls`,
          status: 201,
          body: {
            number: 1,
            html_url: "https://gitea.example.com/my-org/repo-1/pulls/1",
          },
        },
      ])

      const result = await createGiteaClient(http).createPullRequest(
        baseDraft,
        pullRequest,
      )

      assert.deepStrictEqual(result, {
        created: true,
        url: "https://gitea.example.com/my-org/repo-1/pulls/1",
      })
    })

    it("answers an open pull request for the same branches as not created", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          {
            method: "POST",
            urlPattern: `${route}/pulls`,
            status: 409,
            body: {
              message:
                "pull request already exists for these targets [id: 4, issue_id: 7, head_repo_id: 2, base_repo_id: 2, head_branch: template-update, base_branch: main]",
              url: swaggerUrl,
            },
          },
        ],
        requests,
      )

      const result = await createGiteaClient(http).createPullRequest(
        baseDraft,
        pullRequest,
      )

      assert.deepStrictEqual(result, { created: false })
      assert.equal(requests.length, 1)
    })

    it("reports a pull request opened without its URL as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: `${route}/pulls`,
          status: 201,
          body: { number: 1 },
        },
      ])

      await assert.rejects(
        createGiteaClient(http).createPullRequest(baseDraft, pullRequest),
        {
          message:
            "Gitea opened a pull request in 'my-org/repo-1' but answered without its URL.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })
  })
})
