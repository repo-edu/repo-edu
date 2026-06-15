import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  defaultAppCredentials,
  type PersistedAppCredentials,
} from "@repo-edu/domain/settings"
import { desktopLlmRuntimeConfigFromSettings } from "../llm-runtime-config.js"

describe("desktopLlmRuntimeConfigFromSettings", () => {
  it("keeps the Codex host carrier when the active saved connection is Claude", () => {
    const credentials: PersistedAppCredentials = {
      ...defaultAppCredentials,
      llmConnections: [
        {
          id: "claude",
          name: "Claude",
          provider: "claude",
          authMode: "subscription",
          apiKey: "",
        },
        {
          id: "codex",
          name: "Codex",
          provider: "codex",
          authMode: "subscription",
          apiKey: "",
        },
      ],
      activeLlmConnectionId: "claude",
    }

    assert.deepStrictEqual(
      desktopLlmRuntimeConfigFromSettings(credentials, {
        codexBinaryPath: "/Applications/Repo Edu/Codex",
      }),
      {
        claude: { authMode: "subscription" },
        codex: { binaryPath: "/Applications/Repo Edu/Codex" },
      },
    )
  })
})
