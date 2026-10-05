import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpRequest } from "@repo-edu/host-runtime-contract"
import type { CreateBranchRequest } from "@repo-edu/integrations-git-contract"
import { createGitHubClient } from "../github-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

const route = "/repos/test-org/repo-1"

const branchRequest: CreateBranchRequest = {
  owner: "test-org",
  repositoryName: "repo-1",
  branchName: "template-update",
  baseSha: "abc123",
  commitMessage: "Template update",
  files: [],
}

const refCreated: MockRoute = {
  method: "POST",
  urlPattern: `${route}/git/refs`,
  status: 201,
  body: {
    ref: "refs/heads/template-update",
    object: { sha: "abc123", type: "commit" },
  },
}

function fileOnBranch(path: string, sha: string): MockRoute {
  return {
    method: "GET",
    urlPattern: `${route}/contents/${path}?ref=template-update`,
    status: 200,
    body: { type: "file", name: path, path, sha, encoding: "base64" },
  }
}

function fileMissing(path: string): MockRoute {
  return {
    method: "GET",
    urlPattern: `${route}/contents/${path}?ref=template-update`,
    status: 404,
    body: { message: "Not Found", status: "404" },
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

const changedReadme = {
  path: "README.md",
  previousPath: null,
  status: "modified" as const,
  contentBase64: "dXBkYXRlZA==",
}

describe("github branch-review", () => {
  describe("createBranch", () => {
    it("branches from the base commit and writes each changed file", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          refCreated,
          fileOnBranch("README.md", "readme-blob"),
          fileMissing("new.md"),
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

      await createGitHubClient(http).createBranch(baseDraft, {
        ...branchRequest,
        files: [
          changedReadme,
          {
            path: "new.md",
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
        `POST ${route}/git/refs {"ref":"refs/heads/template-update","sha":"abc123"}`,
        `PUT ${route}/contents/README.md {"branch":"template-update","message":"Template update","content":"dXBkYXRlZA==","sha":"readme-blob"}`,
        `PUT ${route}/contents/new.md {"branch":"template-update","message":"Template update","content":"bmV3"}`,
        `DELETE ${route}/contents/old.txt {"branch":"template-update","message":"Template update","sha":"old-blob"}`,
      ])
    })

    it("reuses a branch that already exists", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          {
            method: "POST",
            urlPattern: `${route}/git/refs`,
            status: 422,
            body: {
              message: "Reference already exists",
              documentation_url:
                "https://docs.github.com/rest/git/refs#create-a-reference",
              status: "422",
            },
          },
        ],
        requests,
      )

      await createGitHubClient(http).createBranch(baseDraft, branchRequest)

      assert.equal(sent(requests).length, 1)
    })

    it("reports a branch the provider refuses as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: `${route}/git/refs`,
          status: 409,
          body: { message: "Git Repository is empty.", status: "409" },
        },
      ])

      await assert.rejects(
        createGitHubClient(http).createBranch(baseDraft, branchRequest),
        { type: "git-effect", disposition: "completed" },
      )
    })

    it("reports a refused file write as a known failure", async () => {
      // GitHub answers a write whose blob no longer matches with 409.
      const http = createMockHttpPort([
        refCreated,
        fileOnBranch("README.md", "readme-blob"),
        {
          method: "PUT",
          urlPattern: `${route}/contents/README.md`,
          status: 409,
          body: {
            message: "README.md does not match readme-blob",
            status: "409",
          },
        },
      ])

      await assert.rejects(
        createGitHubClient(http).createBranch(baseDraft, {
          ...branchRequest,
          files: [changedReadme],
        }),
        { type: "git-effect", disposition: "completed" },
      )
    })

    it("refuses to write over a path that is not a plain file", async () => {
      const entries: unknown[] = [
        [{ type: "file", name: "a.md", path: "README.md/a.md", sha: "x" }],
        { type: "submodule", name: "README.md", path: "README.md", sha: "y" },
      ]
      for (const entry of entries) {
        const http = createMockHttpPort([
          refCreated,
          {
            method: "GET",
            urlPattern: `${route}/contents/README.md`,
            status: 200,
            body: entry,
          },
        ])
        await assert.rejects(
          createGitHubClient(http).createBranch(baseDraft, {
            ...branchRequest,
            files: [changedReadme],
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
        refCreated,
        {
          method: "GET",
          urlPattern: `${route}/contents/README.md`,
          status: 200,
          body: { type: "file", name: "README.md", path: "README.md" },
        },
      ])

      await assert.rejects(
        createGitHubClient(http).createBranch(baseDraft, {
          ...branchRequest,
          files: [changedReadme],
        }),
        {
          message:
            "GitHub answered file 'README.md' on branch 'template-update' without its blob.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("refuses a changed file without content", async () => {
      await assert.rejects(
        createGitHubClient(createMockHttpPort([refCreated])).createBranch(
          baseDraft,
          {
            ...branchRequest,
            files: [{ ...changedReadme, contentBase64: null }],
          },
        ),
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
      owner: "test-org",
      repositoryName: "repo-1",
      headBranch: "template-update",
      baseBranch: "main",
      title: "Template update",
      body: "Updated files",
    }

    function refusedPullRequest(message: string): MockRoute {
      return {
        method: "POST",
        urlPattern: `${route}/pulls`,
        status: 422,
        body: {
          message: "Validation Failed",
          errors: [{ resource: "PullRequest", code: "custom", message }],
          documentation_url:
            "https://docs.github.com/rest/pulls/pulls#create-a-pull-request",
          status: "422",
        },
      }
    }

    it("creates a pull request and returns URL", async () => {
      const http = createMockHttpPort([
        {
          method: "POST",
          urlPattern: `${route}/pulls`,
          status: 201,
          body: {
            number: 1,
            html_url: "https://github.com/test-org/repo-1/pull/1",
          },
        },
      ])

      const result = await createGitHubClient(http).createPullRequest(
        baseDraft,
        pullRequest,
      )

      assert.deepStrictEqual(result, {
        created: true,
        url: "https://github.com/test-org/repo-1/pull/1",
      })
    })

    it("answers an open pull request or no commits as not created", async () => {
      for (const message of [
        "A pull request already exists for test-org:template-update.",
        "No commits between main and template-update",
      ]) {
        const requests: HttpRequest[] = []
        const http = createMockHttpPort([refusedPullRequest(message)], requests)

        const result = await createGitHubClient(http).createPullRequest(
          baseDraft,
          pullRequest,
        )

        assert.deepStrictEqual(result, { created: false })
        assert.equal(requests.length, 1)
      }
    })

    it("reports a pull request refused for another reason as a known failure", async () => {
      const http = createMockHttpPort([
        refusedPullRequest("Head sha can't be blank"),
      ])

      await assert.rejects(
        createGitHubClient(http).createPullRequest(baseDraft, pullRequest),
        { type: "git-effect", disposition: "completed" },
      )
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
        createGitHubClient(http).createPullRequest(baseDraft, pullRequest),
        {
          message:
            "GitHub opened a pull request in 'test-org/repo-1' but answered without its URL.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })
  })
})
