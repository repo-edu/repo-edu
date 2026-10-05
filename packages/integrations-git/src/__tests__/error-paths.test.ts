import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type {
  CreateRepositoriesResult,
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

/** One success body every provider reads as the repository, team, group,
 * plain file, branch or pull request a write or lookup asked for. */
const writeAnswer: HttpResponse = {
  status: 201,
  statusText: "Created",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id: 7,
    slug: "team-1",
    type: "file",
    sha: "blob",
    html_url: "https://example.test/course-org/repo-1",
    clone_url: "https://example.test/course-org/repo-1.git",
    web_url: "https://example.test/course-org/repo-1",
    http_url_to_repo: "https://example.test/course-org/repo-1.git",
  }),
}

/** Reads succeed, with an active account for a GitLab user search, and every
 * write gets `answerWrite`'s reply. */
function createWriteHttpPort(
  answerWrite: (request: HttpRequest) => HttpResponse,
): HttpPort {
  return {
    async fetch(request: HttpRequest): Promise<HttpResponse> {
      if (request.method !== "GET") return answerWrite(request)
      const username = new URL(request.url).searchParams.get("username")
      if (username === null) return writeAnswer
      return {
        ...writeAnswer,
        status: 200,
        body: JSON.stringify([{ id: 5, username, state: "active" }]),
      }
    },
  }
}

/** Every write an exclusive command makes, each with more than one step
 * except the pull request. */
const writes: Array<
  (
    client: GitProviderClient,
    draft: GitConnectionDraft,
    signal?: AbortSignal,
  ) => Promise<unknown>
