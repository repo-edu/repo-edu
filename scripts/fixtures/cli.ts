import { parseArgs as nodeParseArgs } from "node:util"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import {
  COMMENTS_FREE_TIER,
  MAX_CODER_EXPERIENCE,
  MAX_CODER_INTERACTION,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_REVIEW_FREQUENCY,
  MAX_STUDENTS,
  MIN_CODER_EXPERIENCE,
  MIN_CODER_INTERACTION,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_REVIEW_FREQUENCY,
  MIN_STUDENTS,
  type ModelName,
} from "./constants"
import { DEFAULTS } from "./defaults"
import { fail } from "./log"

export type Subcommand = "project" | "plan" | "repo"

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
  coderInteraction: number
  reviewFrequency: number
  aiCoders: boolean
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
}

export interface RepoOpts extends CommonOpts {
  subcommand: "repo"
  fromPath: string
  coderExperience: number
  coderExperienceExplicit: boolean
  comments: number
  coderModel: ModelName
  coderEffort: EffortLevel | "none"
}

export type Opts = ProjectOpts | PlanOpts | RepoOpts

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

const TOP_OVERVIEW_LINES = [
  "Usage: fixture <subcommand> [options]",
  "",
  "Generate synthetic coder-team repo fixtures with AI agents:",
  "",
  "  project   Invent a project (name + assignment) → project.md.",
  "  plan      Generate a team and commit timeline for a given",
  "            project → plan-<postfix>.md.",
  "  repo      Run one Coder sub-agent per planned commit against a",
  "            plan → a git repo.",
  "",
  "Options:",
  "  -h, --help                         Show this top-level help and exit",
  "  -hh                                Show the full help (every subcommand)",
  "                                     and exit",
  "",
  "Output layout under ../student-repos/ for the example session below:",
  "",
  "  c2-flash-card-quiz/               # one folder per project",
  "    project.md                      # from `fixture project`",
  "    plan-ai-c2-s3-r6-i2.md          # from `fixture plan`",
  "    m23-ai-f30-c2-s3-r6/            # git repo from `fixture repo`",
  "",
  "The folder is named c<N>-<name>, where <N> is the project's",
  "complexity tier (1-4) and <name> is the kebab-case name the",
  "planner invented. Plan and repo names encode their run parameters",
  "as a <postfix>, so one project folder can hold multiple plans and",
  "repos generated from different settings.",
  "",
  "../student-repos/.fixture-state.json caches the most recent",
  "project and plan, so a typical session needs no --from flags:",
  "",
  "  fixture project -c 2",
  "  fixture plan -s 3 -r 6",
  "  fixture repo",
  "",
  "Run 'fixture <subcommand> --help' for a single subcommand's options.",
]

export function printTopHelp(): void {
  process.stdout.write(`${TOP_OVERVIEW_LINES.join("\n")}\n`)
}

