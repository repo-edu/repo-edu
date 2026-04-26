import { parseArgs as nodeParseArgs } from "node:util"
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk"
import {
  COMMENTS_FREE_TIER,
  MAX_CODER_EXPERIENCE,
  MAX_CODER_INTERACTION,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_STUDENTS,
  MIN_CODER_EXPERIENCE,
  MIN_CODER_INTERACTION,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_REVIEWS,
  MIN_STUDENTS,
  type ModelName,
  STYLES,
  type Style,
} from "./constants"
import { SETTINGS, SETTINGS_PREAMBLE, settingsRowsForHelp } from "./defaults"
import { fail } from "./log"

export type Subcommand = "init" | "project" | "plan" | "repo" | "batch"

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
  reviews: number
  aiCoders: boolean
  style: Style
  plannerModel: ModelName
  plannerEffort: EffortLevel | "none"
}

export interface BatchOpts extends CommonOpts {
  subcommand: "batch"
  listPath: string
}

export interface InitOpts extends CommonOpts {
  subcommand: "init"
  force: boolean
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

export type Opts = ProjectOpts | PlanOpts | RepoOpts | BatchOpts | InitOpts

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
  "Model CODE (-m, --model=CODE):",
  "              low   medium   high      xhigh   max",
  "  sonnet      21    22       23 | 2     —       —",
  "  opus        31    32       33 | 3     34      35",
  "",
  "  haiku = 1 (no thinking modes)",
]

const OPT_DESC_COL = 31

const SETTINGS_BODY = [
  ...SETTINGS_PREAMBLE,
  "Format: JSONC (JSON with // comments and trailing commas).",
  "",
  "{",
  ...settingsRowsForHelp(SETTINGS),
  "}",
]

const TOP_OVERVIEW_LINES = [
  "Usage: fixture <subcommand> [options]",
  "",
  "Generate synthetic coder-team repo fixtures with AI agents through",
  "these subcommands:",
  "",
  "  init      Scaffold a default .fixture-settings.jsonc for editing.",
  "  project   Invent a project (name + assignment) → project.md.",
  "  plan      Generate a team and commit timeline for a given",
  "            project → <plan-postfix>/plan.md.",
  "  repo      Run one Coder sub-agent per planned commit against a",
  "            plan → a git repo.",
  "  batch     Drive plan+repo for many entries against a fixed",
  "            project, reading entries from a JSON list file.",
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
  "    ai-i2-bb-s3-r6-w2/              # one folder per plan",
  "      plan.md                       # from `fixture plan`",
  "      m23-o2/                       # git repo from `fixture repo`",
  "      .fixture-settings.jsonc       # snapshot of settings used",
  "      _log.md  _trace.md            # run log + per-round prompts/replies",
  "      _xtrace.md                    # full agent turn log",
  "      _review.md  _state.json       # review summary + per-round state",
  "",
  "The project folder is named c<N>-<name>, where <N> is the project's",
  "complexity tier (1-4) and <name> is the kebab-case name the",
  "planner invented. Each plan lives in its own subfolder named by the",
  "plan's <postfix>; repo names encode the coder-side run parameters.",
  "One project folder can hold multiple plans and one plan folder can",
  "hold multiple repos generated from different settings.",
  "",
  "../student-repos/.fixture-state.json caches the most recent",
  "project and plan, so a typical session needs no --from flags:",
  "",
  "  fixture project -c 2",
  "  fixture plan -s 3 -r 6",
  "  fixture repo",
  "",
  "Run 'fixture <subcommand> -h' for a single subcommand's options;",
  "'fixture init -h' shows the .fixture-settings.jsonc schema. Run",
  "'fixture -hh' for the full reference (every subcommand and the",
  "model-code table).",
]

export function printTopHelp(): void {
  process.stdout.write(`${TOP_OVERVIEW_LINES.join("\n")}\n`)
}

function indentBody(lines: string[], indent: string): string[] {
  return lines.map((line, i) => (i === 0 || !line ? line : indent + line))
}

export function printFullHelp(): void {
  const sections = [
    indentBody(subcommandHelpBody("init"), "  ").join("\n"),
    indentBody(subcommandHelpBody("project"), "  ").join("\n"),
    indentBody(subcommandHelpBody("plan"), "  ").join("\n"),
    indentBody(subcommandHelpBody("repo"), "  ").join("\n"),
    indentBody(subcommandHelpBody("batch"), "  ").join("\n"),
    MODEL_CODE_HELP.join("\n"),
  ]
  process.stdout.write(`${sections.join("\n\n")}\n`)
}

