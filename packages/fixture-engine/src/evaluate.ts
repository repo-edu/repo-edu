import { spawnSync } from "node:child_process"
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { effortOption, runAgent, type Usage } from "./agent"
import {
  MODEL_PRICE_USD_PER_MTOK,
  type ModelName,
  PLAN_BASENAME,
  STATE_BASENAME,
  TOKENS_PER_MTOK,
} from "./constants"
import { fail } from "./log"
import { MODEL_CODES, type ModelSpec } from "./model-codes"
import { formatSpec } from "./naming"
import { markdownToPlan } from "./plan-md"
import { loadSection } from "./prompt-loader"

const RUBRIC_AXES = [
  "blame_richness",
  "author_variation",
  "timeline_shape",
  "chart_legibility",
  "commit_message_quality",
  "surface_plausibility",
  "style_fidelity",
] as const

type RubricAxis = (typeof RUBRIC_AXES)[number]

interface Score {
  blame_richness: number
  author_variation: number
  timeline_shape: number
  chart_legibility: number
  commit_message_quality: number
  surface_plausibility: number
  style_fidelity: number
  notes: Record<RubricAxis, string>
}

interface RoundUsage {
  usage: Usage
}

interface RepoReport {
  repoDir: string
  dirName: string
  planDir: string
  styleName: string
  spec: ModelSpec
  rounds: number
  totalUsage: Usage
  estCost: number
  score: Score
  total: number
}

export const EVALUATE_BASENAME = "_evaluate.md"

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory()
}

export function findRepoDirs(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    if (!isDir(dir)) return
    if (existsSync(resolve(dir, STATE_BASENAME))) {
      out.push(dir)
      return
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith(".")) continue
      walk(resolve(dir, entry.name))
    }
  }
  walk(root)
  return out
}

function parseRepoDirCode(dirName: string): ModelSpec | null {
  const m = dirName.match(/^m(\d+)-o\d+/)
  if (!m) return null
  return MODEL_CODES[m[1]] ?? null
}

function readState(repoDir: string): RoundUsage[] {
  const path = resolve(repoDir, STATE_BASENAME)
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    rounds: RoundUsage[]
  }
  return raw.rounds
}

function aggregateUsage(rounds: RoundUsage[]): Usage {
  const acc: Usage = { input_tokens: 0, output_tokens: 0, wall_ms: 0 }
  for (const r of rounds) {
    acc.input_tokens += r.usage.input_tokens
    acc.output_tokens += r.usage.output_tokens
    acc.wall_ms += r.usage.wall_ms
  }
  return acc
}

function estimateCost(model: ModelName, usage: Usage): number {
  const p = MODEL_PRICE_USD_PER_MTOK[model]
  return (
    (usage.input_tokens * p.input + usage.output_tokens * p.output) /
    TOKENS_PER_MTOK
  )
}

function gitLs(repoDir: string): string[] {
  const r = spawnSync("git", ["-C", repoDir, "ls-files"], { encoding: "utf8" })
  if (r.status !== 0) fail(`git ls-files failed in ${repoDir}: ${r.stderr}`)
  return r.stdout.split("\n").filter(Boolean)
}

function gitLog(repoDir: string): string {
  const r = spawnSync(
    "git",
    [
      "-C",
      repoDir,
      "log",
      "--all",
      "--date=short",
      "--pretty=format:%h %an <%ae> %ad %s",
      "--stat",
    ],
    { encoding: "utf8" },
  )
  if (r.status !== 0) fail(`git log failed in ${repoDir}: ${r.stderr}`)
  return r.stdout
}

function readFiles(repoDir: string, paths: string[]): string {
  const blocks: string[] = []
  for (const p of paths) {
    const abs = resolve(repoDir, p)
    if (!existsSync(abs)) continue
    const text = readFileSync(abs, "utf8")
    blocks.push(`### ${p}\n\n\`\`\`\n${text}\n\`\`\``)
  }
  return blocks.join("\n\n")
}

