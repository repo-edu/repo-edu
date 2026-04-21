import { spawnSync } from "node:child_process"
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs as nodeParseArgs } from "node:util"
import { type EffortLevel, query } from "@anthropic-ai/claude-agent-sdk"
import {
  type CommitKind,
  markdownToPlan,
  type Plan,
  type PlanMeta,
  type PlannedCommit,
  planToMarkdown,
} from "./plan-md"
import { loadPrompt, loadSection } from "./prompt-loader"

const DEFAULT_ROUNDS = 3
const DEFAULT_COMPLEXITY = 2
const MIN_COMPLEXITY = 1
const MAX_COMPLEXITY = 4
const DEFAULT_STUDENTS = 3
const MIN_STUDENTS = 1
const MAX_STUDENTS = 10
const DEFAULT_CODER_LEVEL = 2
const MIN_CODER_LEVEL = 1
const MAX_CODER_LEVEL = 4
const DEFAULT_COMMENTS = 1
const MIN_COMMENTS = 0
const MAX_COMMENTS = 3
const COMMENTS_FREE_TIER = 3
const DEFAULT_REVIEW_FREQUENCY = 30
const MIN_REVIEW_FREQUENCY = 0
const MAX_REVIEW_FREQUENCY = 100
const DEFAULT_MP = "33"
const DEFAULT_MC = "23"
const NO_CODER = "0"
const MODEL_EFFORTS = {
  haiku: [] as readonly EffortLevel[],
  sonnet: ["low", "medium", "high"] as readonly EffortLevel[],
  opus: ["low", "medium", "high", "xhigh", "max"] as readonly EffortLevel[],
} as const
type ModelName = keyof typeof MODEL_EFFORTS
const MODEL_DIGIT: Record<ModelName, number> = { haiku: 1, sonnet: 2, opus: 3 }
const EFFORT_DIGIT: Record<EffortLevel | "none", number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
}
const PLANS_SUBDIR = "_plans"
const LOG_BASENAME = "_log.md"
const STALE_FILES = ["_state.json", "_review.md", "_log.md"]
const GITIGNORE_LINES = ["_log.md", "_review.md", "_state.json", ".DS_Store"]

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "../..")
const STUDENT_REPOS = resolve(REPO_ROOT, "../student-repos")
const CODER_AGREEMENT = resolve(__dirname, "coder-agreement.md")

interface Opts {
  rounds: number
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  coderModel: ModelName | typeof NO_CODER
  coderEffort: EffortLevel | "none"
  complexity: number
  students: number
  coderLevel: number
  comments: number
  reviewFrequency: number
  planPath: string
  verbosity: number
  help: boolean
}

interface Usage {
  input_tokens: number
  output_tokens: number
  wall_ms: number
}

interface RoundRecord {
  commit_index: number
  author_index: number
  kind: CommitKind
  coder_summary: string
  usage: Usage
}

interface State {
  commit_index: number
  rounds: RoundRecord[]
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: create-fixture [options]",
      "",
      "Generate one synthetic student-repo fixture under ../student-repos/. A",
      "TypeScript orchestrator runs one planner turn via the Claude Agent SDK,",
      "then one Coder agent per commit.",
      "",
      "Options:",
      `  -r, --rounds=N       Build-commit count (positive integer, default: ${DEFAULT_ROUNDS})`,
      `  -c, --complexity=N   Project complexity index ${MIN_COMPLEXITY}-${MAX_COMPLEXITY} (default: ${DEFAULT_COMPLEXITY})`,
      `  -s, --students=N     Number of students in the group ${MIN_STUDENTS}-${MAX_STUDENTS} (default: ${DEFAULT_STUDENTS})`,
      `  -l, --coder-level=N  Coder skill ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL} (default: ${DEFAULT_CODER_LEVEL})`,
      "                       1=learning 2=basics 3=competent 4=experienced",
      `  -f, --review-frequency=N  Per-build chance (%) the next round is a review`,
      `                       (${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}, default: ${DEFAULT_REVIEW_FREQUENCY}). Reviews are extra rounds, not counted in -r`,
      `      --mp=MODEL-THINKING  Claude Code model for planner (default: ${DEFAULT_MP})`,
      `      --mc=MODEL-THINKING  Claude Code model for coder (default: ${DEFAULT_MC})`,
      `      --mc=${NO_CODER}               No coder; no repository created`,
      `      --comments=N     Comment tier ${MIN_COMMENTS}-${MAX_COMMENTS} (default: ${DEFAULT_COMMENTS})`,
      "                       0=no comments or docstrings  1=no docstrings",
      "                       2=no noise docstrings  3=no directive (Coder decides)",
      "      --plan=PATH      Reuse an archived plan .md file. Skips the planner.",
      "                       Cannot be combined with -r/-c/-s/-f/--mp.",
      "  -v, --verbose        Print the plan to stdout. -vv additionally prints each",
      "                       Coder prompt and reply.",
      "  -h, --help           Show this help and exit",
      "",
      "The plan and every Coder prompt/reply are always written to _log.md under",
      "../student-repos/.",
      "",
      "MODEL-THINKING codes:",
      "",
      "              low   medium   high      xhigh   max",
      "  sonnet      21    22       23 | 2     —       —",
      "  opus        31    32       33 | 3     34      35",
      "",
      "  haiku = 1 (no thinking modes)",
      "",
      "Examples:",
      "  pnpm create:fixture --rounds=5",
      "  pnpm create:fixture --complexity=3 --students=4",
      "  pnpm create:fixture -r 4 -c 3 -s 2 -f 50",
      "",
    ].join("\n"),
  )
}

