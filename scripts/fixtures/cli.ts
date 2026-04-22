import { parseArgs as nodeParseArgs } from "node:util"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import {
  MAX_CODER_LEVEL,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_INTERACTION,
  MAX_REVIEW_FREQUENCY,
  MAX_STUDENTS,
  MIN_CODER_LEVEL,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_INTERACTION,
  MIN_REVIEW_FREQUENCY,
  MIN_STUDENTS,
  type ModelName,
} from "./constants"
import { DEFAULTS } from "./defaults"
import { fail } from "./log"

export type Subcommand = "project" | "plan" | "repo" | "all"

export interface CommonOpts {
  verbosity: number
  help: boolean
}

export interface ProjectOpts extends CommonOpts {
  subcommand: "project"
  complexity: number
  coderLevel: number
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
}

export interface PlanOpts extends CommonOpts {
  subcommand: "plan"
  fromPath: string
  rounds: number
  students: number
  interaction: number
  reviewFrequency: number
  coderLevel: number
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
}

export interface RepoOpts extends CommonOpts {
  subcommand: "repo"
  fromPath: string
  coderLevel: number
  comments: number
  coderModel: ModelName
  coderEffort: EffortLevel | "none"
}

export interface AllOpts extends CommonOpts {
  subcommand: "all"
  rounds: number
  complexity: number
  students: number
  coderLevel: number
  comments: number
  interaction: number
  reviewFrequency: number
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
  coderModel: ModelName
  coderEffort: EffortLevel | "none"
}

export type Opts = ProjectOpts | PlanOpts | RepoOpts | AllOpts

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

export function parseModelCode(
  code: string,
  flag: string,
): { model: ModelName; effort: EffortLevel | "none" } {
  const resolved = MODEL_CODES[code]
  if (!resolved) {
    fail(
      `${flag}: unknown model code "${code}"; expected one of ${Object.keys(MODEL_CODES).join(", ")}`,
    )
  }
  return resolved
}

const MODEL_CODE_HELP = [
  "Model codes:",
  "              low   medium   high      xhigh   max",
  "  sonnet      21    22       23 | 2     —       —",
  "  opus        31    32       33 | 3     34      35",
  "",
  "  haiku = 1 (no thinking modes)",
]

export function printTopHelp(): void {
  process.stdout.write(
    [
      "Usage: fixture <subcommand> [options]",
      "",
      "Generate synthetic student-repo fixtures under ../student-repos/ in",
      "three stages, each independently invocable. Each (complexity, project)",
      "gets one folder: c<N>-<name>/ holds project.md, plan-<postfix>.md,",
      "and <postfix>/ repos. A .fixture-state.json in ../student-repos/",
      "remembers the last project/plan so plan/repo can skip --from.",
      "",
      "  project   Generate c<N>-<name>/project.md (name + assignment).",
      "  plan      Generate c<N>-<name>/<postfix>.md (team + commits) for a",
      "            given project.",
      "  repo      Run one Coder sub-agent per commit against a plan to produce",
      "            a git repo under c<N>-<name>/<postfix>/.",
      "  all       Run project, plan, and repo in sequence.",
      "",
      "Run 'fixture <subcommand> --help' for subcommand-specific options.",
      "",
      "Common options:",
      "  -v, --verbose        Print the plan to stdout. -vv additionally prints",
      "                       each Coder prompt and reply.",
      "  -h, --help           Show this help and exit.",
      "",
    ].join("\n"),
  )
}

function commonOptsFrom(
  v: Record<string, string | boolean | boolean[] | undefined>,
  doubleV: boolean,
): CommonOpts {
  return {
    verbosity: doubleV
      ? 2
      : Array.isArray(v.verbose) && v.verbose.length > 0
        ? 1
        : 0,
    help: v.help === true,
  }
}

interface ParsedArgs {
  values: Record<string, string | boolean | boolean[] | undefined>
}

