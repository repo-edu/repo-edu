import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mergeLlmRuntimeConfig } from "../llm-runtime-config.js"

describe("mergeLlmRuntimeConfig", () => {
  it("replaces request-scoped credential fields while preserving host carrier fields", () => {
    const merged = mergeLlmRuntimeConfig(
      {
        claude: {
          authMode: "api",
          apiKey: "stale-claude-key",
          maxTokens: 999,
          baseUrl: "https://claude.example.test",
          env: {
            CLAUDE_CONFIG_DIR: "/tmp/claude-config",
          },
        },
        codex: {
          authMode: "api",
          apiKey: "stale-codex-key",
          baseUrl: "https://codex.example.test",
          binaryPath: "/Applications/repo-edu/Codex",
          env: {
            CODEX_HOME: "/tmp/codex-home",
          },
        },
      },
      {
        claude: {
          authMode: "api",
          apiKey: "fresh-claude-key",
          maxTokens: 123,
        },
        codex: {
          authMode: "subscription",
        },
      },
    )

    assert.deepStrictEqual(merged, {
      claude: {
        baseUrl: "https://claude.example.test",
        env: {
          CLAUDE_CONFIG_DIR: "/tmp/claude-config",
        },
        authMode: "api",
        apiKey: "fresh-claude-key",
        maxTokens: 123,
      },
      codex: {
        baseUrl: "https://codex.example.test",
        env: {
          CODEX_HOME: "/tmp/codex-home",
        },
        binaryPath: "/Applications/repo-edu/Codex",
        authMode: "subscription",
      },
    })
  })
})
