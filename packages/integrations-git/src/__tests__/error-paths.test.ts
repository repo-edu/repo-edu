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

    it("throws canonical cancellation before username lookup", async () => {
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
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError",
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

    it("throws canonical cancellation before username lookup", async () => {
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
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError",
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

    it("throws canonical cancellation before username lookup", async () => {
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
        (error: unknown) =>
          error instanceof DOMException && error.name === "AbortError",
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

  it("all operations and providers canonicalize custom caller abort reasons", async () => {
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
    ]
    const providers: Array<[GitProviderClient, GitConnectionDraft]> = [
      [createGitHubClient(http), githubDraft],
      [createGitLabClient(http), gitlabDraft],
      [createGiteaClient(http), giteaDraft],
    ]

    for (const [client, draft] of providers) {
      for (const operation of operations) {
        await assert.rejects(
          operation(client, draft),
          (error: unknown) =>
            error instanceof DOMException &&
            error.name === "AbortError" &&
            error.message === "The operation was aborted.",
        )
      }
    }
  })
})