function runNodeParseArgs(
  argv: string[],
  options: Parameters<typeof nodeParseArgs>[0]["options"],
): ParsedArgs {
  let doubleV = false
  const preprocessed = argv.filter((a) => {
    if (a === "-vv") {
      doubleV = true
      return false
    }
    return true
  })
  try {
    const parsed = nodeParseArgs({
      args: preprocessed,
      options,
      strict: true,
      tokens: true,
      allowPositionals: false,
    })
    const values = parsed.values as Record<
      string,
      string | boolean | boolean[] | undefined
    >
    if (doubleV) values.verbose = [true, true]
    return { values }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
}

function validateComplexity(n: number): void {
  if (!Number.isInteger(n) || n < MIN_COMPLEXITY || n > MAX_COMPLEXITY) {
    fail(
      `--complexity must be an integer ${MIN_COMPLEXITY}-${MAX_COMPLEXITY}, got "${n}"`,
    )
  }
}
function validateStudents(n: number): void {
  if (!Number.isInteger(n) || n < MIN_STUDENTS || n > MAX_STUDENTS) {
    fail(
      `--students must be an integer ${MIN_STUDENTS}-${MAX_STUDENTS}, got "${n}"`,
    )
  }
}
function validateRounds(n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    fail(`--rounds must be a positive integer, got "${n}"`)
  }
}
function validateCoderLevel(n: number): void {
  if (!Number.isInteger(n) || n < MIN_CODER_LEVEL || n > MAX_CODER_LEVEL) {
    fail(
      `--coder-level must be an integer ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL}, got "${n}"`,
    )
  }
}
function validateComments(n: number): void {
  if (!Number.isInteger(n) || n < MIN_COMMENTS || n > MAX_COMMENTS) {
    fail(
      `--comments must be an integer ${MIN_COMMENTS}-${MAX_COMMENTS}, got "${n}"`,
    )
  }
}
function validateInteraction(n: number): void {
  if (!Number.isInteger(n) || n < MIN_INTERACTION || n > MAX_INTERACTION) {
    fail(
      `--interaction must be an integer ${MIN_INTERACTION}-${MAX_INTERACTION}, got "${n}"`,
    )
  }
}
function validateReviewFrequency(n: number): void {
  if (
    !Number.isInteger(n) ||
    n < MIN_REVIEW_FREQUENCY ||
    n > MAX_REVIEW_FREQUENCY
  ) {
    fail(
      `--review-frequency must be an integer ${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}, got "${n}"`,
    )
  }
}
function parseProject(argv: string[]): ProjectOpts {
  const { values: v } = runNodeParseArgs(argv, {
    complexity: { type: "string", short: "c" },
    "coder-level": { type: "string", short: "l" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const complexity =
    v.complexity !== undefined ? Number(v.complexity) : DEFAULTS.complexity
  const coderLevel =
    v["coder-level"] !== undefined
      ? Number(v["coder-level"])
      : DEFAULTS.coderLevel
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULTS.mp,
    "-m/--model",
  )
  if (!common.help) {
    validateComplexity(complexity)
    validateCoderLevel(coderLevel)
  }
  return {
    ...common,
    subcommand: "project",
    complexity,
    coderLevel,
    plannerModel: m.model,
    plannerEffort: m.effort,
  }
}

function parsePlan(argv: string[]): PlanOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    rounds: { type: "string", short: "r" },
    students: { type: "string", short: "s" },
    interaction: { type: "string", short: "i" },
    "review-frequency": { type: "string", short: "f" },
    "coder-level": { type: "string", short: "l" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const rounds = v.rounds !== undefined ? Number(v.rounds) : DEFAULTS.rounds
  const students =
    v.students !== undefined ? Number(v.students) : DEFAULTS.students
  const interaction =
    v.interaction !== undefined ? Number(v.interaction) : DEFAULTS.interaction
  const reviewFrequency =
    v["review-frequency"] !== undefined
      ? Number(v["review-frequency"])
      : DEFAULTS.reviewFrequency
  const coderLevel =
    v["coder-level"] !== undefined
      ? Number(v["coder-level"])
      : DEFAULTS.coderLevel
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULTS.mp,
    "-m/--model",
  )
  if (!common.help) {
    validateRounds(rounds)
    validateStudents(students)
    validateInteraction(interaction)
    validateReviewFrequency(reviewFrequency)
    validateCoderLevel(coderLevel)
  }
  return {
    ...common,
    subcommand: "plan",
    fromPath: (v.from as string | undefined) ?? "",
    rounds,
    students,
    interaction,
    reviewFrequency,
    coderLevel,
    plannerModel: m.model,
    plannerEffort: m.effort,
  }
}

function parseRepo(argv: string[]): RepoOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    "coder-level": { type: "string", short: "l" },
    comments: { type: "string" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const coderLevel =
    v["coder-level"] !== undefined
      ? Number(v["coder-level"])
      : DEFAULTS.coderLevel
  const comments =
    v.comments !== undefined ? Number(v.comments) : DEFAULTS.comments
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULTS.mc,
    "-m/--model",
  )
  if (!common.help) {
    validateCoderLevel(coderLevel)
    validateComments(comments)
  }
  return {
    ...common,
    subcommand: "repo",
    fromPath: (v.from as string | undefined) ?? "",
    coderLevel,
    comments,
    coderModel: m.model,
    coderEffort: m.effort,
  }
}