function buildPrompt(args: {
  project: string
  plan: string
  styleName: string
  styleDescription: string
  repoTree: string[]
  repoFiles: string
  gitLogText: string
}): string {
  return [
    "You are evaluating one student-project repository for use as a demo in repo-edu's analysis tab.",
    "The audience is computer-science teachers seeing the per-author / per-file / per-module charts and blame tables.",
    "They will not run the code. Eyeball only — do not trace logic and do not attempt to execute anything.",
    "",
    "Score the repository on each axis from 1 (poor) to 5 (excellent):",
    "",
    "- blame_richness: per-file blame tables show multiple authors per module with varied commit ages — non-trivial blame mosaic.",
    "- author_variation: per-author charts show distinguishable contribution signatures and reasonably balanced LOC across the team — not one author owning the bulk while others trickle in. A 60/20/20 LOC split or worse is a red flag even if commit counts look even, EXCEPT when the style explicitly hands round 1 to one author (big-bang, walking-skeleton, spike-and-stabilize): in those styles the round-1 author legitimately leads on LOC, so judge balance from the post-round-1 work instead.",
    "- timeline_shape: commits across rounds form a visible pattern in the round-by-round view (growth curve, refactor pulses, slice deliveries) AND no single round dominates by size — round 1 should be comparable to later rounds unless the style explicitly defines a foundation commit (big-bang, walking-skeleton, spike-and-stabilize).",
    "- chart_legibility: distributions readable; no one giant file dominating, no swarm of trivial stubs.",
    '- commit_message_quality: messages read like real student commits, not LLM boilerplate ("Initial implementation", "Refactor code").',
    "- surface_plausibility: at a 30-second teacher glance, no syntax errors, broken control flow, nonsense identifiers, or pass-stub functions in modules the plan said were implemented. Eyeball only.",
    `- style_fidelity: the repository honours the plan's stated style "${args.styleName}", described below.`,
    "",
    `## Style: ${args.styleName}`,
    "",
    args.styleDescription,
    "",
    "## Project",
    "",
    args.project,
    "",
    "## Plan",
    "",
    args.plan,
    "",
    "## Repository tree",
    "",
    args.repoTree.map((p) => `- ${p}`).join("\n"),
    "",
    "## Repository files",
    "",
    args.repoFiles,
    "",
    "## Git log",
    "",
    "```",
    args.gitLogText,
    "```",
    "",
    "Return strict JSON only, no prose, no fences, no commentary. Schema:",
    "",
    "{",
    '  "blame_richness": <1-5 integer>,',
    '  "author_variation": <1-5 integer>,',
    '  "timeline_shape": <1-5 integer>,',
    '  "chart_legibility": <1-5 integer>,',
    '  "commit_message_quality": <1-5 integer>,',
    '  "surface_plausibility": <1-5 integer>,',
    '  "style_fidelity": <1-5 integer>,',
    '  "notes": {',
    '    "blame_richness": "<one short sentence>",',
    '    "author_variation": "<one short sentence>",',
    '    "timeline_shape": "<one short sentence>",',
    '    "chart_legibility": "<one short sentence>",',
    '    "commit_message_quality": "<one short sentence>",',
    '    "surface_plausibility": "<one short sentence>",',
    '    "style_fidelity": "<one short sentence>"',
    "  }",
    "}",
  ].join("\n")
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith("{")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  throw new Error(`no JSON object found in evaluator reply:\n${text}`)
}

function parseScore(reply: string): Score {
  const obj = JSON.parse(extractJson(reply)) as Record<string, unknown>
  const score: Partial<Score> = {}
  for (const axis of RUBRIC_AXES) {
    const v = obj[axis]
    if (typeof v !== "number") {
      throw new Error(`evaluator reply missing numeric "${axis}":\n${reply}`)
    }
    ;(score as Record<string, number | string | object>)[axis] = v
  }
  const rawNotes = obj.notes
  const notes: Record<RubricAxis, string> = Object.fromEntries(
    RUBRIC_AXES.map((a) => [a, ""]),
  ) as Record<RubricAxis, string>
  if (rawNotes && typeof rawNotes === "object" && !Array.isArray(rawNotes)) {
    for (const axis of RUBRIC_AXES) {
      const v = (rawNotes as Record<string, unknown>)[axis]
      notes[axis] = typeof v === "string" ? v : ""
    }
  } else if (typeof rawNotes === "string") {
    // Legacy single-string notes — drop into blame_richness slot so nothing's lost.
    notes.blame_richness = rawNotes
  }
  score.notes = notes
  return score as Score
}