export function printFullHelp(): void {
  const sections = [
    subcommandHelpBody("project").join("\n"),
    subcommandHelpBody("plan").join("\n"),
    subcommandHelpBody("repo").join("\n"),
    MODEL_CODE_HELP.join("\n"),
  ]
  process.stdout.write(`${sections.join("\n\n")}\n`)
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

function resolveAiCoders(
  v: Record<string, string | boolean | boolean[] | undefined>,
): boolean {
  if (v["ai-coders"] === true) return true
  if (v["no-ai-coders"] === true) return false
  return DEFAULTS.aiCoders
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
function validateCoderExperience(n: number): void {
  if (
    !Number.isInteger(n) ||
    n < MIN_CODER_EXPERIENCE ||
    n > MAX_CODER_EXPERIENCE
  ) {
    fail(
      `--coder-experience must be an integer ${MIN_CODER_EXPERIENCE}-${MAX_CODER_EXPERIENCE}, got "${n}"`,
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
function validateCoderInteraction(n: number): void {
  if (
    !Number.isInteger(n) ||
    n < MIN_CODER_INTERACTION ||
    n > MAX_CODER_INTERACTION
  ) {
    fail(
      `--coder-interaction must be an integer ${MIN_CODER_INTERACTION}-${MAX_CODER_INTERACTION}, got "${n}"`,
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

const aiCodersFlag = {
  "ai-coders": { type: "boolean" as const, short: "a" },
  "no-ai-coders": { type: "boolean" as const },
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
    v.complexity !== undefined ? Number(v.complexity) : DEFAULTS.complexity
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULTS.mp,
    "-m/--model",
  )
  if (!common.help) {
    validateComplexity(complexity)
  }
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
    "coder-interaction": { type: "string", short: "i" },
    "review-frequency": { type: "string", short: "f" },
    model: { type: "string", short: "m" },
    ...aiCodersFlag,
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const rounds = v.rounds !== undefined ? Number(v.rounds) : DEFAULTS.rounds
  const students =
    v.students !== undefined ? Number(v.students) : DEFAULTS.students
  const coderInteraction =
    v["coder-interaction"] !== undefined
      ? Number(v["coder-interaction"])
      : DEFAULTS.coderInteraction
  const reviewFrequency =
    v["review-frequency"] !== undefined
      ? Number(v["review-frequency"])
      : DEFAULTS.reviewFrequency
  const aiCoders = resolveAiCoders(v)
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULTS.mp,
    "-m/--model",
  )
  if (!common.help) {
    validateRounds(rounds)
    validateStudents(students)
    validateCoderInteraction(coderInteraction)
    validateReviewFrequency(reviewFrequency)
  }
  return {
    ...common,
    subcommand: "plan",
    fromPath: (v.from as string | undefined) ?? "",
    rounds,
    students,
    coderInteraction,
    reviewFrequency,
    aiCoders,
    plannerModel: m.model,
    plannerEffort: m.effort,
  }
}

function parseRepo(argv: string[]): RepoOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    "coder-experience": { type: "string", short: "x" },
    comments: { type: "string" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v, false)
  const coderExperienceExplicit = v["coder-experience"] !== undefined
  const coderExperience = coderExperienceExplicit
    ? Number(v["coder-experience"])
    : DEFAULTS.coderExperience
  const comments =
    v.comments !== undefined ? Number(v.comments) : DEFAULTS.comments
  const m = parseModelCode(
    (v.model as string | undefined) ?? DEFAULTS.mc,
    "-m/--model",
  )
  if (!common.help) {
    validateCoderExperience(coderExperience)
    validateComments(comments)
  }
  return {
    ...common,
    subcommand: "repo",
    fromPath: (v.from as string | undefined) ?? "",
    coderExperience,
    coderExperienceExplicit,
    comments,
    coderModel: m.model,
    coderEffort: m.effort,
  }
}

const aiCodersHelp = (): string =>
  `  -a, --ai-coders / --no-ai-coders   AI-coders mode (no student framing) (default: ${DEFAULTS.aiCoders ? "--ai-coders" : "--no-ai-coders"})`

function subcommandHelpBody(sub: Subcommand): string[] {
  const helpLine =
    "  -h, --help                         Show this help and exit"
  if (sub === "project") {
    return [
      "Usage: fixture project [options]",
      "",
      "Generate a project (name + assignment) at c<N>-<name>/project.md.",
      "",
      "Options:",
      `  -m, --model=CODE                   Planner model (default: ${DEFAULTS.mp})`,
      `  -c, --complexity=N                 ${MIN_COMPLEXITY}-${MAX_COMPLEXITY} (default: ${DEFAULTS.complexity})`,
      "  -v, --verbose                      Print project to stdout; -vv also prints Planner prompt/reply",
      helpLine,
    ]
  }
  if (sub === "plan") {
    return [
      "Usage: fixture plan [--from=<project.md>] [options]",
      "",
      "Generate a plan (team + commits) next to the project file, as",
      "c<N>-<name>/plan-<postfix>.md. Without --from, falls back to the",
      "project recorded in ../student-repos/.fixture-state.json (set by the",
      "most recent `fixture project` or `fixture plan`).",
      "",
      "Options:",
      "      --from=PATH                    Project .md file or c<N>-<name>/ dir (absolute,",
      "                                     or relative to ../student-repos/). Optional if",
      "                                     .fixture-state.json has a project.",
      `  -m, --model=CODE                   Planner model (default: ${DEFAULTS.mp})`,
      `  -s, --students=N                   ${MIN_STUDENTS}-${MAX_STUDENTS} (default: ${DEFAULTS.students})`,
      `  -r, --rounds=N                     Build-commit count (default: ${DEFAULTS.rounds})`,
      `  -i, --coder-interaction=N          ${MIN_CODER_INTERACTION}-${MAX_CODER_INTERACTION} (default: ${DEFAULTS.coderInteraction}) — cross-module author mixing`,
      `  -f, --review-frequency=N           ${MIN_REVIEW_FREQUENCY}-${MAX_REVIEW_FREQUENCY}% per-build chance (default: ${DEFAULTS.reviewFrequency})`,
      aiCodersHelp(),
      "  -v, --verbose                      Print plan to stdout; -vv also prints Planner prompt/reply",
      helpLine,
    ]
  }
  return [
    "Usage: fixture repo [--from=<plan.md>] [options]",
    "",
    "Run Coder sub-agents against a plan to produce a git repo at",
    "c<N>-<name>/<postfix>/. --from can also point at a c<N>-<name>/",
    "directory when it contains exactly one plan-*.md file. Without --from,",
    "falls back to the plan recorded in ../student-repos/.fixture-state.json",
    "(set by the most recent `fixture plan`).",
    "",
    "Options:",
    "      --from=PATH                    Plan .md file or c<N>-<name>/ dir (absolute,",
    "                                     or relative to ../student-repos/). Optional if",
    "                                     .fixture-state.json has a plan.",
    `  -m, --model=CODE                   Coder model (default: ${DEFAULTS.mc})`,
    `  -x, --coder-experience=N           ${MIN_CODER_EXPERIENCE}-${MAX_CODER_EXPERIENCE} (default: ${DEFAULTS.coderExperience}); ignored when the plan is in AI-coders mode`,
    `      --comments=N                   ${MIN_COMMENTS}-${MAX_COMMENTS} (default: ${DEFAULTS.comments}); ${COMMENTS_FREE_TIER} leaves commenting to the coder`,
    "  -v, --verbose                      Print plan to stdout; -vv also prints Coder prompts/replies",
    helpLine,
  ]
}

export function printSubcommandHelp(sub: Subcommand): void {
  const lines = [...subcommandHelpBody(sub), "", ...MODEL_CODE_HELP, ""]
  process.stdout.write(lines.join("\n"))
}

export function parseArgs(argv: string[]): Opts {
  const [sub, ...rest] = argv
  if (sub === "-hh") {
    printFullHelp()
    process.exit(0)
  }
  if (!sub || sub === "-h" || sub === "--help") {
    printTopHelp()
    process.exit(0)
  }
  if (sub !== "project" && sub !== "plan" && sub !== "repo") {
    fail(`unknown subcommand "${sub}"; expected project | plan | repo`)
  }
  const opts =
    sub === "project"
      ? parseProject(rest)
      : sub === "plan"
        ? parsePlan(rest)
        : parseRepo(rest)
  if (opts.help) {
    printSubcommandHelp(sub)
    process.exit(0)
  }
  return opts
}