function parseAll(argv: string[]): AllOpts {
  const { values: v } = runNodeParseArgs(argv, {
    rounds: { type: "string", short: "r" },
    complexity: { type: "string", short: "c" },
    students: { type: "string", short: "s" },
    "coder-level": { type: "string", short: "l" },
    interaction: { type: "string", short: "i" },
    "review-frequency": { type: "string", short: "f" },
    comments: { type: "string" },
    mp: { type: "string" },
    mc: { type: "string" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const rounds = v.rounds !== undefined ? Number(v.rounds) : DEFAULTS.rounds
  const complexity =
    v.complexity !== undefined ? Number(v.complexity) : DEFAULTS.complexity
  const students =
    v.students !== undefined ? Number(v.students) : DEFAULTS.students
  const coderLevel =
    v["coder-level"] !== undefined
      ? Number(v["coder-level"])
      : DEFAULTS.coderLevel
  const comments =
    v.comments !== undefined ? Number(v.comments) : DEFAULTS.comments
  const interaction =
    v.interaction !== undefined ? Number(v.interaction) : DEFAULTS.interaction
  const reviewFrequency =
    v["review-frequency"] !== undefined
      ? Number(v["review-frequency"])
      : DEFAULTS.reviewFrequency
  const mp = parseModelCode((v.mp as string | undefined) ?? DEFAULTS.mp, "--mp")
  const mc = parseModelCode((v.mc as string | undefined) ?? DEFAULTS.mc, "--mc")
  if (!common.help) {
    validateRounds(rounds)
    validateComplexity(complexity)
    validateStudents(students)
    validateCoderLevel(coderLevel)
    validateComments(comments)
    validateInteraction(interaction)
    validateReviewFrequency(reviewFrequency)
  }
  return {
    ...common,
    subcommand: "all",
    rounds,
    complexity,
    students,
    coderLevel,
    comments,
    interaction,
    reviewFrequency,
    plannerModel: mp.model,
    plannerEffort: mp.effort,
    coderModel: mc.model,
    coderEffort: mc.effort,
  }
}

export function printSubcommandHelp(sub: Subcommand): void {
  const common = [
    "  -v, --verbose        Print plan to stdout; -vv also prints Coder prompts/replies",
    "  -h, --help           Show this help and exit",
  ]
  const lines: string[] = []
  if (sub === "project") {
    lines.push(
      "Usage: fixture project [options]",
      "",
      "Generate a project (name + assignment) at c<N>-<name>/project.md.",
      "",
      "Options:",
      `  -c, --complexity=N   ${MIN_COMPLEXITY}-${MAX_COMPLEXITY} (default: ${DEFAULTS.complexity})`,
      `  -l, --coder-level=N  ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL} (default: ${DEFAULTS.coderLevel}); 0 = AI-coders mode (no student framing)`,
      `  -m, --model=CODE     Planner model (default: ${DEFAULTS.mp})`,
      ...common,
    )
  } else if (sub === "plan") {
    lines.push(
      "Usage: fixture plan [--from=<project.md>] [options]",
      "",
      "Generate a plan (team + commits) next to the project file, as",
      "c<N>-<name>/plan-<postfix>.md. Without --from, falls back to the",
      "project recorded in ../student-repos/.fixture-state.json (set by the",
      "most recent `fixture project` or `fixture plan`).",
      "",
      "Options:",
      "      --from=PATH      Project .md file or c<N>-<name>/ dir (absolute,",
      "                       or relative to ../student-repos/). Optional if",
      "                       .fixture-state.json has a project.",
      `  -r, --rounds=N       Build-commit count (default: ${DEFAULTS.rounds})`,
      `  -s, --students=N     ${MIN_STUDENTS}-${MAX_STUDENTS} (default: ${DEFAULTS.students})`,
      `  -i, --interaction=N  ${MIN_INTERACTION}-${MAX_INTERACTION} (default: ${DEFAULTS.interaction}) — cross-module editing (ignored at -l 0)`,
      `  -f, --review-frequency=N  ${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}% per-build chance (default: ${DEFAULTS.reviewFrequency})`,
      `  -l, --coder-level=N  ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL} (default: ${DEFAULTS.coderLevel}); 0 = AI-coders mode`,
      `  -m, --model=CODE     Planner model (default: ${DEFAULTS.mp})`,
      ...common,
    )
  } else if (sub === "repo") {
    lines.push(
      "Usage: fixture repo [--from=<plan.md>] [options]",
      "",
      "Run Coder sub-agents against a plan to produce a git repo at",
      "c<N>-<name>/<postfix>/. --from can also point at a c<N>-<name>/",
      "directory when it contains exactly one plan-*.md file. Without --from,",
      "falls back to the plan recorded in ../student-repos/.fixture-state.json",
      "(set by the most recent `fixture plan`).",
      "",
      "Options:",
      "      --from=PATH      Plan .md file or c<N>-<name>/ dir (absolute,",
      "                       or relative to ../student-repos/). Optional if",
      "                       .fixture-state.json has a plan.",
      `  -l, --coder-level=N  ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL} (default: ${DEFAULTS.coderLevel}); must match plan's level`,
      `      --comments=N     ${MIN_COMMENTS}-${MAX_COMMENTS} (default: ${DEFAULTS.comments}) (ignored at -l 0)`,
      `  -m, --model=CODE     Coder model (default: ${DEFAULTS.mc})`,
      ...common,
    )
  } else {
    lines.push(
      "Usage: fixture all [options]",
      "",
      "Generate project + plan + repo in one go.",
      "",
      "Options:",
      `  -r, --rounds=N       Build-commit count (default: ${DEFAULTS.rounds})`,
      `  -c, --complexity=N   ${MIN_COMPLEXITY}-${MAX_COMPLEXITY} (default: ${DEFAULTS.complexity})`,
      `  -s, --students=N     ${MIN_STUDENTS}-${MAX_STUDENTS} (default: ${DEFAULTS.students})`,
      `  -l, --coder-level=N  ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL} (default: ${DEFAULTS.coderLevel}); 0 = AI-coders mode (no student framing)`,
      `  -i, --interaction=N  ${MIN_INTERACTION}-${MAX_INTERACTION} (default: ${DEFAULTS.interaction}) — cross-module editing (ignored at -l 0)`,
      `  -f, --review-frequency=N  ${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}% per-build chance (default: ${DEFAULTS.reviewFrequency})`,
      `      --mp=CODE        Planner model (default: ${DEFAULTS.mp})`,
      `      --mc=CODE        Coder model (default: ${DEFAULTS.mc})`,
      `      --comments=N     ${MIN_COMMENTS}-${MAX_COMMENTS} (default: ${DEFAULTS.comments}) (ignored at -l 0)`,
      ...common,
    )
  }
  lines.push("", ...MODEL_CODE_HELP, "")
  process.stdout.write(lines.join("\n"))
}

export function parseArgs(argv: string[]): Opts {
  const [sub, ...rest] = argv
  if (!sub || sub === "-h" || sub === "--help") {
    printTopHelp()
    process.exit(0)
  }
  if (sub !== "project" && sub !== "plan" && sub !== "repo" && sub !== "all") {
    fail(`unknown subcommand "${sub}"; expected project | plan | repo | all`)
  }
  const opts =
    sub === "project"
      ? parseProject(rest)
      : sub === "plan"
        ? parsePlan(rest)
        : sub === "repo"
          ? parseRepo(rest)
          : parseAll(rest)
  if (opts.help) {
    printSubcommandHelp(sub)
    process.exit(0)
  }
  return opts
}
