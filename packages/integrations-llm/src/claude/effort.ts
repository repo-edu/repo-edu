import {
  type LlmAuthMode,
  type LlmEffort,
  LlmError,
} from "@repo-edu/integrations-llm-contract"

export type ClaudeNativeEffort = "low" | "medium" | "high" | "xhigh" | "max"

const SUPPORTED_CLAUDE_EFFORTS: ReadonlySet<LlmEffort> = new Set([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
])

export function claudeNativeEffort(
  effort: LlmEffort,
  authMode: LlmAuthMode,
): ClaudeNativeEffort | null {
  if (!SUPPORTED_CLAUDE_EFFORTS.has(effort)) {
    throw new LlmError(
      "other",
      `effort '${effort}' is not supported on Claude`,
      {
        context: { provider: "claude", authMode },
      },
    )
  }
  if (effort === "none") return null
  if (
    effort === "low" ||
    effort === "medium" ||
    effort === "high" ||
    effort === "xhigh" ||
    effort === "max"
  ) {
    return effort
  }
  throw new LlmError("other", `effort '${effort}' is not supported on Claude`, {
    context: { provider: "claude", authMode },
  })
}
