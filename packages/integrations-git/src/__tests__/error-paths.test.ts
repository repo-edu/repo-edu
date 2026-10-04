import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type {
  GitConnectionDraft,
  GitProviderClient,
} from "@repo-edu/integrations-git-contract"
import { createGiteaClient } from "../gitea/index.js"
import { createGitHubClient } from "../github/index.js"
import { createGitLabClient } from "../gitlab/index.js"

const githubDraft: GitConnectionDraft = {
  provider: "github",
  baseUrl: "https://api.github.com",
  token: "gh-token",
}

const gitlabDraft: GitConnectionDraft = {
  provider: "gitlab",
  baseUrl: "https://gitlab.example.com",
  token: "gl-token",
}

const giteaDraft: GitConnectionDraft = {
  provider: "gitea",
  baseUrl: "https://gitea.example.com",
  token: "gt-token",
}

function createStatusHttpPort(status: number, body = "{}"): HttpPort {
  return {
    async fetch(): Promise<HttpResponse> {
      return {
        status,
        statusText: status < 300 ? "OK" : "Error",
        headers: { "content-type": "application/json" },
        body,
      }
    },
  }
}

function createNetworkErrorHttpPort(message = "Connection refused"): HttpPort {
  return {
    async fetch(): Promise<HttpResponse> {
      throw new Error(message)
    },
  }
}

function createAbortedHttpPort(): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      if (request.signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError")
      }
      return {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: "user", id: 1, is_admin: false }),
      }
    },
  }
}

/** Like a real transport, a request that carries a signal ends with an abort
 * when the signal fires before its response. A null response never arrives. */
function createSignalObeyingHttpPort(
  respond: (request: HttpRequest) => HttpResponse | null,
): HttpPort {
  return {
    fetch(request: HttpRequest): Promise<HttpResponse> {
      return new Promise((resolve, reject) => {
        request.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            ),
          { once: true },
        )
        const response = respond(request)
        if (response !== null) resolve(response)
      })
    },
  }
}

/** One body every provider reads as a created repository or its group. */
const createdRepositoryResponse: HttpResponse = {
  status: 201,
  statusText: "Created",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id: 7,
    html_url: "https://example.test/course-org/repo-1",
    clone_url: "https://example.test/course-org/repo-1.git",
    web_url: "https://example.test/course-org/repo-1",
    http_url_to_repo: "https://example.test/course-org/repo-1.git",
  }),
}

const providerClients: Array<
  (http: HttpPort) => [GitProviderClient, GitConnectionDraft]
> = [
  (http) => [createGitHubClient(http), githubDraft],
  (http) => [createGitLabClient(http), gitlabDraft],
  (http) => [createGiteaClient(http), giteaDraft],
]

describe("Gitea error paths", () => {
  describe("verifyConnection", () => {
    it("returns verified: false on 401", async () => {
      const client = createGiteaClient(createStatusHttpPort(401))
      const result = await client.verifyConnection(giteaDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 403", async () => {
      const client = createGiteaClient(createStatusHttpPort(403))
      const result = await client.verifyConnection(giteaDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 429", async () => {
      const client = createGiteaClient(createStatusHttpPort(429))
      const result = await client.verifyConnection(giteaDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on network error", async () => {
      const client = createGiteaClient(createNetworkErrorHttpPort())
      const result = await client.verifyConnection(giteaDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false for empty baseUrl", async () => {
      const client = createGiteaClient(createStatusHttpPort(200))
      const result = await client.verifyConnection({
        ...giteaDraft,
        baseUrl: "",
      })
      assert.deepEqual(result, { verified: false })
    })
  })

  describe("verifyGitUsernames", () => {
    it("returns exists: false for all usernames on network error", async () => {
      const client = createGiteaClient(createNetworkErrorHttpPort())
      const results = await client.verifyGitUsernames(giteaDraft, [
        "alice",
        "bob",
      ])
      assert.equal(results.length, 2)
      assert.equal(results[0].exists, false)
      assert.equal(results[1].exists, false)
    })

    it("reports a proven stop before username lookup", async () => {
      let fetchCount = 0
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          fetchCount++
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              login: "alice",
              id: 1,
              is_admin: false,
            }),
          }
        },
      }

      const controller = new AbortController()
      controller.abort()

      const client = createGiteaClient(http)
      await assert.rejects(
        client.verifyGitUsernames(
          giteaDraft,
          ["alice", "bob", "carol"],
          controller.signal,
        ),
        { type: "git-effect", disposition: "stopped" },
      )

      assert.equal(fetchCount, 0)
    })

    it("returns exists: false for all usernames on empty baseUrl", async () => {
      const client = createGiteaClient(createStatusHttpPort(200))
      const results = await client.verifyGitUsernames(
        { ...giteaDraft, baseUrl: "" },
        ["alice"],
      )
      assert.equal(results.length, 1)
      assert.equal(results[0].exists, false)
    })
  })
})

