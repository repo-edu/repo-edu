import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import type { Usage } from "./agent"
import type { State } from "./coder"
import { type ModelName, STUDENT_REPOS } from "./constants"
import { formatSeconds } from "./log"
import { formatSpec } from "./naming"
import type { Project } from "./project-md"

export interface ReviewSummaryOpts {
  rounds: number
  complexity: number
  students: number
  reviewFrequency: number
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
    `- Review-frequency: ${opts.reviewFrequency}% (sampled ${reviewCount} reviews; ${state.rounds.length} total commits)`,
    `- Planner: ${formatSpec(opts.plannerModel, opts.plannerEffort)}`,
    `- Coder: ${formatSpec(opts.coderModel, opts.coderEffort)}`,
    `- Dir: ${dirName}/`,
    `- Wall time: ${formatSeconds(runMs)}`,
    `- Tokens in/out: ${totalIn} / ${totalOut}`,
    "",
    "## Per-round usage",
    "",
    "| # | kind | author | wall_ms | in | out | summary |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]
  for (const r of state.rounds) {
    const summary = r.coder_summary.split("\n")[0].slice(0, 80)
    lines.push(
      `| ${r.commit_index} | ${r.kind} | ${r.author_index} | ${r.usage.wall_ms} | ${r.usage.input_tokens} | ${r.usage.output_tokens} | ${summary} |`,
    )
  }
  lines.push("")

  writeFileSync(resolve(STUDENT_REPOS, "_review.md"), lines.join("\n"))
  process.stdout.write(
    `Wrote ${dirName}/ (see git log for contents). Review: ${dirName}/_review.md\n`,
  )
  process.stdout.write(
    `Wall time: ${formatSeconds(runMs)} | tokens in/out: ${totalIn} / ${totalOut}\n`,
  )
}
