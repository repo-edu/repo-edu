import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  HttpPort,
  HttpRequest,
  HttpResponse,
} from "@repo-edu/host-runtime-contract"
import type { GitConnectionDraft } from "@repo-edu/integrations-git-contract"
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

    it("stops processing usernames when signal is aborted", async () => {
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
      const results = await client.verifyGitUsernames(
        giteaDraft,
        ["alice", "bob", "carol"],
        controller.signal,
      )

      assert.equal(fetchCount, 0)
      assert.equal(results.length, 0)
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

    it("stops processing usernames when signal is aborted", async () => {
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
      const results = await client.verifyGitUsernames(
        githubDraft,
        ["alice", "bob"],
        controller.signal,
      )

      assert.equal(fetchCount, 0)
      assert.equal(results.length, 0)
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

    it("stops processing when signal is aborted", async () => {
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
      const results = await client.verifyGitUsernames(
        gitlabDraft,
        ["alice", "bob"],
        controller.signal,
      )

      assert.equal(fetchCount, 0)
      assert.equal(results.length, 0)
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

  it("all providers handle aborted signal in verifyGitUsernames by returning early", async () => {
    const controller = new AbortController()
    controller.abort()

    const http = createAbortedHttpPort()

    const github = await createGitHubClient(http).verifyGitUsernames(
      githubDraft,
      ["alice"],
      controller.signal,
    )
    const gitlab = await createGitLabClient(http).verifyGitUsernames(
      gitlabDraft,
      ["alice"],
      controller.signal,
    )
    const gitea = await createGiteaClient(http).verifyGitUsernames(
      giteaDraft,
      ["alice"],
      controller.signal,
    )

    assert.equal(github.length, 0, "GitHub should return empty on abort")
    assert.equal(gitlab.length, 0, "GitLab should return empty on abort")
    assert.equal(gitea.length, 0, "Gitea should return empty on abort")
  })
})