describe("GitHub error paths", () => {
  describe("verifyConnection", () => {
    it("returns verified: false on 401", async () => {
      const client = createGitHubClient(
        createStatusHttpPort(
          401,
          JSON.stringify({ message: "Bad credentials" }),
        ),
      )
      const result = await client.verifyConnection(githubDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 403", async () => {
      const client = createGitHubClient(
        createStatusHttpPort(403, JSON.stringify({ message: "Forbidden" })),
      )
      const result = await client.verifyConnection(githubDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 429", async () => {
      const client = createGitHubClient(
        createStatusHttpPort(429, JSON.stringify({ message: "rate limit" })),
      )
      const result = await client.verifyConnection(githubDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on network error", async () => {
      const client = createGitHubClient(createNetworkErrorHttpPort())
      const result = await client.verifyConnection(githubDraft)
      assert.deepEqual(result, { verified: false })
    })
  })

  describe("verifyGitUsernames", () => {
    it("returns exists: false for 404 users", async () => {
      const client = createGitHubClient(
        createStatusHttpPort(404, JSON.stringify({ message: "Not Found" })),
      )
      const results = await client.verifyGitUsernames(githubDraft, ["nobody"])
      assert.equal(results.length, 1)
      assert.equal(results[0].exists, false)
    })

    it("reports a proven stop before username lookup", async () => {
      let fetchCount = 0
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          fetchCount++
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ login: "alice", id: 1 }),
          }
        },
      }

      const controller = new AbortController()
      controller.abort()

      const client = createGitHubClient(http)
      await assert.rejects(
        client.verifyGitUsernames(
          githubDraft,
          ["alice", "bob"],
          controller.signal,
        ),
        { type: "git-effect", disposition: "stopped" },
      )

      assert.equal(fetchCount, 0)
    })
  })
})

