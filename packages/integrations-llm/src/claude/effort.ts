import {
  type LlmAuthMode,
  type LlmEffort,
  LlmError,
} from "@repo-edu/integrations-llm-contract"

export type ClaudeNativeEffort = "low" | "medium" | "high" | "xhigh" | "max"

const CLAUDE_NATIVE_EFFORTS: ReadonlySet<string> = new Set<ClaudeNativeEffort>([
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
  if (effort === "none") return null
  if (CLAUDE_NATIVE_EFFORTS.has(effort)) return effort as ClaudeNativeEffort
  throw new LlmError("other", `effort '${effort}' is not supported on Claude`, {
    context: { provider: "claude", authMode },
  })
}
