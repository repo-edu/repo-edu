import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  type FixtureModelSpec,
  formatCostByMode,
  formatModelSpec,
  tokenCostUsd,
} from "@repo-edu/integrations-llm-catalog"
import type { LlmAuthMode, LlmUsage } from "@repo-edu/integrations-llm-contract"
import type { State } from "./coder"
import { REVIEW_BASENAME } from "./constants"
import { emptyUsage } from "./llm-client"
import { formatSeconds } from "./log"
import type { Project } from "./project-md"

export interface ReviewSummaryOpts {
  rounds: number
  complexity: number
  students: number
  reviews: number
  plannerSpec: FixtureModelSpec
  coderSpec: FixtureModelSpec
}

interface CostRow {
  authMode: LlmAuthMode
  usd: number | undefined
}

function sumUsage(parts: LlmUsage[]): LlmUsage {
  const acc = emptyUsage(parts[0]?.authMode ?? "api")
  for (const p of parts) {
    acc.inputTokens += p.inputTokens
    acc.cachedInputTokens += p.cachedInputTokens
    acc.outputTokens += p.outputTokens
    acc.reasoningOutputTokens += p.reasoningOutputTokens
    acc.wallMs += p.wallMs
  }
  return acc
}

function renderTotals(rows: CostRow[]): string[] {
  const apiRows = rows.filter(
    (r) => r.authMode === "api" && r.usd !== undefined,
  )
  const subRows = rows.filter(
    (r) => r.authMode === "subscription" && r.usd !== undefined,
  )
  const apiSum = apiRows.reduce((s, r) => s + (r.usd ?? 0), 0)
  const subSum = subRows.reduce((s, r) => s + (r.usd ?? 0), 0)

  if (apiRows.length > 0 && subRows.length > 0) {
    return [
      `- **API total**: ${formatCostByMode("api", apiSum)}`,
      `- **Subscription-equivalent total**: ${formatCostByMode("subscription", subSum)}`,
    ]
  }
  if (apiRows.length > 0) {
    return [`- **API total**: ${formatCostByMode("api", apiSum)}`]
  }
  if (subRows.length > 0) {
    return [
      `- **Subscription-equivalent total**: ${formatCostByMode("subscription", subSum)}`,
    ]
  }
  return [`- **Total**: ${formatCostByMode("api", undefined)}`]
}

export function writeReview(
  project: Project,
  state: State,
  opts: ReviewSummaryOpts,
  plannerUsage: LlmUsage,
  runMs: number,
  repoDir: string,
  dirName: string,
): void {
  const reviewCount = state.rounds.filter((r) => r.kind === "review").length

  const plannerCost: CostRow = {
    authMode: plannerUsage.authMode,
    usd: tokenCostUsd(opts.plannerSpec, plannerUsage),
  }
  const roundRows: { usage: LlmUsage; cost: CostRow }[] = state.rounds.map(
    (r) => ({
      usage: r.usage,
      cost: {
        authMode: r.usage.authMode,
        usd: tokenCostUsd(opts.coderSpec, r.usage),
      },
    }),
  )
  const totalUsage = sumUsage([plannerUsage, ...roundRows.map((r) => r.usage)])
  const allCostRows: CostRow[] = [plannerCost, ...roundRows.map((r) => r.cost)]

  const lines: string[] = [
    "# Run summary",
    "",
    `- Project: ${project.name}`,
    `- N (builds): ${opts.rounds}`,
    `- C: ${opts.complexity}`,
    `- S: ${opts.students}`,
    `- Reviews: ${opts.reviews} (planned; ${reviewCount} executed; ${state.rounds.length} total commits)`,
    `- Planner: ${formatModelSpec(opts.plannerSpec)} (${plannerUsage.authMode})`,
    `- Coder: ${formatModelSpec(opts.coderSpec)}`,
    `- Dir: ${dirName}/`,
    `- Wall time: ${formatSeconds(runMs)}`,
    `- Tokens in/cached/out: ${totalUsage.inputTokens} / ${totalUsage.cachedInputTokens} / ${totalUsage.outputTokens}`,
    ...renderTotals(allCostRows),
    ...(state.stopped
      ? [`- Stopped early after ${state.rounds.length} commit(s)`]
      : []),
    "",
    "## Per-round usage",
    "",
    "| # | kind | author | wall_s | in_k | cached_k | out_k | usd | summary |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ]
  let totalWallMs = 0
  let totalRoundIn = 0
  let totalRoundCached = 0
  let totalRoundOut = 0
  for (let i = 0; i < state.rounds.length; i++) {
    const r = state.rounds[i]
    const cost = roundRows[i].cost
    const summary = r.coder_summary
      .split("\n")[0]
      .slice(0, 80)
      .replace(/\|/g, "\\|")
    const wallS = Math.round(r.usage.wallMs / 1000)
    totalWallMs += r.usage.wallMs
    totalRoundIn += r.usage.inputTokens
    totalRoundCached += r.usage.cachedInputTokens
    totalRoundOut += r.usage.outputTokens
    const usd = formatCostByMode(cost.authMode, cost.usd)
    lines.push(
      `| ${r.commit_index + 1} | ${r.kind} | ${r.author_index + 1} | ${wallS} | ${(r.usage.inputTokens / 1000).toFixed(1)} | ${(r.usage.cachedInputTokens / 1000).toFixed(1)} | ${(r.usage.outputTokens / 1000).toFixed(1)} | ${usd} | ${summary} |`,
    )
  }
  lines.push(
    `| **total** |  |  | **${Math.round(totalWallMs / 1000)}** | **${(totalRoundIn / 1000).toFixed(1)}** | **${(totalRoundCached / 1000).toFixed(1)}** | **${(totalRoundOut / 1000).toFixed(1)}** |  |  |`,
  )
  lines.push("")

  writeFileSync(resolve(repoDir, REVIEW_BASENAME), lines.join("\n"))
  const stoppedSuffix = state.stopped ? " (stopped early)" : ""
  process.stdout.write(
    `Wrote ${dirName}/${stoppedSuffix} (see git log for contents). Review: ${REVIEW_BASENAME}\n`,
  )
  process.stdout.write(
    `Wall time: ${formatSeconds(totalWallMs)} | tokens in/cached/out: ${totalUsage.inputTokens} / ${totalUsage.cachedInputTokens} / ${totalUsage.outputTokens}\n`,
  )
}