describe("GitLab error paths", () => {
  describe("verifyConnection", () => {
    it("returns verified: false on 401", async () => {
      const client = createGitLabClient(
        createStatusHttpPort(
          401,
          JSON.stringify({ message: "401 Unauthorized" }),
        ),
      )
      const result = await client.verifyConnection(gitlabDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 403", async () => {
      const client = createGitLabClient(
        createStatusHttpPort(403, JSON.stringify({ message: "403 Forbidden" })),
      )
      const result = await client.verifyConnection(gitlabDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on 429", async () => {
      const client = createGitLabClient(
        createStatusHttpPort(429, JSON.stringify({ message: "rate limit" })),
      )
      const result = await client.verifyConnection(gitlabDraft)
      assert.deepEqual(result, { verified: false })
    })

    it("returns verified: false on network error", async () => {
      const client = createGitLabClient(createNetworkErrorHttpPort())
      const result = await client.verifyConnection(gitlabDraft)
      assert.deepEqual(result, { verified: false })
    })
  })

  describe("verifyGitUsernames", () => {
    it("returns exists: false when user lookup fails", async () => {
      const client = createGitLabClient(
        createStatusHttpPort(404, JSON.stringify({ message: "404 Not Found" })),
      )
      const results = await client.verifyGitUsernames(gitlabDraft, ["nobody"])
      assert.equal(results.length, 1)
      assert.equal(results[0].exists, false)
    })

    it("reports a proven stop before username lookup", async () => {
      let fetchCount = 0
      const http: HttpPort = {
        async fetch(): Promise<HttpResponse> {
          fetchCount++
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify([]),
          }
        },
      }

      const controller = new AbortController()
      controller.abort()

      const client = createGitLabClient(http)
      await assert.rejects(
        client.verifyGitUsernames(
          gitlabDraft,
          ["alice", "bob"],
          controller.signal,
        ),
        { type: "git-effect", disposition: "stopped" },
      )

      assert.equal(fetchCount, 0)
    })
  })
})

describe("error handling consistency across git providers", () => {
  it("all providers return verified: false on 401 (not throw)", async () => {
    const http401 = createStatusHttpPort(
      401,
      JSON.stringify({ message: "Unauthorized" }),
    )
    const github =
      await createGitHubClient(http401).verifyConnection(githubDraft)
    const gitlab =
      await createGitLabClient(http401).verifyConnection(gitlabDraft)
    const gitea = await createGiteaClient(http401).verifyConnection(giteaDraft)

    assert.equal(github.verified, false, "GitHub should return false on 401")
    assert.equal(gitlab.verified, false, "GitLab should return false on 401")
    assert.equal(gitea.verified, false, "Gitea should return false on 401")
  })

  it("all providers return verified: false on network error (not throw)", async () => {
    const httpErr = createNetworkErrorHttpPort()
    const github =
      await createGitHubClient(httpErr).verifyConnection(githubDraft)
    const gitlab =
      await createGitLabClient(httpErr).verifyConnection(gitlabDraft)
    const gitea = await createGiteaClient(httpErr).verifyConnection(giteaDraft)

    assert.equal(github.verified, false)
    assert.equal(gitlab.verified, false)
    assert.equal(gitea.verified, false)
  })

  it("all providers return verified: false on 429 (not throw)", async () => {
    const http429 = createStatusHttpPort(
      429,
      JSON.stringify({ message: "Too many requests" }),
    )
    const github =
      await createGitHubClient(http429).verifyConnection(githubDraft)
    const gitlab =
      await createGitLabClient(http429).verifyConnection(gitlabDraft)
    const gitea = await createGiteaClient(http429).verifyConnection(giteaDraft)

    assert.equal(github.verified, false, "GitHub should return false on 429")
    assert.equal(gitlab.verified, false, "GitLab should return false on 429")
    assert.equal(gitea.verified, false, "Gitea should return false on 429")
  })

  it("all providers treat 429 username lookups as non-existing", async () => {
    const http429 = createStatusHttpPort(
      429,
      JSON.stringify({ message: "Too many requests" }),
    )
    const github = await createGitHubClient(http429).verifyGitUsernames(
      githubDraft,
      ["alice"],
    )
    const gitlab = await createGitLabClient(http429).verifyGitUsernames(
      gitlabDraft,
      ["alice"],
    )
    const gitea = await createGiteaClient(http429).verifyGitUsernames(
      giteaDraft,
      ["alice"],
    )

    assert.deepStrictEqual(github, [{ username: "alice", exists: false }])
    assert.deepStrictEqual(gitlab, [{ username: "alice", exists: false }])
    assert.deepStrictEqual(gitea, [{ username: "alice", exists: false }])
  })

  it("all operations and providers report a caller abort as a proven stop", async () => {
    const controller = new AbortController()
    controller.abort(new Error("custom reason"))

    const http = createAbortedHttpPort()
    const operations: Array<
      (client: GitProviderClient, draft: GitConnectionDraft) => Promise<unknown>
    > = [
      (client, draft) => client.verifyConnection(draft, controller.signal),
      (client, draft) =>
        client.verifyGitUsernames(draft, ["alice"], controller.signal),
      (client, draft) =>
        client.getRepositoryDefaultBranchHead(
          draft,
          { owner: "course-org", repositoryName: "repo-1" },
          controller.signal,
        ),
      (client, draft) =>
        client.getTemplateDiff(
          draft,
          {
            owner: "course-org",
            repositoryName: "repo-1",
            fromSha: "old",
            toSha: "new",
          },
          controller.signal,
        ),
      (client, draft) =>
        client.resolveRepositoryCloneUrls(
          draft,
          { organization: "course-org", repositoryNames: ["repo-1"] },
          controller.signal,
        ),
      (client, draft) =>
        client.listRepositories(
          draft,
          { namespace: "course-org" },
          controller.signal,
        ),
      (client, draft) =>
        client.createRepositories(
          draft,
          {
            organization: "course-org",
            repositoryNames: ["repo-1"],
            visibility: "private",
            autoInit: true,
          },
          controller.signal,
        ),
      (client, draft) =>
        client.createTeam(
          draft,
          {
            organization: "course-org",
            teamName: "team-1",
            memberUsernames: ["alice"],
            permission: "push",
          },
          controller.signal,
        ),
      (client, draft) =>
        client.assignRepositoriesToTeam(
          draft,
          {
            organization: "course-org",
            teamSlug: "team-1",
            repositoryNames: ["repo-1"],
            permission: "push",
          },
          controller.signal,
        ),
      (client, draft) =>
        client.createBranch(
          draft,
          {
            owner: "course-org",
            repositoryName: "repo-1",
            branchName: "template-update",
            baseSha: "base",
            commitMessage: "Update template",
            files: [],
          },
          controller.signal,
        ),
      (client, draft) =>
        client.createPullRequest(
          draft,
          {
            owner: "course-org",
            repositoryName: "repo-1",
            headBranch: "template-update",
            baseBranch: "main",
            title: "Template update",
            body: "",
          },
          controller.signal,
        ),
    ]

    for (const providerClient of providerClients) {
      const [client, draft] = providerClient(http)
      for (const operation of operations) {
        await assert.rejects(operation(client, draft), {
          name: "Error",
          message: "Operation cancelled.",
          type: "git-effect",
          disposition: "stopped",
        })
      }
    }
  })

  it("all providers stop a read that Cancel interrupts in flight", async () => {
    for (const providerClient of providerClients) {
      const controller = new AbortController()
      const [client, draft] = providerClient(
        createSignalObeyingHttpPort(() => {
          controller.abort()
          return null
        }),
      )
      await assert.rejects(
        client.resolveRepositoryCloneUrls(
          draft,
          { organization: "course-org", repositoryNames: ["repo-1"] },
          controller.signal,
        ),
        { type: "git-effect", disposition: "stopped" },
      )
    }
  })

  it("all providers let a write run to its response when Cancel arrives", async () => {
    for (const providerClient of providerClients) {
      const controller = new AbortController()
      const writeSignals: Array<AbortSignal | undefined> = []
      const [client, draft] = providerClient(
        createSignalObeyingHttpPort((request) => {
          if (request.method !== "GET") {
            writeSignals.push(request.signal)
            controller.abort()
          }
          return createdRepositoryResponse
        }),
      )
      const result = await client.createRepositories(
        draft,
        {
          organization: "course-org",
          repositoryNames: ["repo-1"],
          visibility: "private",
          autoInit: true,
        },
        controller.signal,
      )
      assert.equal(result.created.length, 1)
      assert.deepStrictEqual(writeSignals, [undefined])
    }
  })

  it("Gitea and GitLab report a failed file lookup during branch creation as a known failure", async () => {
    const http: HttpPort = {
      async fetch(request: HttpRequest): Promise<HttpResponse> {
        if (
          request.url.includes("/contents/") ||
          request.url.includes("/repository/files/")
        ) {
          return {
            status: 500,
            statusText: "Error",
            headers: { "content-type": "application/json" },
            body: "{}",
          }
        }
        return createdRepositoryResponse
      },
    }
    const clients: Array<[GitProviderClient, GitConnectionDraft]> = [
      [createGitLabClient(http), gitlabDraft],
      [createGiteaClient(http), giteaDraft],
    ]
    for (const [client, draft] of clients) {
      await assert.rejects(
        client.createBranch(draft, {
          owner: "course-org",
          repositoryName: "repo-1",
          branchName: "template-update",
          baseSha: "base",
          commitMessage: "Update template",
          files: [
            {
              path: "README.md",
              previousPath: null,
              status: "modified",
              contentBase64: "VXBkYXRlZA==",
            },
          ],
        }),
        { type: "git-effect", disposition: "completed" },
      )
    }
  })

  it("Gitea reports a refused delete of a renamed file's old path as a known failure", async () => {
    const http: HttpPort = {
      async fetch(request: HttpRequest): Promise<HttpResponse> {
        if (request.method === "DELETE") {
          return {
            status: 403,
            statusText: "Forbidden",
            headers: { "content-type": "application/json" },
            body: "{}",
          }
        }
        if (request.method === "GET" && request.url.includes("/contents/")) {
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sha: "previous-sha" }),
          }
        }
        return createdRepositoryResponse
      },
    }
    await assert.rejects(
      createGiteaClient(http).createBranch(giteaDraft, {
        owner: "course-org",
        repositoryName: "repo-1",
        branchName: "template-update",
        baseSha: "base",
        commitMessage: "Update template",
        files: [
          {
            path: "docs/README.md",
            previousPath: "README.md",
            status: "renamed",
            contentBase64: "VXBkYXRlZA==",
          },
        ],
      }),
      {
        message: "Failed to delete 'README.md' (403).",
        type: "git-effect",
        disposition: "completed",
      },
    )
  })

  it("all providers report a failed read as a known failure", async () => {
    for (const providerClient of providerClients) {
      const [client, draft] = providerClient(createNetworkErrorHttpPort())
      await assert.rejects(
        client.resolveRepositoryCloneUrls(draft, {
          organization: "course-org",
          repositoryNames: ["repo-1"],
        }),
        {
          message: "Connection refused",
          type: "git-effect",
          disposition: "completed",
        },
      )
    }
  })
})
