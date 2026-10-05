import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { HttpRequest } from "@repo-edu/host-runtime-contract"
import type { CreateBranchRequest } from "@repo-edu/integrations-git-contract"
import { createGitLabClient } from "../gitlab-client.js"
import { baseDraft, createMockHttpPort, type MockRoute } from "./harness.js"

const project: MockRoute = {
  method: "GET",
  urlPattern: "/projects/my-org%2Frepo-1",
  status: 200,
  body: { id: 100, path_with_namespace: "my-org/repo-1" },
}

const branchCreated: MockRoute = {
  method: "POST",
  urlPattern: "/projects/100/repository/branches",
  status: 201,
  body: { name: "template-update", commit: { id: "abc123" } },
}

function fileOnBranch(path: string): MockRoute {
  return {
    method: "GET",
    urlPattern: `/projects/100/repository/files/${encodeURIComponent(path)}?ref=template-update`,
    status: 200,
    body: { file_name: path, file_path: path, blob_id: "blob" },
  }
}

function fileMissing(path: string): MockRoute {
  return {
    method: "GET",
    urlPattern: `/projects/100/repository/files/${encodeURIComponent(path)}?ref=template-update`,
    status: 404,
    body: { message: "404 File Not Found" },
  }
}

const branchRequest: CreateBranchRequest = {
  owner: "my-org",
  repositoryName: "repo-1",
  branchName: "template-update",
  baseSha: "abc123",
  commitMessage: "Template update",
  files: [
    {
      path: "README.md",
      previousPath: null,
      status: "modified",
      contentBase64: "dXBkYXRlZA==",
    },
    {
      path: "docs/new.md",
      previousPath: "new.md",
      status: "renamed",
      contentBase64: "bmV3",
    },
    {
      path: "old.txt",
      previousPath: null,
      status: "removed",
      contentBase64: null,
    },
    {
      path: "gone.txt",
      previousPath: null,
      status: "removed",
      contentBase64: null,
    },
  ],
}

function sent(requests: HttpRequest[]): string[] {
  return requests
    .filter((request) => request.method !== "GET")
    .map(
      (request) =>
        `${request.method} ${new URL(request.url).pathname} ${request.body ?? ""}`,
    )
}

describe("gitlab branch-review", () => {
  describe("createBranch", () => {
    it("branches from the base commit and commits every change at once", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          project,
          branchCreated,
          fileOnBranch("README.md"),
          fileMissing("docs/new.md"),
          fileOnBranch("new.md"),
          fileOnBranch("old.txt"),
          fileMissing("gone.txt"),
          {
            method: "POST",
            urlPattern: "/projects/100/repository/commits",
            status: 201,
            body: { id: "def456" },
          },
        ],
        requests,
      )

      await createGitLabClient(http).createBranch(baseDraft, branchRequest)

      assert.deepStrictEqual(
        sent(requests),
        [
          '/projects/100/repository/branches {"branch":"template-update","ref":"abc123"}',
          `/projects/100/repository/commits ${JSON.stringify({
            branch: "template-update",
            commit_message: "Template update",
            actions: [
              {
                action: "update",
                file_path: "README.md",
                content: "dXBkYXRlZA==",
                encoding: "base64",
              },
              {
                action: "create",
                file_path: "docs/new.md",
                content: "bmV3",
                encoding: "base64",
              },
              { action: "delete", file_path: "new.md" },
              { action: "delete", file_path: "old.txt" },
            ],
          })}`,
        ].map((line) => `POST /api/v4${line}`),
      )
    })

    it("reuses a branch that already exists", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          project,
          {
            method: "POST",
            urlPattern: "/projects/100/repository/branches",
            status: 400,
            body: { message: "Branch already exists" },
          },
        ],
        requests,
      )

      await createGitLabClient(http).createBranch(baseDraft, {
        ...branchRequest,
        files: [],
      })

      assert.equal(sent(requests).length, 1)
    })

    it("reports a refused branch or commit as a known failure", async () => {
      const cases: MockRoute[][] = [
        [
          project,
          {
            method: "POST",
            urlPattern: "/projects/100/repository/branches",
            status: 400,
            body: { message: "Branch name is invalid" },
          },
        ],
        [
          project,
          branchCreated,
          fileOnBranch("README.md"),
          {
            method: "POST",
            urlPattern: "/projects/100/repository/commits",
            status: 400,
            body: { message: "A file with this name doesn't exist" },
          },
        ],
      ]
      for (const routes of cases) {
        await assert.rejects(
          createGitLabClient(createMockHttpPort(routes)).createBranch(
            baseDraft,
            { ...branchRequest, files: branchRequest.files.slice(0, 1) },
          ),
          { type: "git-effect", disposition: "completed" },
        )
      }
    })

    it("reports a missing project as a known failure", async () => {
      const http = createMockHttpPort([
        {
          method: "GET",
          urlPattern: "/projects/my-org%2Frepo-1",
          status: 404,
          body: { message: "404 Project Not Found" },
        },
      ])

      await assert.rejects(
        createGitLabClient(http).createBranch(baseDraft, branchRequest),
        {
          message: "GitLab project 'my-org/repo-1' was not found.",
          type: "git-effect",
          disposition: "completed",
        },
      )
    })

    it("refuses a changed file without content", async () => {
      await assert.rejects(
        createGitLabClient(
          createMockHttpPort([project, branchCreated]),
        ).createBranch(baseDraft, {
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

    function mergeRequestReply(status: number, body: unknown): MockRoute {
      return {
        method: "POST",
        urlPattern: "/projects/100/merge_requests",
        status,
        body,
      }
    }

    it("creates a merge request and returns URL", async () => {
      const http = createMockHttpPort([
        project,
        mergeRequestReply(201, {
          iid: 1,
          web_url:
            "https://gitlab.example.com/my-org/repo-1/-/merge_requests/1",
        }),
      ])

      const result = await createGitLabClient(http).createPullRequest(
        baseDraft,
        pullRequest,
      )

      assert.deepStrictEqual(result, {
        created: true,
        url: "https://gitlab.example.com/my-org/repo-1/-/merge_requests/1",
      })
    })

    it("answers an open merge request for the same source branch as not created", async () => {
      const requests: HttpRequest[] = []
      const http = createMockHttpPort(
        [
          project,
          mergeRequestReply(409, {
            message: [
              "Another open merge request already exists for this source branch: !1",
            ],
          }),
        ],
        requests,
      )

      const result = await createGitLabClient(http).createPullRequest(
        baseDraft,
        pullRequest,
      )

      assert.deepStrictEqual(result, { created: false })
      assert.equal(sent(requests).length, 1)
    })

    it("reports a refused or incompletely answered merge request as a known failure", async () => {
      const cases: Array<[number, unknown]> = [
        [
          422,
          {
            message: [
              "You can't use same project/branch for source and target",
            ],
          },
        ],
        [201, { iid: 1 }],
      ]
      for (const [status, body] of cases) {
        await assert.rejects(
          createGitLabClient(
            createMockHttpPort([project, mergeRequestReply(status, body)]),
          ).createPullRequest(baseDraft, pullRequest),
          { type: "git-effect", disposition: "completed" },
        )
      }
    })
  })
})