> = [
  (client, draft, signal) =>
    client.createRepositories(
      draft,
      {
        organization: "course-org",
        repositoryNames: ["repo-1", "repo-2"],
        visibility: "private",
        autoInit: true,
      },
      signal,
    ),
  (client, draft, signal) =>
    client.createTeam(
      draft,
      {
        organization: "course-org",
        teamName: "team-1",
        memberUsernames: ["alice", "bob"],
        permission: "push",
      },
      signal,
    ),
  (client, draft, signal) =>
    client.assignRepositoriesToTeam(
      draft,
      {
        organization: "course-org",
        teamSlug: "7",
        repositoryNames: ["repo-1", "repo-2"],
        permission: "push",
      },
      signal,
    ),
  (client, draft, signal) =>
    client.createBranch(
      draft,
      {
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
      },
      signal,
    ),
  (client, draft, signal) =>
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
      signal,
    ),
]

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
    it("reports a failed username lookup as a known failure", async () => {
      const client = createGiteaClient(createNetworkErrorHttpPort())
      await assert.rejects(
        client.verifyGitUsernames(giteaDraft, ["alice", "bob"]),
        {
          message: "Connection refused",
          type: "git-effect",
          disposition: "completed",
        },
      )
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

    it("reports username lookup without a base URL as a known failure", async () => {
      const client = createGiteaClient(createStatusHttpPort(200))
      await assert.rejects(
        client.verifyGitUsernames({ ...giteaDraft, baseUrl: "" }, ["alice"]),
        {
          message: "Gitea baseUrl is required.",
          type: "git-effect",
          disposition: "completed",
        },
      )
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
    it("reports a failed user search as a known failure", async () => {
      const client = createGitLabClient(
        createStatusHttpPort(404, JSON.stringify({ message: "404 Not Found" })),
      )
      await assert.rejects(client.verifyGitUsernames(gitlabDraft, ["nobody"]), {
        type: "git-effect",
        disposition: "completed",
      })
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

  it("all providers report a refused username lookup as a known failure", async () => {
    // A rejected token or a rate limit says nothing about the username.
    for (const status of [401, 429]) {
      for (const providerClient of providerClients) {
        const [client, draft] = providerClient(
          createStatusHttpPort(
            status,
            JSON.stringify({ message: "Request refused" }),
          ),
        )
        await assert.rejects(client.verifyGitUsernames(draft, ["alice"]), {
          type: "git-effect",
          disposition: "completed",
        })
      }
    }
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
          return writeAnswer
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

  it("every read reports a lost request or an unnamed error reply as a known failure", async () => {
    const reads: Array<
      (client: GitProviderClient, draft: GitConnectionDraft) => Promise<unknown>
    > = [
      (client, draft) => client.verifyGitUsernames(draft, ["alice"]),
      (client, draft) =>
        client.resolveRepositoryCloneUrls(draft, {
          organization: "course-org",
          repositoryNames: ["repo-1"],
        }),
      (client, draft) =>
        client.getRepositoryDefaultBranchHead(draft, {
          owner: "course-org",
          repositoryName: "repo-1",
        }),
    ]
    const ports = [
      createNetworkErrorHttpPort(),
      createStatusHttpPort(500, JSON.stringify({ message: "Internal error" })),
    ]
    for (const http of ports) {
      for (const providerClient of providerClients) {
        const [client, draft] = providerClient(http)
        for (const read of reads) {
          await assert.rejects(read(client, draft), {
            type: "git-effect",
            disposition: "completed",
          })
        }
      }
    }
  })

  it("every write leaves a lost response unknown", async () => {
    const lost = new Error("Response lost.")
    for (const providerClient of providerClients) {
      const [client, draft] = providerClient(
        createWriteHttpPort(() => {
          throw lost
        }),
      )
      for (const write of writes) {
        // Octokit wraps a lost response in its own error.
        await assert.rejects(
          write(client, draft),
          (error) =>
            error instanceof Error &&
            error.message === lost.message &&
            !("type" in error),
        )
      }
    }
  })

  it("every write reports an unnamed error reply as a known failure", async () => {
    const refused: HttpResponse = {
      status: 500,
      statusText: "Error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Internal error" }),
    }
    for (const providerClient of providerClients) {
      const [client, draft] = providerClient(createWriteHttpPort(() => refused))
      // A refused repository is that repository's failed entry.
      const [createRepositories, ...others] = writes
      const result = (await createRepositories(
        client,
        draft,
      )) as CreateRepositoriesResult
      assert.deepStrictEqual(
        result.failed.map((entry) => entry.repositoryName),
        ["repo-1", "repo-2"],
      )
      for (const write of others) {
        await assert.rejects(write(client, draft), {
          type: "git-effect",
          disposition: "completed",
        })
      }
    }
  })

  it("every write with several steps stops before the next one once Cancel arrives", async () => {
    // A pull request is a single write, which runs to its response.
    for (const write of writes.slice(0, -1)) {
      for (const providerClient of providerClients) {
        const controller = new AbortController()
        let writeCount = 0
        const [client, draft] = providerClient(
          createWriteHttpPort(() => {
            writeCount++
            controller.abort()
            return writeAnswer
          }),
        )
        await assert.rejects(write(client, draft, controller.signal), {
          type: "git-effect",
          disposition: "stopped",
        })
        assert.equal(writeCount, 1)
      }
    }
  })

  it("all providers report a lost file read during branch creation as a known failure", async () => {
    for (const providerClient of providerClients) {
      const [client, draft] = providerClient({
        async fetch(request: HttpRequest): Promise<HttpResponse> {
          if (
            request.url.includes("/contents/") ||
            request.url.includes("/repository/tree")
          ) {
            throw new Error("Connection reset")
          }
          return writeAnswer
        },
      })
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
        {
          message: "Connection reset",
          type: "git-effect",
          disposition: "completed",
        },
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
            body: JSON.stringify({
              message: "user does not have permission to write",
              url: "https://gitea.example.com/api/swagger",
            }),
          }
        }
        if (request.method === "GET" && request.url.includes("/contents/")) {
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ type: "file", sha: "previous-sha" }),
          }
        }
        return writeAnswer
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
        message:
          "DELETE /api/v1/repos/course-org/repo-1/contents/README.md answered 403: user does not have permission to write",
        type: "git-effect",
        disposition: "completed",
      },
    )
  })

  it("all providers read only an explicit 404 as absence", async () => {
    for (const providerClient of providerClients) {
      const [client, draft] = providerClient(
        createStatusHttpPort(
          403,
          JSON.stringify({ message: "404 Project Not Found" }),
        ),
      )
      await assert.rejects(
        client.resolveRepositoryCloneUrls(draft, {
          organization: "course-org",
          repositoryNames: ["repo-1"],
        }),
        { type: "git-effect", disposition: "completed" },
      )
    }
  })

  it("all providers report a repository answered without a clone URL as a known failure", async () => {
    for (const providerClient of providerClients) {
      const [client, draft] = providerClient(
        createStatusHttpPort(200, JSON.stringify({ id: 7 })),
      )
      await assert.rejects(
        client.resolveRepositoryCloneUrls(draft, {
          organization: "course-org",
          repositoryNames: ["repo-1"],
        }),
        { type: "git-effect", disposition: "completed" },
      )
    }
  })

  it("all providers stop when Cancel interrupts the lookup of an existing repository", async () => {
    // Each provider answers a taken repository name in its own way.
    const repositoryExists: Record<
      GitConnectionDraft["provider"],
      HttpResponse
    > = {
      github: {
        status: 422,
        statusText: "Unprocessable Entity",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Repository creation failed.",
          errors: [
            {
              resource: "Repository",
              code: "custom",
              field: "name",
              message: "name already exists on this account",
            },
          ],
          status: "422",
        }),
      },
      gitlab: {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            name: ["has already been taken"],
            path: ["has already been taken"],
          },
        }),
      },
      gitea: {
        status: 409,
        statusText: "Conflict",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "The repository with the same name already exists.",
          url: "https://gitea.example.com/api/swagger",
        }),
      },
    }
    for (const providerClient of providerClients) {
      const controller = new AbortController()
      let provider: GitConnectionDraft["provider"] = "github"
      const [client, draft] = providerClient(
        createSignalObeyingHttpPort((request) => {
          if (request.method === "POST") return repositoryExists[provider]
          if (request.url.includes("/groups/")) return writeAnswer
          controller.abort()
          return null
        }),
      )
      provider = draft.provider
      await assert.rejects(
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
        { type: "git-effect", disposition: "stopped" },
      )
    }
  })
})
