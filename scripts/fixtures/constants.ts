import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"

// Models
export const DEFAULT_MP = "33"
export const DEFAULT_MC = "23"

// Mode
export const DEFAULT_AI_CODERS = true

// Project (planner)
export const DEFAULT_COMPLEXITY = 2
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
] as const
export type Style = (typeof STYLES)[number]
export const DEFAULT_STYLE: Style = "big-bang"
export const STYLE_CODE: Record<Style, string> = {
  "big-bang": "bb",
  incremental: "in",
  "vertical-slice": "vs",
  "bottom-up": "bu",
  "top-down": "td",
}

// Repo (coder)
export const DEFAULT_CODER_EXPERIENCE = 3
export const MIN_CODER_EXPERIENCE = 1
export const MAX_CODER_EXPERIENCE = 4
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

export const LOG_BASENAME = "_log.md"
export const TRACE_BASENAME = "_trace.md"
export const XTRACE_BASENAME = "_xtrace.md"
export const STATE_BASENAME = "_state.json"
export const REVIEW_BASENAME = "_review.md"
export const SETTINGS_BASENAME = ".fixture-settings.jsonc"
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
export const STUDENT_REPOS = resolve(REPO_ROOT, "../student-repos")
export const CODER_AGREEMENT = resolve(__dirname, "coder-agreement.md")
export const CODER_AGREEMENT_L0 = resolve(__dirname, "coder-agreement-l0.md")
