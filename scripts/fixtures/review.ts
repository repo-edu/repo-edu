import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import type { Usage } from "./agent"
import type { State } from "./coder"
import { type ModelName, REVIEW_BASENAME } from "./constants"
import { formatSeconds } from "./log"
import { formatSpec } from "./naming"
import type { Project } from "./project-md"

export interface ReviewSummaryOpts {
  rounds: number
  complexity: number
  students: number
  reviews: number
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  coderModel: ModelName
  coderEffort: EffortLevel | "none"
}

export function writeReview(
  project: Project,
  state: State,
  opts: ReviewSummaryOpts,
  plannerUsage: Usage,
  runMs: number,
  planDir: string,
  dirName: string,
): void {
  const totalIn =
    plannerUsage.input_tokens +
    state.rounds.reduce((s, r) => s + r.usage.input_tokens, 0)
  const totalOut =
    plannerUsage.output_tokens +
    state.rounds.reduce((s, r) => s + r.usage.output_tokens, 0)
  const reviewCount = state.rounds.filter((r) => r.kind === "review").length

  const lines: string[] = [
    "# Run summary",
    "",
    `- Project: ${project.name}`,
    `- N (builds): ${opts.rounds}`,
    `- C: ${opts.complexity}`,
    `- S: ${opts.students}`,
    `- Reviews: ${opts.reviews} (planned; ${reviewCount} executed; ${state.rounds.length} total commits)`,
    `- Planner: ${formatSpec(opts.plannerModel, opts.plannerEffort)}`,
    `- Coder: ${formatSpec(opts.coderModel, opts.coderEffort)}`,
    `- Dir: ${dirName}/`,
    `- Wall time: ${formatSeconds(runMs)}`,
    `- Tokens in/out: ${totalIn} / ${totalOut}`,
    ...(state.stopped
      ? [`- Stopped early after ${state.rounds.length} commit(s)`]
      : []),
    "",
    "## Per-round usage",
    "",
    "| # | kind | author | wall_s | in_k | out_k | summary |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]
  let totalWallMs = 0
  let totalRoundIn = 0
  let totalRoundOut = 0
  for (const r of state.rounds) {
    const summary = r.coder_summary
      .split("\n")[0]
      .slice(0, 80)
      .replace(/\|/g, "\\|")
    const wallS = Math.round(r.usage.wall_ms / 1000)
    totalWallMs += r.usage.wall_ms
    totalRoundIn += r.usage.input_tokens
    totalRoundOut += r.usage.output_tokens
    lines.push(
      `| ${r.commit_index + 1} | ${r.kind} | ${r.author_index + 1} | ${wallS} | ${(r.usage.input_tokens / 1000).toFixed(1)} | ${(r.usage.output_tokens / 1000).toFixed(1)} | ${summary} |`,
    )
  }
  lines.push(
    `| **total** |  |  | **${Math.round(totalWallMs / 1000)}** | **${(totalRoundIn / 1000).toFixed(1)}** | **${(totalRoundOut / 1000).toFixed(1)}** |  |`,
  )
  lines.push("")

  writeFileSync(resolve(planDir, REVIEW_BASENAME), lines.join("\n"))
  const stoppedSuffix = state.stopped ? " (stopped early)" : ""
  process.stdout.write(
    `Wrote ${dirName}/${stoppedSuffix} (see git log for contents). Review: ${dirName}/../${REVIEW_BASENAME}\n`,
  )
  process.stdout.write(
    `Wall time: ${formatSeconds(runMs)} | tokens in/out: ${totalIn} / ${totalOut}\n`,
  )
}