function totalScore(s: Score): number {
  return RUBRIC_AXES.reduce((sum, axis) => sum + (s[axis] as number), 0)
}

function formatCost(usd: number): string {
  return usd < 0.01 ? `<$0.01` : `$${usd.toFixed(2)}`
}

function formatTokens(n: number, decimals = 1): string {
  return `${(n / 1000).toFixed(decimals)}k`
}

function formatWallSeconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`
}

function renderReport(
  evaluatorSpec: ModelSpec,
  rootDir: string,
  reports: RepoReport[],
): string {
  const sorted = [...reports].sort((a, b) => b.total - a.total)
  const styles = [...new Set(sorted.map((r) => r.styleName))]
  const planDirs = [...new Set(sorted.map((r) => r.planDir))].sort()
  const titleStyle = styles.length === 1 ? styles[0] : `${styles.length} styles`
  const summaryHeader = [
    `| repo | kind | wall | in | out | cost |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ]
  const summaryRows = sorted.map((r) => {
    const spec = formatSpec(r.spec.model, r.spec.effort)
    const wall = formatWallSeconds(r.totalUsage.wall_ms)
    const inT = formatTokens(r.totalUsage.input_tokens)
    const outT = formatTokens(r.totalUsage.output_tokens)
    const cost = formatCost(r.estCost)
    const repoLabel = `${basename(r.planDir)}/${r.dirName} (${spec})`
    return `| ${repoLabel} | ${r.styleName} | ${wall} | ${inT} | ${outT} | ${cost} |`
  })
  const axisHeadings = RUBRIC_AXES.map((a) => a.replace(/_/g, " "))
  const scoresHeader = [
    `| kind | ${axisHeadings.join(" | ")} | total |`,
    `| --- | ${RUBRIC_AXES.map(() => "---").join(" | ")} | --- |`,
  ]
  const scoresRows = sorted.map((r) => {
    const axes = RUBRIC_AXES.map((a) => String(r.score[a] as number)).join(
      " | ",
    )
    return `| ${r.styleName} | ${axes} | **${r.total}** |`
  })
  const notes = sorted.map((r) => {
    const heading = `### ${basename(r.planDir)}/${r.dirName} — ${formatSpec(r.spec.model, r.spec.effort)} (${r.styleName})`
    const bullets = RUBRIC_AXES.map((axis) => {
      const note = r.score.notes[axis]?.trim() ?? ""
      const score = r.score[axis] as number
      return note
        ? `- **${axis}** (${score}): ${note}`
        : `- **${axis}** (${score}):`
    })
    return [heading, "", ...bullets].join("\n")
  })
  return [
    `# Repo evaluation — ${titleStyle}`,
    "",
    `Root: \`${rootDir}\``,
    `Plan dir(s):`,
    ...planDirs.map((p) => `- \`${p}\``),
    `Evaluator: ${formatSpec(evaluatorSpec.model, evaluatorSpec.effort)}`,
    "",
    "Cost estimates use `MODEL_PRICE_USD_PER_MTOK` in `scripts/fixtures/constants.ts`; update it as Anthropic pricing changes.",
    "",
    "## Summary",
    "",
    ...summaryHeader,
    ...summaryRows,
    "",
    "## Scores",
    "",
    ...scoresHeader,
    ...scoresRows,
    "",
    "## Notes",
    "",
    ...notes,
    "",
  ].join("\n")
}

interface PlanContext {
  planDir: string
  planText: string
  projectText: string
  styleName: string
  styleDescription: string
}

