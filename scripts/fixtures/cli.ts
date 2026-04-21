import { parseArgs as nodeParseArgs } from "node:util"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import {
  DEFAULT_CODER_LEVEL,
  DEFAULT_COMMENTS,
  DEFAULT_COMPLEXITY,
  DEFAULT_MC,
  DEFAULT_MP,
  DEFAULT_REVIEW_FREQUENCY,
  DEFAULT_ROUNDS,
  DEFAULT_STUDENTS,
  MAX_CODER_LEVEL,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_REVIEW_FREQUENCY,
  MAX_STUDENTS,
  MIN_CODER_LEVEL,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_REVIEW_FREQUENCY,
  MIN_STUDENTS,
  type ModelName,
} from "./constants"
import { fail } from "./log"

export type Subcommand = "project" | "plan" | "repo" | "all"

export interface CommonOpts {
  verbosity: number
  help: boolean
}

export interface ProjectOpts extends CommonOpts {
  subcommand: "project"
  complexity: number
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
}

export interface PlanOpts extends CommonOpts {
  subcommand: "plan"
  fromPath: string
  rounds: number
  students: number
  reviewFrequency: number
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
      "three stages, each independently invocable:",
      "",
      "  project   Generate _projects/<name>.md (name + assignment).",
      "  plan      Generate _plans/<postfix>-<name>.md (team + commits) for a",
      "            given project.",
      "  repo      Run one Coder sub-agent per commit against a plan to produce",
      "            a git repo under ../student-repos/<name>-<postfix>/.",
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
function validateFromPath(v: string | undefined, subcommand: string): string {
  if (!v) fail(`${subcommand} requires --from=PATH`)
  return v
}

function parseProject(argv: string[]): ProjectOpts {
  const { values: v } = runNodeParseArgs(argv, {
    complexity: { type: "string", short: "c" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const complexity =
    v.complexity !== undefined ? Number(v.complexity) : DEFAULT_COMPLEXITY
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULT_MP,
    "-m/--model",
  )
  if (!common.help) validateComplexity(complexity)
  return {
    ...common,
    subcommand: "project",
    complexity,
    plannerModel: m.model,
    plannerEffort: m.effort,
  }
}

function parsePlan(argv: string[]): PlanOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    rounds: { type: "string", short: "r" },
    students: { type: "string", short: "s" },
    "review-frequency": { type: "string", short: "f" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const rounds = v.rounds !== undefined ? Number(v.rounds) : DEFAULT_ROUNDS
  const students =
    v.students !== undefined ? Number(v.students) : DEFAULT_STUDENTS
  const reviewFrequency =
    v["review-frequency"] !== undefined
      ? Number(v["review-frequency"])
      : DEFAULT_REVIEW_FREQUENCY
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULT_MP,
    "-m/--model",
  )
  if (!common.help) {
    validateFromPath(v.from as string | undefined, "plan")
    validateRounds(rounds)
    validateStudents(students)
    validateReviewFrequency(reviewFrequency)
  }
  return {
    ...common,
    subcommand: "plan",
    fromPath: (v.from as string | undefined) ?? "",
    rounds,
    students,
    reviewFrequency,
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
      : DEFAULT_CODER_LEVEL
  const comments =
    v.comments !== undefined ? Number(v.comments) : DEFAULT_COMMENTS
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULT_MC,
    "-m/--model",
  )
  if (!common.help) {
    validateFromPath(v.from as string | undefined, "repo")
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
    "review-frequency": { type: "string", short: "f" },
    comments: { type: "string" },
    mp: { type: "string" },
    mc: { type: "string" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const rounds = v.rounds !== undefined ? Number(v.rounds) : DEFAULT_ROUNDS
  const complexity =
    v.complexity !== undefined ? Number(v.complexity) : DEFAULT_COMPLEXITY
  const students =
    v.students !== undefined ? Number(v.students) : DEFAULT_STUDENTS
  const coderLevel =
    v["coder-level"] !== undefined
      ? Number(v["coder-level"])
      : DEFAULT_CODER_LEVEL
  const comments =
    v.comments !== undefined ? Number(v.comments) : DEFAULT_COMMENTS
  const reviewFrequency =
    v["review-frequency"] !== undefined
      ? Number(v["review-frequency"])
      : DEFAULT_REVIEW_FREQUENCY
  const mp = parseModelCode((v.mp as string | undefined) ?? DEFAULT_MP, "--mp")
  const mc = parseModelCode((v.mc as string | undefined) ?? DEFAULT_MC, "--mc")
  if (!common.help) {
    validateRounds(rounds)
    validateComplexity(complexity)
    validateStudents(students)
    validateCoderLevel(coderLevel)
    validateComments(comments)
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
      "Generate a project (name + assignment) under _projects/.",
      "",
      "Options:",
      `  -c, --complexity=N   ${MIN_COMPLEXITY}-${MAX_COMPLEXITY} (default: ${DEFAULT_COMPLEXITY})`,
      `  -m, --model=CODE     Planner model (default: ${DEFAULT_MP})`,
      ...common,
    )
  } else if (sub === "plan") {
    lines.push(
      "Usage: fixture plan --from=<project.md> [options]",
      "",
      "Generate a plan (team + commits) for a project under _plans/.",
      "",
      "Options:",
      "      --from=PATH      Project .md file (required)",
      `  -r, --rounds=N       Build-commit count (default: ${DEFAULT_ROUNDS})`,
      `  -s, --students=N     ${MIN_STUDENTS}-${MAX_STUDENTS} (default: ${DEFAULT_STUDENTS})`,
      `  -f, --review-frequency=N  ${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}% per-build chance (default: ${DEFAULT_REVIEW_FREQUENCY})`,
      `  -m, --model=CODE     Planner model (default: ${DEFAULT_MP})`,
      ...common,
    )
  } else if (sub === "repo") {
    lines.push(
      "Usage: fixture repo --from=<plan.md> [options]",
      "",
      "Run Coder sub-agents against a plan to produce a git repo.",
      "",
      "Options:",
      "      --from=PATH      Plan .md file (required)",
      `  -l, --coder-level=N  ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL} (default: ${DEFAULT_CODER_LEVEL})`,
      `      --comments=N     ${MIN_COMMENTS}-${MAX_COMMENTS} (default: ${DEFAULT_COMMENTS})`,
      `  -m, --model=CODE     Coder model (default: ${DEFAULT_MC})`,
      ...common,
    )
  } else {
    lines.push(
      "Usage: fixture all [options]",
      "",
      "Generate project + plan + repo in one go.",
      "",
      "Options:",
      `  -r, --rounds=N       Build-commit count (default: ${DEFAULT_ROUNDS})`,
      `  -c, --complexity=N   ${MIN_COMPLEXITY}-${MAX_COMPLEXITY} (default: ${DEFAULT_COMPLEXITY})`,
      `  -s, --students=N     ${MIN_STUDENTS}-${MAX_STUDENTS} (default: ${DEFAULT_STUDENTS})`,
      `  -l, --coder-level=N  ${MIN_CODER_LEVEL}-${MAX_CODER_LEVEL} (default: ${DEFAULT_CODER_LEVEL})`,
      `  -f, --review-frequency=N  ${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}% (default: ${DEFAULT_REVIEW_FREQUENCY})`,
      `      --mp=CODE        Planner model (default: ${DEFAULT_MP})`,
      `      --mc=CODE        Coder model (default: ${DEFAULT_MC})`,
      `      --comments=N     ${MIN_COMMENTS}-${MAX_COMMENTS} (default: ${DEFAULT_COMMENTS})`,
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