function fail(msg: string): never {
  process.stderr.write(`create-fixture: ${msg}\n`)
  process.stderr.write("Run with --help for usage.\n")
  process.exit(2)
}

function parseArgs(argv: string[]): Opts {
  let doubleV = false
  const preprocessed = argv.filter((a) => {
    if (a === "-vv") {
      doubleV = true
      return false
    }
    return true
  })

  let parsed: ReturnType<typeof nodeParseArgs>
  try {
    parsed = nodeParseArgs({
      args: preprocessed,
      options: {
        rounds: { type: "string", short: "r" },
        complexity: { type: "string", short: "c" },
        students: { type: "string", short: "s" },
        "coder-level": { type: "string", short: "l" },
        mp: { type: "string" },
        mc: { type: "string" },
        "review-frequency": { type: "string", short: "f" },
        comments: { type: "string" },
        plan: { type: "string" },
        verbose: { type: "boolean", short: "v", multiple: true },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      tokens: true,
      allowPositionals: false,
    })
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }

  const { values, tokens = [] } = parsed
  const v = values as Record<string, string | boolean | boolean[] | undefined>
  const passed = new Set(
    tokens.flatMap((t) => (t.kind === "option" ? [t.name] : [])),
  )

  const mpCode = (v.mp as string | undefined) ?? DEFAULT_MP
  const mcCode = (v.mc as string | undefined) ?? DEFAULT_MC
  const planner = parseModelCode(mpCode, "planner")
  const coder = parseModelCode(mcCode, "coder")

  const opts: Opts = {
    rounds: v.rounds !== undefined ? Number(v.rounds) : DEFAULT_ROUNDS,
    plannerModel: planner.model as ModelName,
    plannerEffort: planner.effort,
    coderModel: coder.model as ModelName | typeof NO_CODER,
    coderEffort: coder.effort,
    complexity:
      v.complexity !== undefined ? Number(v.complexity) : DEFAULT_COMPLEXITY,
    students: v.students !== undefined ? Number(v.students) : DEFAULT_STUDENTS,
    coderLevel:
      v["coder-level"] !== undefined
        ? Number(v["coder-level"])
        : DEFAULT_CODER_LEVEL,
    comments: v.comments !== undefined ? Number(v.comments) : DEFAULT_COMMENTS,
    reviewFrequency:
      v["review-frequency"] !== undefined
        ? Number(v["review-frequency"])
        : DEFAULT_REVIEW_FREQUENCY,
    planPath: (v.plan as string | undefined) ?? "",
    verbosity: doubleV
      ? 2
      : Array.isArray(v.verbose) && v.verbose.length > 0
        ? 1
        : 0,
    help: v.help === true,
  }

  if (opts.planPath) {
    const conflicts: string[] = []
    if (passed.has("rounds")) conflicts.push("-r/--rounds")
    if (passed.has("complexity")) conflicts.push("-c/--complexity")
    if (passed.has("students")) conflicts.push("-s/--students")
    if (passed.has("review-frequency")) conflicts.push("-f/--review-frequency")
    if (passed.has("mp")) conflicts.push("--mp")
    if (conflicts.length > 0) {
      fail(`--plan cannot be combined with ${conflicts.join(", ")}`)
    }
  }
  if (!Number.isInteger(opts.rounds) || opts.rounds < 1) {
    fail(`--rounds must be a positive integer, got "${opts.rounds}"`)
  }
  if (
    !Number.isInteger(opts.complexity) ||
    opts.complexity < MIN_COMPLEXITY ||
    opts.complexity > MAX_COMPLEXITY
  ) {
    fail(
      `--complexity must be an integer ${MIN_COMPLEXITY}-${MAX_COMPLEXITY}, got "${opts.complexity}"`,
    )
  }
  if (
    !Number.isInteger(opts.students) ||
    opts.students < MIN_STUDENTS ||
    opts.students > MAX_STUDENTS
  ) {
    fail(
      `--students must be an integer ${MIN_STUDENTS}-${MAX_STUDENTS}, got "${opts.students}"`,
    )
  }
  if (
    !Number.isInteger(opts.coderLevel) ||
    opts.coderLevel < MIN_CODER_LEVEL ||
    opts.coderLevel > MAX_CODER_LEVEL
  ) {
    fail(
      `--coder-level must be an integer ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL}, got "${opts.coderLevel}"`,
    )
  }
  if (
    !Number.isInteger(opts.comments) ||
    opts.comments < MIN_COMMENTS ||
    opts.comments > MAX_COMMENTS
  ) {
    fail(
      `--comments must be an integer ${MIN_COMMENTS}-${MAX_COMMENTS}, got "${opts.comments}"`,
    )
  }
  if (
    !Number.isInteger(opts.reviewFrequency) ||
    opts.reviewFrequency < MIN_REVIEW_FREQUENCY ||
    opts.reviewFrequency > MAX_REVIEW_FREQUENCY
  ) {
    fail(
      `--review-frequency must be an integer ${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}, got "${opts.reviewFrequency}"`,
    )
  }
  return opts
}

const MODEL_CODES: Record<
  string,
  { model: ModelName; effort: EffortLevel | "none" }
> = {
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

function parseModelCode(
  code: string,
  role: "planner" | "coder",
): { model: string; effort: EffortLevel | "none" } {
  if (role === "coder" && code === NO_CODER) {
    return { model: NO_CODER, effort: "none" }
  }
  const resolved = MODEL_CODES[code]
  if (!resolved) {
    const flag = role === "planner" ? "--mp" : "--mc"
    const suffix = role === "coder" ? ` or "${NO_CODER}"` : ""
    fail(
      `${flag}: unknown model code "${code}"; expected one of ${Object.keys(MODEL_CODES).join(", ")}${suffix}`,
    )
  }
  return resolved
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function existingDirs(): string[] {
  if (!existsSync(STUDENT_REPOS)) return []
  return readdirSync(STUDENT_REPOS).filter(
    (n) => !n.startsWith(".") && !n.startsWith("_"),
  )
}

function sampleKindSequence(
  buildRounds: number,
  frequencyPct: number,
): CommitKind[] {
  const p = frequencyPct / 100
  const seq: CommitKind[] = []
  for (let i = 0; i < buildRounds; i++) {
    seq.push("build")
    if (Math.random() < p) seq.push("review")
  }
  return seq
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

let EMIT_STATE = { verbosity: 0, logPath: "" }

const ANSI_RESET = "\x1b[0m"
const ANSI_H1 = "\x1b[1;35m"
const ANSI_H2 = "\x1b[1;36m"
const ANSI_H3 = "\x1b[1;33m"

function colorizeForTTY(text: string): string {
  if (!process.stdout.isTTY) return text
  return text.replace(
    /^(#{1,3})(\s+.+)$/gm,
    (_, hashes: string, rest: string) => {
      const color =
        hashes.length === 1 ? ANSI_H1 : hashes.length === 2 ? ANSI_H2 : ANSI_H3
      return `${color}${hashes}${rest}${ANSI_RESET}`
    },
  )
}

function emit(level: 1 | 2, text: string): void {
  const block = text.endsWith("\n") ? text : `${text}\n`
  if (EMIT_STATE.verbosity >= level) process.stdout.write(colorizeForTTY(block))
  appendFileSync(EMIT_STATE.logPath, block)
}

async function withTicker<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const stream = process.stderr
  const start = Date.now()

  if (!stream.isTTY) {
    stream.write(`${label}\n`)
    return fn()
  }

  const render = () => {
    const secs = Math.floor((Date.now() - start) / 1000)
    stream.cursorTo(0)
    stream.write(`${label}  ${secs} s`)
    stream.clearLine(1)
  }
  render()
  const interval = setInterval(render, 1000)
  try {
    return await fn()
  } finally {
    clearInterval(interval)
    stream.cursorTo(0)
    stream.clearLine(0)
  }
}

function planPrompt(
  opts: Opts,
  existing: string[],
  kindSequence: CommitKind[],
): string {
  const sequenceLines = kindSequence
    .map((kind, i) => `${i + 1}. ${kind}`)
    .join("\n")
  return loadPrompt("planner/main", {
    rounds: String(opts.rounds),
    planned_count: String(kindSequence.length),
    kind_sequence: sequenceLines,
    complexity: String(opts.complexity),
    students: String(opts.students),
    max_author: String(opts.students - 1),
    today: today(),
    existing_dirs: JSON.stringify(existing),
  })
}

type QueryOptions = Parameters<typeof query>[0]["options"]

async function runAgent(
  prompt: string,
  options: QueryOptions,
): Promise<{ reply: string; usage: Usage }> {
  const start = Date.now()
  let reply = ""
  let inputTokens = 0
  let outputTokens = 0

  for await (const message of query({ prompt, options })) {
    if (message.type === "assistant" && message.message?.content) {
      reply = message.message.content
        .map((block: { type: string; text?: string }) =>
          block.type === "text" ? (block.text ?? "") : "",
        )
        .join("")
    } else if (message.type === "result") {
      if (message.subtype !== "success") {
        const detail =
          "result" in message && typeof message.result === "string"
            ? `: ${message.result}`
            : ""
        fail(`agent turn ended with subtype "${message.subtype}"${detail}`)
      }
      inputTokens = message.usage?.input_tokens ?? 0
      outputTokens = message.usage?.output_tokens ?? 0
      if ("result" in message && typeof message.result === "string") {
        reply = message.result
      }
    }
  }

  return {
    reply,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      wall_ms: Date.now() - start,
    },
  }
}

function effortOption(effort: string): { effort?: EffortLevel } {
  return effort === "none" ? {} : { effort: effort as EffortLevel }
}

function formatSpec(model: string, effort: string): string {
  if (model === NO_CODER) return NO_CODER
  return effort === "none" ? model : `${model}-${effort}`
}

function modelCode(model: ModelName, effort: EffortLevel | "none"): string {
  const m = MODEL_DIGIT[model]
  if (model === "haiku") return String(m)
  return `${m}${EFFORT_DIGIT[effort]}`
}

function repoPostfix(opts: Opts): string {
  const parts = [`mp${modelCode(opts.plannerModel, opts.plannerEffort)}`]
  if (opts.coderModel !== NO_CODER) {
    parts.push(`mc${modelCode(opts.coderModel, opts.coderEffort)}`)
  }
  parts.push(
    `l${opts.coderLevel}`,
    `c${opts.complexity}`,
    `s${opts.students}`,
    `r${opts.rounds}`,
  )
  if (opts.reviewFrequency > 0) parts.push(`f${opts.reviewFrequency}`)
  return `-${parts.join("-")}`
}

function nextAvailable(dir: string, base: string, ext = ""): string {
  if (!existsSync(resolve(dir, `${base}${ext}`))) return `${base}${ext}`
  let n = 2
  while (existsSync(resolve(dir, `${base}-v${n}${ext}`))) n++
  return `${base}-v${n}${ext}`
}

function stripJsonFences(text: string): string {
  const t = text.trim()
  if (!t.startsWith("```")) return t
  return t
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
}

async function generatePlan(
  opts: Opts,
  existing: string[],
  kindSequence: CommitKind[],
): Promise<{ plan: Plan; usage: Usage }> {
  const prompt = planPrompt(opts, existing, kindSequence)
  const { reply, usage } = await runAgent(prompt, {
    model: opts.plannerModel,
    ...effortOption(opts.plannerEffort),
    cwd: REPO_ROOT,
    maxTurns: 1,
    allowedTools: [],
    permissionMode: "bypassPermissions",
  })
  const plan = JSON.parse(stripJsonFences(reply)) as Plan
  validatePlan(plan, opts, kindSequence)
  return { plan, usage }
}

function validatePlan(
  plan: Plan,
  opts: Opts,
  kindSequence: CommitKind[],
): void {
  if (!plan.name || typeof plan.name !== "string") fail("plan.name missing")
  if (plan.team?.length !== opts.students) {
    fail(
      `plan.team must have ${opts.students} entries, got ${plan.team?.length}`,
    )
  }
  if (plan.commits?.length !== kindSequence.length) {
    fail(
      `plan.commits must have ${kindSequence.length} entries, got ${plan.commits?.length}`,
    )
  }
  for (let i = 0; i < plan.commits.length; i++) {
    const c = plan.commits[i]
    if (c.author_index < 0 || c.author_index >= opts.students) {
      fail(`commits[${i}].author_index out of range`)
    }
    if (c.kind !== kindSequence[i]) {
      fail(
        `commits[${i}].kind must be "${kindSequence[i]}" (from sampled sequence), got "${c.kind}"`,
      )
    }
  }
}

function teamPhrase(s: number): string {
  if (s === 1) return loadSection("coder/team-phrase", "solo")
  if (s === 2) return loadSection("coder/team-phrase", "pair")
  return loadSection("coder/team-phrase", "group", {
    teammate_count: String(s - 1),
  })
}

function composeCoderPrompt(
  plan: Plan,
  commit: PlannedCommit,
  opts: Opts,
  absPath: string,
): string {
  const persona = plan.team[commit.author_index]
  const coderLevelRules = loadSection("coder/level", String(opts.coderLevel))
  const commentsDirective =
    opts.comments === COMMENTS_FREE_TIER
      ? ""
      : loadSection("coder/comments", String(opts.comments))

  const ctx: Record<string, string> = {
    persona_name: persona.name,
    persona_email: persona.email,
    team_phrase: teamPhrase(opts.students),
    assignment: plan.assignment,
    abs_path: absPath,
    coder_agreement_path: CODER_AGREEMENT,
    area: persona.area,
    module: persona.module,
    ownership_suffix:
      opts.students > 1 ? ", but don't rewrite someone else's module" : "",
    round_goal: commit.note,
    coder_level_rules: coderLevelRules,
    comments_directive: commentsDirective,
    commit_date: commit.date,
  }

  return loadPrompt(
    commit.kind === "review" ? "coder/review" : "coder/build",
    ctx,
  )
}

function firstParagraph(reply: string): string {
  const trimmed = reply.trim()
  const endIdx = trimmed.search(/\n\s*\n/)
  return (endIdx > 0 ? trimmed.slice(0, endIdx) : trimmed).trim().slice(0, 500)
}

function writeGitignore(dir: string): void {
  writeFileSync(resolve(dir, ".gitignore"), `${GITIGNORE_LINES.join("\n")}\n`)
}

function writeReview(
  plan: Plan,
  state: State,
  opts: Opts,
  planUsage: Usage,
  runMs: number,
  dirName: string,
): void {
  const totalIn =
    planUsage.input_tokens +
    state.rounds.reduce((s, r) => s + r.usage.input_tokens, 0)
  const totalOut =
    planUsage.output_tokens +
    state.rounds.reduce((s, r) => s + r.usage.output_tokens, 0)
  const reviewCount = state.rounds.filter((r) => r.kind === "review").length

  const lines: string[] = [
    "# Run summary",
    "",
    `- Assignment: ${plan.name}`,
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

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }

  mkdirSync(STUDENT_REPOS, { recursive: true })
  for (const name of STALE_FILES) {
    rmSync(resolve(STUDENT_REPOS, name), { force: true })
  }

  const logPath = resolve(STUDENT_REPOS, LOG_BASENAME)
  writeFileSync(logPath, "")
  EMIT_STATE = { verbosity: opts.verbosity, logPath }

  const runStart = Date.now()
  let plan: Plan
  let planUsage: Usage = { input_tokens: 0, output_tokens: 0, wall_ms: 0 }

  if (opts.planPath) {
    const md = readFileSync(opts.planPath, "utf8")
    const pf = markdownToPlan(md)
    opts.rounds = pf.meta.rounds
    opts.complexity = pf.meta.complexity
    opts.students = pf.meta.students
    opts.reviewFrequency = pf.meta.reviewFrequency
    plan = pf.plan
    const kindSequence = pf.plan.commits.map((c) => c.kind)
    validatePlan(plan, opts, kindSequence)
    process.stderr.write(
      `create-fixture: loaded plan "${plan.name}" from ${opts.planPath}\n`,
    )
  } else {
    const existing = existingDirs()
    const kindSequence = sampleKindSequence(opts.rounds, opts.reviewFrequency)
    const reviewCount = kindSequence.length - opts.rounds
    process.stderr.write(
      `create-fixture: sampled kind sequence (${opts.rounds} builds + ${reviewCount} reviews)\n`,
    )
    const result = await withTicker("create-fixture: generating plan…", () =>
      generatePlan(opts, existing, kindSequence),
    )
    plan = result.plan
    planUsage = result.usage
    process.stderr.write(
      `create-fixture: plan ready (${formatSeconds(planUsage.wall_ms)}, cumulative ${formatSeconds(Date.now() - runStart)})\n`,
    )
    const meta: PlanMeta = {
      rounds: opts.rounds,
      complexity: opts.complexity,
      students: opts.students,
      reviewFrequency: opts.reviewFrequency,
    }
    const archiveDir = resolve(STUDENT_REPOS, PLANS_SUBDIR)
    mkdirSync(archiveDir, { recursive: true })
    const archiveName = nextAvailable(
      archiveDir,
      `${repoPostfix(opts).slice(1)}-${plan.name}`,
      ".md",
    )
    const archivePath = resolve(archiveDir, archiveName)
    writeFileSync(archivePath, planToMarkdown({ meta, plan }))
    process.stderr.write(`create-fixture: archived plan to ${archivePath}\n`)
  }

  emit(
    1,
    planToMarkdown({
      meta: {
        rounds: opts.rounds,
        complexity: opts.complexity,
        students: opts.students,
        reviewFrequency: opts.reviewFrequency,
      },
      plan,
    }),
  )

  if (opts.coderModel === NO_CODER) {
    const runMs = Date.now() - runStart
    process.stdout.write(
      `Planner-only run: plan "${plan.name}" archived. No coder was invoked.\n`,
    )
    process.stdout.write(
      `Wall time: ${formatSeconds(runMs)} | plan tokens in/out: ${planUsage.input_tokens} / ${planUsage.output_tokens}\n`,
    )
    return
  }
  const coderModel: ModelName = opts.coderModel

  const dirName = nextAvailable(
    STUDENT_REPOS,
    `${plan.name}${repoPostfix(opts)}`,
  )
  const dir = resolve(STUDENT_REPOS, dirName)
  mkdirSync(dir, { recursive: true })
  const gitInit = spawnSync("git", ["-C", dir, "init", "--template="], {
    stdio: "inherit",
  })
  if (gitInit.status !== 0) fail("git init failed")

  writeGitignore(dir)

  const state: State = { commit_index: 0, rounds: [] }
  const coderPersona = loadPrompt("coder/persona").trim()

  for (let i = 0; i < plan.commits.length; i++) {
    const commit = plan.commits[i]
    const prompt = composeCoderPrompt(plan, commit, opts, dir)
    emit(
      2,
      `\n## Round ${i + 1} · ${commit.kind} · author ${commit.author_index}\n\n### Prompt\n\n${prompt}`,
    )
    const { reply, usage } = await withTicker(
      `create-fixture: round ${i + 1}/${plan.commits.length} (${commit.kind}, author ${commit.author_index})…`,
      () =>
        runAgent(prompt, {
          model: coderModel,
          ...effortOption(opts.coderEffort),
          cwd: dir,
          permissionMode: "bypassPermissions",
          allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: coderPersona,
          },
        }),
    )
    emit(
      2,
      `\n### Reply\n\n${reply}\n\n### Usage\n\n- input_tokens: ${usage.input_tokens}\n- output_tokens: ${usage.output_tokens}\n- wall_ms: ${usage.wall_ms}`,
    )
    state.rounds.push({
      commit_index: i,
      author_index: commit.author_index,
      kind: commit.kind,
      coder_summary: firstParagraph(reply),
      usage,
    })
    state.commit_index = i + 1
    writeFileSync(
      resolve(STUDENT_REPOS, "_state.json"),
      `${JSON.stringify(state, null, 2)}\n`,
    )
    process.stderr.write(
      `create-fixture: round ${i + 1} done (${formatSeconds(usage.wall_ms)}, cumulative ${formatSeconds(Date.now() - runStart)})\n`,
    )
  }

  writeReview(plan, state, opts, planUsage, Date.now() - runStart, dirName)

  for (const name of STALE_FILES) {
    const src = resolve(STUDENT_REPOS, name)
    if (existsSync(src)) copyFileSync(src, resolve(dir, name))
  }
}

main().catch((err) => {
  process.stderr.write(
    `create-fixture: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
