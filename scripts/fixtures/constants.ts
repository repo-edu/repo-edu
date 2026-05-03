import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"

// Models
export const DEFAULT_MP = "35"
export const DEFAULT_MC = "22"

// Mode
export const DEFAULT_AI_CODERS = true

// Project (planner)
export const DEFAULT_COMPLEXITY = 1
export const MIN_COMPLEXITY = 1
export const MAX_COMPLEXITY = 4

// Plan (planner)
export const DEFAULT_STUDENTS = 3
export const MIN_STUDENTS = 1
export const MAX_STUDENTS = 10
export const DEFAULT_ROUNDS = 3
export const DEFAULT_CODER_INTERACTION = 2
export const MIN_CODER_INTERACTION = 1
export const MAX_CODER_INTERACTION = 3
export const DEFAULT_REVIEWS = 1
export const MIN_REVIEWS = 0

// Plan style
export const STYLES = [
  "big-bang",
  "incremental",
  "vertical-slice",
  "bottom-up",
  "top-down",
  "test-driven",
  "walking-skeleton",
  "spike-and-stabilize",
  "demo-driven",
  "refactor-heavy",
] as const
export type Style = (typeof STYLES)[number]
export const DEFAULT_STYLE: Style = "incremental"
export const STYLE_CODE: Record<Style, string> = {
  "big-bang": "bb",
  incremental: "inc",
  "vertical-slice": "vs",
  "bottom-up": "bu",
  "top-down": "topd",
  "test-driven": "tdd",
  "walking-skeleton": "walk",
  "spike-and-stabilize": "spik",
  "demo-driven": "demo",
  "refactor-heavy": "rfct",
}

// Repo (coder)
export const DEFAULT_COMMENTS = 1
export const MIN_COMMENTS = 0
export const MAX_COMMENTS = 3
export const COMMENTS_FREE_TIER = 3

export const MODEL_EFFORTS = {
  haiku: [] as readonly EffortLevel[],
  sonnet: ["low", "medium", "high"] as readonly EffortLevel[],
  opus: ["low", "medium", "high", "xhigh", "max"] as readonly EffortLevel[],
} as const
export type ModelName = keyof typeof MODEL_EFFORTS

export const MODEL_DIGIT: Record<ModelName, number> = {
  haiku: 1,
  sonnet: 2,
  opus: 3,
}
export const EFFORT_DIGIT: Record<EffortLevel | "none", number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
}

// USD per million tokens. Snapshot from https://www.anthropic.com/pricing —
// update here when Anthropic changes pricing.
export const TOKENS_PER_MTOK = 1_000_000
export const MODEL_PRICE_USD_PER_MTOK: Record<
  ModelName,
  { input: number; output: number }
> = {
  haiku: { input: 1, output: 5 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
}

export const LOG_BASENAME = "_log.md"
export const TRACE_BASENAME = "_trace.md"
export const XTRACE_BASENAME = "_xtrace.md"
export const STATE_BASENAME = "_state.json"
export const REVIEW_BASENAME = "_review.md"
export const SETTINGS_BASENAME = ".fixture-settings.jsonc"
export const SWEEP_BASENAME = ".fixture-sweep.jsonc"
export const PLAN_BASENAME = "plan.md"
export const GITIGNORE_LINES = [
  "_log.md",
  "_trace.md",
  "_xtrace.md",
  "_review.md",
  "_state.json",
  ".fixture-settings.jsonc",
  ".DS_Store",
]

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, "../..")
export const FIXTURES_DIR = resolve(REPO_ROOT, "../fixtures")
export const CODER_AGREEMENT = resolve(__dirname, "coder-agreement.md")
export const CODER_AGREEMENT_AI = resolve(__dirname, "coder-agreement-ai.md")