function commonOptsFrom(
  v: Record<string, string | boolean | boolean[] | undefined>,
): CommonOpts {
  const count = Array.isArray(v.verbose) ? v.verbose.length : 0
  const verbosity = Math.min(count, 3)
  return { verbosity, help: v.help === true }
}

interface ParsedArgs {
  values: Record<string, string | boolean | boolean[] | undefined>
}

function runNodeParseArgs(
  argv: string[],
  options: Parameters<typeof nodeParseArgs>[0]["options"],
): ParsedArgs {
  let extraV = 0
  const preprocessed = argv.filter((a) => {
    if (/^-v+$/.test(a) && a.length >= 3) {
      extraV += a.length - 1
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
    if (extraV > 0) {
      const existing = Array.isArray(values.verbose) ? values.verbose.length : 0
      values.verbose = Array(existing + extraV).fill(true)
    }
    return { values }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
}

function resolveAiCoders(
  v: Record<string, string | boolean | boolean[] | undefined>,
): boolean {
  const raw = v["ai-coders"]
  if (raw === undefined) return SETTINGS.aiCoders
  if (raw === "1") return true
  if (raw === "0") return false
  fail(`-a/--ai-coders must be 0 or 1, got "${String(raw)}"`)
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
function validateReviews(reviews: number, rounds: number): void {
  if (!Number.isInteger(reviews) || reviews < MIN_REVIEWS || reviews > rounds) {
    fail(
      `--reviews must be an integer ${MIN_REVIEWS}-${rounds} (≤ --rounds), got "${reviews}"`,
    )
  }
}
function validateStyle(s: string): void {
  if (!STYLES.includes(s as Style)) {
    fail(`--style must be one of ${STYLES.join(", ")}, got "${s}"`)
  }
}

const aiCodersFlag = {
  "ai-coders": { type: "string" as const, short: "a" },
}

function parseProject(argv: string[]): ProjectOpts {
  const { values: v } = runNodeParseArgs(argv, {
    complexity: { type: "string", short: "c" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  const complexity =
    v.complexity !== undefined ? Number(v.complexity) : SETTINGS.complexity
  const m = parseModelCode(
    (v.model as string | undefined) ?? SETTINGS.mp,
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
    reviews: { type: "string", short: "w" },
    style: { type: "string", short: "y" },
    model: { type: "string", short: "m" },
    ...aiCodersFlag,
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  const rounds = v.rounds !== undefined ? Number(v.rounds) : SETTINGS.rounds
  const students =
    v.students !== undefined ? Number(v.students) : SETTINGS.students
  const coderInteraction =
    v["coder-interaction"] !== undefined
      ? Number(v["coder-interaction"])
      : SETTINGS.coderInteraction
  const reviews = v.reviews !== undefined ? Number(v.reviews) : SETTINGS.reviews
  const style = (v.style as string | undefined) ?? SETTINGS.style
  const aiCoders = resolveAiCoders(v)
  const m = parseModelCode(
    (v.model as string | undefined) ?? SETTINGS.mp,
    "-m/--model",
  )
  if (!common.help) {
    validateRounds(rounds)
    validateStudents(students)
    validateCoderInteraction(coderInteraction)
    validateReviews(reviews, rounds)
    validateStyle(style)
  }
  return {
    ...common,
    subcommand: "plan",
    fromPath: (v.from as string | undefined) ?? "",
    rounds,
    students,
    coderInteraction,
    reviews,
    aiCoders,
    style: style as Style,
    plannerModel: m.model,
    plannerEffort: m.effort,
  }
}

function parseRepo(argv: string[]): RepoOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    "coder-experience": { type: "string", short: "x" },
    comments: { type: "string", short: "o" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  const coderExperienceExplicit = v["coder-experience"] !== undefined
  const coderExperience = coderExperienceExplicit
    ? Number(v["coder-experience"])
    : SETTINGS.coderExperience
  const comments =
    v.comments !== undefined ? Number(v.comments) : SETTINGS.comments
  const m = parseModelCode(
    (v.model as string | undefined) ?? SETTINGS.mc,
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

function opt(spec: string, ...descLines: string[]): string[] {
  const pad = Math.max(2, OPT_DESC_COL - spec.length)
  const out: string[] = [`${spec}${" ".repeat(pad)}${descLines[0]}`]
  for (const line of descLines.slice(1)) {
    out.push(`${" ".repeat(OPT_DESC_COL)}${line}`)
  }
  return out
}

const aiCodersHelp = (): string[] =>
  opt(
    "  -a, --ai-coders=0|1",
    `AI-coders mode (no student framing) (default: ${SETTINGS.aiCoders ? 1 : 0})`,
  )

function parseInit(argv: string[]): InitOpts {
  const { values: v } = runNodeParseArgs(argv, {
    force: { type: "boolean", short: "f" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  return {
    ...common,
    subcommand: "init",
    force: v.force === true,
  }
}

function parseBatch(argv: string[]): BatchOpts {
  let listPath: string | undefined
  const flagArgs: string[] = []
  for (const a of argv) {
    if (!a.startsWith("-") && listPath === undefined) listPath = a
    else flagArgs.push(a)
  }
  const { values: v } = runNodeParseArgs(flagArgs, {
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  if (!common.help && !listPath) {
    fail("batch requires a path to a batch file: fixture batch <list.json>")
  }
  return {
    ...common,
    subcommand: "batch",
    listPath: listPath ?? "",
  }
}

function subcommandHelpBody(sub: Subcommand): string[] {
  const helpLine = opt("  -h, --help", "Show this help and exit")
  if (sub === "init") {
    return [
      "Usage: fixture init [-f]",
      "",
      "Write a default ../student-repos/.fixture-settings.jsonc with all keys",
      "and inline JSONC comments. Refuses to overwrite an existing file",
      "unless -f / --force is given. Settings is also auto-created on the",
      "first project / plan / repo / batch run, so this subcommand is",
      "mainly useful to scaffold the file ahead of editing it.",
      "",
      ...SETTINGS_BODY,
      "",
      "Options:",
      ...opt("  -f, --force", "Overwrite an existing .fixture-settings.jsonc"),
      ...helpLine,
    ]
  }
  if (sub === "project") {
    return [
      "Usage: fixture project [options]",
      "",
      "Generate a project (name + assignment) at c<N>-<name>/project.md.",
      "",
      "Options:",
      ...opt("  -m, --model=CODE", `Planner model (default: ${SETTINGS.mp})`),
      ...opt(
        "  -c, --complexity=N",
        `${MIN_COMPLEXITY}-${MAX_COMPLEXITY} (default: ${SETTINGS.complexity})`,
      ),
      ...opt(
        "  -v, --verbose",
        "Print project to stdout; -vv adds Planner",
        "prompt/reply; -vvv adds full agent turns",
      ),
      ...helpLine,
    ]
  }
  if (sub === "plan") {
    return [
      "Usage: fixture plan [--from=<project.md>] [options]",
      "",
      "Generate a plan (team + commits) in a new subfolder of the project,",
      "as c<N>-<name>/<postfix>/plan.md. Without --from, falls back to the",
      "project recorded in ../student-repos/.fixture-state.json (set by the",
      "most recent `fixture project` or `fixture plan`).",
      "",
      "Options:",
      ...opt(
        "      --from=PATH",
        "Project .md file or c<N>-<name>/ dir (absolute,",
        "or relative to ../student-repos/). Optional if",
        ".fixture-state.json has a project.",
      ),
      ...opt("  -m, --model=CODE", `Planner model (default: ${SETTINGS.mp})`),
      ...aiCodersHelp(),
      ...opt(
        "  -i, --coder-interaction=N",
        `${MIN_CODER_INTERACTION}-${MAX_CODER_INTERACTION} (default: ${SETTINGS.coderInteraction}) — cross-module author mixing`,
      ),
      ...opt(
        "  -y, --style=STYLENAME",
        `(default: ${SETTINGS.style}) — structural shape of the commit`,
        "timeline; see Style values: below",
      ),
      ...opt(
        "  -s, --students=N",
        `${MIN_STUDENTS}-${MAX_STUDENTS} (default: ${SETTINGS.students})`,
      ),
      ...opt(
        "  -r, --rounds=N",
        `Build-commit count (default: ${SETTINGS.rounds})`,
      ),
      ...opt(
        "  -w, --reviews=N",
        `${MIN_REVIEWS}..--rounds (default: ${SETTINGS.reviews}) — review-commit`,
        "count, placed at random build slots",
      ),
      ...opt(
        "  -v, --verbose",
        "Print plan to stdout; -vv adds Planner",
        "prompt/reply; -vvv adds full agent turns",
      ),
      ...helpLine,
      "",
      "Style values:",
      "  big-bang             Round 1 scaffolds every module; later rounds",
      "                       add content inside those modules.",
      "  incremental          One module at round 1; new modules introduced",
      "                       one per round until all exist, then content",
      "                       fills in.",
      "  vertical-slice       Every commit touches multiple modules in thin",
      "                       end-to-end slices; modules grow in lockstep.",
      "  bottom-up            Utilities, types, and primitives first;",
      "                       higher-level features appear in the second",
      "                       half.",
      "  top-down             Public surface stubbed in early rounds; real",
      "                       implementations replace stubs later.",
      "  test-driven          Tests written before code: each round adds a",
      "                       test_*.py commit followed by an implementation",
      "                       commit that turns it green.",
      "  walking-skeleton     Round 1 wires every module end-to-end with",
      "                       placeholder bodies; later rounds replace",
      "                       dummies with real behaviour in place.",
      "  spike-and-stabilize  Rough prototype in one or two files first;",
      "                       later rounds split, rename, and extract into",
      "                       proper modules.",
      "  demo-driven          Each round adds one user-visible capability,",
      "                       commits aligned to demo-able milestones rather",
      "                       than module boundaries.",
      "  refactor-heavy       Build commits alternate between adding",
      "                       capability and refactoring recent work in",
      "                       place.",
    ]
  }
  if (sub === "repo") {
    return [
      "Usage: fixture repo [--from=<plan.md>] [options]",
      "",
      "Run Coder sub-agents against a plan to produce a git repo at",
      "c<N>-<name>/<plan-postfix>/<repo-postfix>/. --from can also point at",
      "a c<N>-<name>/<plan-postfix>/ plan dir, or at a c<N>-<name>/ project",
      "dir when it contains exactly one plan subfolder. Without --from, falls",
      "back to the plan recorded in ../student-repos/.fixture-state.json",
      "(set by the most recent `fixture plan`).",
      "",
      "Options:",
      ...opt(
        "      --from=PATH",
        "Plan .md file, plan dir, or project dir",
        "(absolute, or relative to ../student-repos/).",
        "Optional if .fixture-state.json has a plan.",
      ),
      ...opt("  -m, --model=CODE", `Coder model (default: ${SETTINGS.mc})`),
      ...opt(
        "  -x, --coder-experience=N",
        `${MIN_CODER_EXPERIENCE}-${MAX_CODER_EXPERIENCE} (default: ${SETTINGS.coderExperience}); ignored when the plan is in AI-coders mode`,
      ),
      ...opt(
        "  -o, --comments=N",
        `${MIN_COMMENTS}-${MAX_COMMENTS} (default: ${SETTINGS.comments}); ${COMMENTS_FREE_TIER} leaves commenting to the coder`,
      ),
      ...opt(
        "  -v, --verbose",
        "Print plan to stdout; -vv adds Coder",
        "prompts/replies; -vvv adds full agent turns",
      ),
      ...helpLine,
      "",
      "Comment tiers:",
      "  0  No comments, no docstrings.",
      "  1  No docstrings; code comments allowed.",
      "  2  No noise docstrings (those that just restate the signature).",
      "  3  No directive — the coder decides.",
    ]
  }
  return [
    "Usage: fixture batch <list.json> [options]",
    "",
    "Run a batch of plan+repo entries against a single fixed project.",
    "Each entry is generated, then removed from the file on success.",
    "Stops on the first failure (the failed entry stays in the file for",
    "a manual retry). The file shape:",
    "",
    "  {",
    '    "project": "c3-trail-conditions-aggregator/project.md",',
    '    "entries": [',
    "      { mp, mc, aiCoders, coderInteraction, style,",
    "        students, rounds, reviews, coderExperience, comments },",
    "      ...",
    "    ]",
    "  }",
    "",
    "`project` is either a path to an existing project.md (or project dir)",
    'or `{ complexity: N, mp: "CODE" }` to generate a fresh project.',
    "Each entry's keys match `.fixture-settings.jsonc` (excluding",
    "`complexity`, which the project provides).",
    "",
    "Options:",
    ...opt(
      "  -v, --verbose",
      "Print plan to stdout; -vv adds Planner/Coder",
      "prompts/replies; -vvv adds full agent turns",
    ),
    ...helpLine,
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
  if (
    sub !== "init" &&
    sub !== "project" &&
    sub !== "plan" &&
    sub !== "repo" &&
    sub !== "batch"
  ) {
    fail(
      `unknown subcommand "${sub}"; expected init | project | plan | repo | batch`,
    )
  }
  const opts =
    sub === "init"
      ? parseInit(rest)
      : sub === "project"
        ? parseProject(rest)
        : sub === "plan"
          ? parsePlan(rest)
          : sub === "repo"
            ? parseRepo(rest)
            : parseBatch(rest)
  if (opts.help) {
    printSubcommandHelp(sub)
    process.exit(0)
  }
  return opts
}
