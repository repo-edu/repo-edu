import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Default model codes — resolved against @repo-edu/integrations-llm-catalog.
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

// Package-local assets resolve from this module's location.
export const CODER_AGREEMENT = resolve(__dirname, "coder-agreement.md")
export const CODER_AGREEMENT_AI = resolve(__dirname, "coder-agreement-ai.md")

// Workspace-root-sensitive paths come from runtime roots configured by the
// CLI shell. The engine itself never derives these from its own source path.
export interface FixtureRuntimeRoots {
  workspaceRoot: string
  fixturesDir: string
}

let RUNTIME_ROOTS: FixtureRuntimeRoots | null = null

export function setFixtureRuntimeRoots(roots: FixtureRuntimeRoots): void {
  RUNTIME_ROOTS = roots
}

export function getFixtureRuntimeRoots(): FixtureRuntimeRoots {
  if (!RUNTIME_ROOTS) {
    throw new Error(
      "fixture-engine: runtime roots not configured (call setFixtureRuntimeRoots before invoking fixture commands)",
    )
  }
  return RUNTIME_ROOTS
}

export function defaultFixturesDirFor(workspaceRoot: string): string {
  return resolve(workspaceRoot, "../fixtures")
}

// Live bindings — modules that read these at init time must be loaded only
// after `setFixtureRuntimeRoots` has been called (use `runFixtureCli` from
// the package entry, which dynamic-imports the rest of the engine).
export function REPO_ROOT(): string {
  return getFixtureRuntimeRoots().workspaceRoot
}

export function FIXTURES_DIR(): string {
  return getFixtureRuntimeRoots().fixturesDir
}
