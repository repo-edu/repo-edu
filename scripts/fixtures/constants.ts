import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"

export const DEFAULT_ROUNDS = 3
export const DEFAULT_COMPLEXITY = 2
export const MIN_COMPLEXITY = 1
export const MAX_COMPLEXITY = 4
export const DEFAULT_STUDENTS = 3
export const MIN_STUDENTS = 1
export const MAX_STUDENTS = 10
export const DEFAULT_CODER_LEVEL = 2
export const MIN_CODER_LEVEL = 1
export const MAX_CODER_LEVEL = 4
export const DEFAULT_COMMENTS = 1
export const MIN_COMMENTS = 0
export const MAX_COMMENTS = 3
export const COMMENTS_FREE_TIER = 3
export const DEFAULT_REVIEW_FREQUENCY = 30
export const MIN_REVIEW_FREQUENCY = 0
export const MAX_REVIEW_FREQUENCY = 100
export const DEFAULT_MP = "33"
export const DEFAULT_MC = "23"

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

export const PROJECTS_SUBDIR = "_projects"
export const PLANS_SUBDIR = "_plans"
export const LOG_BASENAME = "_log.md"
export const STALE_FILES = ["_state.json", "_review.md", "_log.md"]
export const GITIGNORE_LINES = [
  "_log.md",
  "_review.md",
  "_state.json",
  ".DS_Store",
]

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, "../..")
export const STUDENT_REPOS = resolve(REPO_ROOT, "../student-repos")
export const CODER_AGREEMENT = resolve(__dirname, "coder-agreement.md")
