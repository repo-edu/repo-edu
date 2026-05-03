import type {
  LlmEffort,
  LlmModelSpec,
} from "@repo-edu/integrations-llm-contract"
import type { ModelName } from "./constants"
import { fail } from "./log"

const CLAUDE_MODEL_IDS: Record<ModelName, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
}

export function makeClaudeSpec(
  model: ModelName,
  effort: LlmEffort,
): LlmModelSpec {
  return {
    provider: "claude",
    family: model,
    modelId: CLAUDE_MODEL_IDS[model],
    effort,
  }
}

interface CodeEntry {
  model: ModelName
  effort: LlmEffort
}

const MODEL_CODE_ENTRIES: Record<string, CodeEntry> = {
  "1": { model: "haiku", effort: "none" },
  "2": { model: "sonnet", effort: "high" },
  "21": { model: "sonnet", effort: "low" },
  "22": { model: "sonnet", effort: "medium" },
  "23": { model: "sonnet", effort: "high" },
  "3": { model: "opus", effort: "high" },
  "31": { model: "opus", effort: "low" },
  "32": { model: "opus", effort: "medium" },
  "33": { model: "opus", effort: "high" },
  "34": { model: "opus", effort: "xhigh" },
  "35": { model: "opus", effort: "max" },
}

export const MODEL_CODES: Record<string, LlmModelSpec> = Object.fromEntries(
  Object.entries(MODEL_CODE_ENTRIES).map(([code, entry]) => [
    code,
    makeClaudeSpec(entry.model, entry.effort),
  ]),
)

export function parseModelCode(code: string, flag: string): LlmModelSpec {
  const resolved = MODEL_CODES[code]
  if (!resolved) {
    fail(
      `${flag}: unknown model code "${code}"; expected one of ${Object.keys(MODEL_CODES).join(", ")}`,
    )
  }
  return resolved
}
