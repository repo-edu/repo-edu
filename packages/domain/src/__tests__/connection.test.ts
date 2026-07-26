import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  connectionBaseSchema,
  DEFAULT_CLAUDE_API_MAX_TOKENS,
  DEFAULT_USER_AGENT,
  gitConnectionDisplayLabel,
  gitProviderDefaultBaseUrls,
  gitProviderKinds,
  llmProviderKinds,
  lmsProviderKinds,
  normalizeUserAgent,
  type PersistedGitConnection,
  type PersistedLlmConnection,
  persistedGitConnectionSchema,
  persistedLlmConnectionSchema,
  persistedLmsConnectionSchema,
  resolveActiveGitConnection,
  resolveActiveLlmConnection,
  resolveUserAgent,
} from "../connection.js"

describe("connection providers", () => {
  it("publishes the persisted provider value sets", () => {
    assert.deepEqual(lmsProviderKinds, ["canvas", "moodle"])
    assert.deepEqual(gitProviderKinds, ["github", "gitlab", "gitea"])
    assert.deepEqual(llmProviderKinds, ["claude", "codex"])
  })
})

describe("connection schemas", () => {
  it("uses one strict base schema for common connection fields", () => {
    assert.equal(
      connectionBaseSchema.safeParse({
        baseUrl: "https://example.com",
        token: "secret",
        userAgent: "Teacher / School",
      }).success,
      true,
    )
    assert.equal(
      connectionBaseSchema.safeParse({
        baseUrl: "https://example.com",
        token: "secret",
        legacyField: true,
      }).success,
      false,
    )
    assert.equal(
      persistedLmsConnectionSchema.safeParse({
        id: "canvas-1",
        name: "Canvas",
        provider: "canvas",
        baseUrl: "https://canvas.example.com",
        token: "secret",
      }).success,
      true,
    )
    assert.equal(
      persistedGitConnectionSchema.safeParse({
        id: "git-1",
        provider: "gitlab",
        baseUrl: "https://gitlab.example.com",
        token: "secret",
      }).success,
      true,
    )
  })

  it("rejects unsupported LMS and Git providers", () => {
    assert.equal(
      persistedLmsConnectionSchema.safeParse({
        id: "lms-1",
        name: "Other",
        provider: "other",
        baseUrl: "https://example.com",
        token: "secret",
      }).success,
      false,
    )
    assert.equal(
      persistedGitConnectionSchema.safeParse({
        id: "git-1",
        provider: "other",
        baseUrl: "https://example.com",
        token: "secret",
      }).success,
      false,
    )
  })
})

describe("persistedLlmConnectionSchema", () => {
  it("accepts subscription connections with empty API keys", () => {
    for (const provider of llmProviderKinds) {
      assert.equal(
        persistedLlmConnectionSchema.safeParse({
          id: `${provider}-1`,
          name: provider,
          provider,
          authMode: "subscription",
          apiKey: "",
        }).success,
        true,
      )
    }
  })

  it("requires maxTokens only for Claude API connections", () => {
    assert.equal(
      persistedLlmConnectionSchema.safeParse({
        id: "claude-1",
        name: "Claude API",
        provider: "claude",
        authMode: "api",
        apiKey: "sk-claude",
        maxTokens: DEFAULT_CLAUDE_API_MAX_TOKENS,
      }).success,
      true,
    )
    assert.equal(
      persistedLlmConnectionSchema.safeParse({
        id: "claude-1",
        name: "Claude API",
        provider: "claude",
        authMode: "api",
        apiKey: "sk-claude",
      }).success,
      false,
    )
    assert.equal(
      persistedLlmConnectionSchema.safeParse({
        id: "codex-1",
        name: "Codex API",
        provider: "codex",
        authMode: "api",
        apiKey: "sk-codex",
      }).success,
      true,
    )
    assert.equal(
      persistedLlmConnectionSchema.safeParse({
        id: "codex-1",
        name: "Codex API",
        provider: "codex",
        authMode: "api",
        apiKey: "sk-codex",
        maxTokens: DEFAULT_CLAUDE_API_MAX_TOKENS,
      }).success,
      false,
    )
  })

  it("rejects authentication modes with invalid API keys", () => {
    assert.equal(
      persistedLlmConnectionSchema.safeParse({
        id: "bad-subscription",
        name: "Bad",
        provider: "claude",
        authMode: "subscription",
        apiKey: "must-be-empty",
      }).success,
      false,
    )
    assert.equal(
      persistedLlmConnectionSchema.safeParse({
        id: "bad-api",
        name: "Bad",
        provider: "codex",
        authMode: "api",
        apiKey: "",
      }).success,
      false,
    )
  })
})

describe("Git connection presentation", () => {
  it("publishes provider defaults and concise display labels", () => {
    assert.deepEqual(gitProviderDefaultBaseUrls, {
      github: "https://github.com",
      gitlab: "https://gitlab.com",
      gitea: "",
    })
    assert.equal(
      gitConnectionDisplayLabel({
        provider: "github",
        baseUrl: "https://github.com",
      }),
      "GitHub",
    )
    assert.equal(
      gitConnectionDisplayLabel({
        provider: "gitlab",
        baseUrl: "https://gitlab.example.edu",
      }),
      "GitLab · gitlab.example.edu",
    )
  })
})

describe("normalizeUserAgent", () => {
  it("returns a trimmed non-empty value", () => {
    assert.equal(normalizeUserAgent("  Name  "), "Name")
  })

  it("returns undefined for empty inputs", () => {
    assert.equal(normalizeUserAgent(""), undefined)
    assert.equal(normalizeUserAgent("   "), undefined)
    assert.equal(normalizeUserAgent(null), undefined)
    assert.equal(normalizeUserAgent(undefined), undefined)
  })
})

describe("resolveUserAgent", () => {
  it("normalizes an explicit user agent and otherwise uses the default", () => {
    assert.equal(
      resolveUserAgent({
        baseUrl: "",
        token: "",
        userAgent: "  Custom Agent  ",
      }),
      "Custom Agent",
    )
    assert.equal(
      resolveUserAgent({ baseUrl: "", token: "" }),
      DEFAULT_USER_AGENT,
    )
  })
})

describe("active connection selection", () => {
  const github: PersistedGitConnection = {
    id: "github-1",
    provider: "github",
    baseUrl: "https://github.com",
    token: "secret",
  }
  const gitlab: PersistedGitConnection = {
    id: "gitlab-1",
    provider: "gitlab",
    baseUrl: "https://gitlab.com",
    token: "secret",
  }
  const claude: PersistedLlmConnection = {
    id: "claude-1",
    name: "Claude",
    provider: "claude",
    authMode: "subscription",
    apiKey: "",
  }
  const codex: PersistedLlmConnection = {
    id: "codex-1",
    name: "Codex",
    provider: "codex",
    authMode: "api",
    apiKey: "sk-codex",
  }

  it("returns null for empty collections", () => {
    assert.equal(resolveActiveGitConnection([], null), null)
    assert.equal(resolveActiveLlmConnection([], null), null)
  })

  it("selects a matching id", () => {
    assert.equal(
      resolveActiveGitConnection([github, gitlab], "gitlab-1"),
      gitlab,
    )
    assert.equal(resolveActiveLlmConnection([claude, codex], "codex-1"), codex)
  })

  it("falls back to the first connection for absent or stale ids", () => {
    assert.equal(resolveActiveGitConnection([github, gitlab], null), github)
    assert.equal(
      resolveActiveLlmConnection([claude, codex], "deleted-id"),
      claude,
    )
  })
})