function loadPlanContext(
  cache: Map<string, PlanContext>,
  repoDir: string,
): PlanContext {
  const planDir = dirname(repoDir)
  const cached = cache.get(planDir)
  if (cached) return cached
  const planPath = resolve(planDir, PLAN_BASENAME)
  if (!existsSync(planPath)) {
    fail(
      `no plan.md in repo's parent dir: ${planDir} (expected at ${planPath})`,
    )
  }
  const planText = readFileSync(planPath, "utf8")
  const { meta } = markdownToPlan(planText)
  const projectPath = resolve(planDir, meta.projectFile)
  if (!existsSync(projectPath)) fail(`project file not found: ${projectPath}`)
  const projectText = readFileSync(projectPath, "utf8")
  const styleDescription = loadSection("planner/style", meta.style)
  const ctx: PlanContext = {
    planDir,
    planText,
    projectText,
    styleName: meta.style,
    styleDescription,
  }
  cache.set(planDir, ctx)
  return ctx
}

export interface EvaluateOpts {
  rootDir: string
  evaluatorSpec: ModelSpec
  outPath: string | null
}

export async function runEvaluate(opts: EvaluateOpts): Promise<string> {
  if (!isDir(opts.rootDir)) fail(`not a directory: ${opts.rootDir}`)
  const repoDirs = findRepoDirs(opts.rootDir)
  if (repoDirs.length === 0) {
    fail(
      `no repo dirs under ${opts.rootDir} (looking for directories containing ${STATE_BASENAME})`,
    )
  }

  process.stdout.write(
    `evaluate: ${repoDirs.length} repo(s) under ${opts.rootDir}, evaluator=${formatSpec(
      opts.evaluatorSpec.model,
      opts.evaluatorSpec.effort,
    )}\n`,
  )

  const planCache = new Map<string, PlanContext>()
  const reports: RepoReport[] = []
  for (const repoDir of repoDirs) {
    const name = basename(repoDir)
    const ctx = loadPlanContext(planCache, repoDir)
    const spec = parseRepoDirCode(name)
    if (!spec) {
      process.stdout.write(
        `evaluate: skipping ${basename(ctx.planDir)}/${name} (unrecognised repo dir name)\n`,
      )
      continue
    }
    const rounds = readState(repoDir)
    const totalUsage = aggregateUsage(rounds)
    const estCost = estimateCost(spec.model, totalUsage)

    const tree = gitLs(repoDir)
    const files = readFiles(repoDir, tree)
    const logText = gitLog(repoDir)

    const prompt = buildPrompt({
      project: ctx.projectText,
      plan: ctx.planText,
      styleName: ctx.styleName,
      styleDescription: ctx.styleDescription,
      repoTree: tree,
      repoFiles: files,
      gitLogText: logText,
    })

    process.stdout.write(
      `evaluate: scoring ${basename(ctx.planDir)}/${name}…\n`,
    )
    const { reply } = await runAgent(prompt, {
      model: opts.evaluatorSpec.model,
      ...effortOption(opts.evaluatorSpec.effort),
      cwd: repoDir,
      permissionMode: "default",
      allowedTools: [],
      systemPrompt: { type: "preset", preset: "claude_code" },
    })
    const score = parseScore(reply)
    reports.push({
      repoDir,
      dirName: name,
      planDir: ctx.planDir,
      styleName: ctx.styleName,
      spec,
      rounds: rounds.length,
      totalUsage,
      estCost,
      score,
      total: totalScore(score),
    })
  }

  if (reports.length === 0) {
    fail(
      `no repos with recognised m<code>-o<digit> names under ${opts.rootDir}`,
    )
  }

  const out = renderReport(opts.evaluatorSpec, opts.rootDir, reports)
  const resolvedOutPath =
    opts.outPath ?? resolve(opts.rootDir, EVALUATE_BASENAME)
  writeFileSync(resolvedOutPath, out)
  process.stdout.write(`evaluate: wrote ${resolvedOutPath}\n`)
  return resolvedOutPath
}
