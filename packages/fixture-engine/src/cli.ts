import { parseArgs as nodeParseArgs } from "node:util"
import {
  type FixtureModelSpec,
  ModelCodeError,
  type Phase,
  parseShortCode,
} from "@repo-edu/integrations-llm-catalog"
import {
  COMMENTS_FREE_TIER,
  MAX_CODER_INTERACTION,
  MAX_COMMENTS,
  MAX_COMPLEXITY,
  MAX_STUDENTS,
  MIN_CODER_INTERACTION,
  MIN_COMMENTS,
  MIN_COMPLEXITY,
  MIN_REVIEWS,
  MIN_STUDENTS,
  STYLES,
  type Style,
} from "./constants"
import { SETTINGS, SETTINGS_PREAMBLE, settingsRowsForHelp } from "./defaults"
import { fail } from "./log"

export type Subcommand =
  | "init"
  | "project"
  | "plan"
  | "repo"
  | "sweep"
  | "evaluate"

export interface CommonOpts {
  verbosity: number
  help: boolean
}

export interface ProjectOpts extends CommonOpts {
  subcommand: "project"
  complexity: number
  plannerSpec: FixtureModelSpec
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
  plannerSpec: FixtureModelSpec
}

export interface SweepOpts extends CommonOpts {
  subcommand: "sweep"
  fromPath: string
  sweepPath: string
}

export interface InitOpts extends CommonOpts {
  subcommand: "init"
  force: boolean
  fromPath: string
}

export interface RepoOpts extends CommonOpts {
  subcommand: "repo"
  fromPath: string
  comments: number
  coderSpec: FixtureModelSpec
}

export interface EvaluateOpts extends CommonOpts {
  subcommand: "evaluate"
  fromPath: string
  outPath: string
  evaluatorSpec: FixtureModelSpec
}

export type Opts =
  | ProjectOpts
  | PlanOpts
  | RepoOpts
  | SweepOpts
  | InitOpts
  | EvaluateOpts

const MODEL_CODE_HELP = [
  "Model CODE (-m, --model=CODE):",
  "              low   medium   high      xhigh   max",
  "  sonnet      21    22       23 | 2     —       —",
  "  opus        31    32       33 | 3     34      35",
  "",
  "  haiku = 1 (no thinking modes)",
  "",
  "  Codex codes (c1 / c21..c24 / c2 / c31..c34 / c3) ship with the",
  "  Codex provider plan; coder phase (mc) is Claude-only.",
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
  "  sweep     Iterate plan and/or repo across the values of one",
  "            list-valued setting in a sweep file.",
  "  evaluate  Walk a project (or higher) folder and score every repo",
  "            child with an LLM judge → _evaluate.md report.",
  "",
  "Options:",
  "  -h, --help                         Show this top-level help and exit",
  "  -hh                                Show the full help (every subcommand)",
  "                                     and exit",
  "",
  "Output layout under ../fixtures/ for the example session below:",
  "",
  "  c2-flash-card-quiz/               # one folder per project",
  "    project.md                      # from `fixture project`",
  "    ai-i2-bb-s3-r6-w2/              # one folder per plan",
  "      plan.md                       # from `fixture plan`",
  "      m23-46-o2/                    # git repo from `fixture repo`",
  "      .fixture-settings.jsonc       # snapshot of settings used",
  "      _log.md  _trace.md            # run log + per-round prompts/replies",
  "      _xtrace.md                    # full agent turn log",
  "      _review.md  _state.json       # review summary + per-round state",
  "",
  "The project folder is named c<N>-<name>, where <N> is the project's",
  "complexity tier (1-4) and <name> is the kebab-case name the",
  "planner invented. Each plan lives in its own subfolder named by the",
  "plan's <postfix>; repo names encode the coder-side run parameters",
  "(model code, model version tag, comments tier).",
  "One project folder can hold multiple plans and one plan folder can",
  "hold multiple repos generated from different settings.",
  "",
  "../fixtures/.fixture-state.json caches the most recent",
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
    indentBody(subcommandHelpBody("sweep"), "  ").join("\n"),
    indentBody(subcommandHelpBody("evaluate"), "  ").join("\n"),
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
  options: NonNullable<Parameters<typeof nodeParseArgs>[0]>["options"],
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

function parseModelOption(
  raw: string,
  flag: string,
  phase: Phase,
): FixtureModelSpec {
  try {
    return parseShortCode(raw, phase)
  } catch (err) {
    if (err instanceof ModelCodeError) fail(`${flag}: ${err.message}`)
    throw err
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
  const plannerSpec = parseModelOption(
    (v.model as string | undefined) ?? SETTINGS.mp,
    "-m/--model",
    "mp",
  )
  if (!common.help) {
    validateComplexity(complexity)
  }
  return {
    ...common,
    subcommand: "project",
    complexity,
    plannerSpec,
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
  const plannerSpec = parseModelOption(
    (v.model as string | undefined) ?? SETTINGS.mp,
    "-m/--model",
    "mp",
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
    plannerSpec,
  }
}

function parseRepo(argv: string[]): RepoOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    comments: { type: "string", short: "o" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  const comments =
    v.comments !== undefined ? Number(v.comments) : SETTINGS.comments
  const coderSpec = parseModelOption(
    (v.model as string | undefined) ?? SETTINGS.mc,
    "-m/--model",
    "mc",
  )
  if (!common.help) {
    validateComments(comments)
  }
  return {
    ...common,
    subcommand: "repo",
    fromPath: (v.from as string | undefined) ?? "",
    comments,
    coderSpec,
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
    from: { type: "string" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  return {
    ...common,
    subcommand: "init",
    force: v.force === true,
    fromPath: (v.from as string | undefined) ?? "",
  }
}

function parseSweep(argv: string[]): SweepOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    sweep: { type: "string" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  return {
    ...common,
    subcommand: "sweep",
    fromPath: (v.from as string | undefined) ?? "",
    sweepPath: (v.sweep as string | undefined) ?? "",
  }
}

const EVALUATE_DEFAULT_MODEL_CODE = "35"

function parseEvaluate(argv: string[]): EvaluateOpts {
  const { values: v } = runNodeParseArgs(argv, {
    from: { type: "string" },
    out: { type: "string" },
    model: { type: "string", short: "m" },
    verbose: { type: "boolean", short: "v", multiple: true },
    help: { type: "boolean", short: "h" },
  })
  const common = commonOptsFrom(v)
  const evaluatorSpec = parseModelOption(
    (v.model as string | undefined) ?? EVALUATE_DEFAULT_MODEL_CODE,
    "-m/--model",
    "mp",
  )
  return {
    ...common,
    subcommand: "evaluate",
    fromPath: (v.from as string | undefined) ?? "",
    outPath: (v.out as string | undefined) ?? "",
    evaluatorSpec,
  }
}

function subcommandHelpBody(sub: Subcommand): string[] {
  const helpLine = opt("  -h, --help", "Show this help and exit")
  if (sub === "init") {
    return [
      "Usage: fixture init [-f] [--from=<project.md>]",
      "",
      "Write defaults for three files under ../fixtures/:",
      "  .fixture-settings.jsonc   run-time defaults (inline JSONC comments)",
      "  .fixture-sweep.jsonc      template for `fixture sweep`",
      "  .fixture-state.json       empty {project, plan} pointers, written",
      "                            on every successful project / plan run",
      "",
      "Refuses to overwrite if any of the three exists, unless -f /",
      "--force is given. Settings is also auto-created on the first",
      "project / plan / repo / sweep run, so this subcommand is mainly",
      "useful to scaffold the files ahead of editing them.",
      "",
      "With --from=<project.md>, also seeds a curated project (e.g.",
      "scripts/fixtures/projects/calculator.md) by archiving it to",
      "../fixtures/c<N>-<name>/project.md and pointing .fixture-state.json",
      "at it, so the next `fixture plan` / `sweep` picks it up without a",
      "`fixture project` step.",
      "",
      ...SETTINGS_BODY,
      "",
      "Options:",
      ...opt(
        "  -f, --force",
        "Overwrite existing .fixture-settings.jsonc,",
        ".fixture-sweep.jsonc, and .fixture-state.json",
      ),
      ...opt(
        "      --from=PATH",
        "Curated project .md file to seed (absolute,",
        "or relative to the current directory).",
      ),
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
      "project recorded in ../fixtures/.fixture-state.json (set by the",
      "most recent `fixture project` or `fixture plan`).",
      "",
      "Options:",
      ...opt(
        "      --from=PATH",
        "Project .md file or c<N>-<name>/ dir (absolute,",
        "or relative to ../fixtures/). Optional if",
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
      "                       -i is ignored (every commit spans modules).",
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
      "                       -i is ignored (commits cross module",
      "                       boundaries).",
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
      "back to the plan recorded in ../fixtures/.fixture-state.json",
      "(set by the most recent `fixture plan`).",
      "",
      "Options:",
      ...opt(
        "      --from=PATH",
        "Plan .md file, plan dir, or project dir",
        "(absolute, or relative to ../fixtures/).",
        "Optional if .fixture-state.json has a plan.",
      ),
      ...opt("  -m, --model=CODE", `Coder model (default: ${SETTINGS.mc})`),
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
  if (sub === "evaluate") {
    return [
      "Usage: fixture evaluate [--from=<dir>] [--out=PATH] [-m CODE]",
      "",
      "Walk one directory recursively, find every repo child (any folder",
      "containing _state.json), and score each one with an LLM judge.",
      "Writes a Markdown report at <root>/_evaluate.md (override with",
      "--out=PATH).",
      "",
      "Without --from, falls back to the project recorded in",
      "../fixtures/.fixture-state.json; if that's empty, walks all of",
      "../fixtures/. --from narrows the walk to any project / plan /",
      "repo dir; descent stops at the first folder containing",
      "_state.json.",
      "",
      "Options:",
      ...opt(
        "      --from=PATH",
        "Project / plan / repo dir (absolute, or",
        "relative to ../fixtures/). Defaults to the",
        "project in .fixture-state.json, else",
        "../fixtures/ itself.",
      ),
      ...opt(
        "      --out=PATH",
        "Override the default <root>/_evaluate.md",
        "destination (absolute or relative to cwd).",
      ),
      ...opt(
        "  -m, --model=CODE",
        `Evaluator model (default: ${EVALUATE_DEFAULT_MODEL_CODE})`,
      ),
      ...helpLine,
    ]
  }
  return [
    "Usage: fixture sweep [--from=<project-or-plan>] [--sweep=<sweep.jsonc>]",
    "                     [options]",
    "",
    "Iterate plan and/or repo across the values of one list-valued setting",
    "in a sweep file. The sweep file mirrors `.fixture-settings.jsonc` but",
    "exactly one key may hold an array; every other key must be a scalar",
    "(or absent, in which case the value falls back to",
    "`.fixture-settings.jsonc`).",
    "",
    "Behavior depends on the swept key's phase and on `--from`:",
    "  - List on a plan-phase key (mp, complexity, aiCoders,",
    "    coderInteraction, style, students, rounds, reviews):",
    "      `--from` must be a project (or omitted if .fixture-state.json",
    "      has a project).",
    "      For each value: run plan, then run repo. Yields N plan dirs,",
    "      one repo each.",
    "  - List on a repo-phase key (mc, comments):",
    "      `--from` may be a project (plan once, then iterate repos) or a",
    "      plan (skip planning, iterate repos against the existing plan).",
    "      Without `--from`, falls back to the plan in",
    "      .fixture-state.json if set, else its project.",
    "",
    "Options:",
    ...opt(
      "      --from=PATH",
      "Project file/dir, or for repo-phase sweeps a",
      "plan file/dir. Absolute or relative to",
      "../fixtures/. Optional if .fixture-state.json",
      "has the appropriate entry.",
    ),
    ...opt(
      "      --sweep=PATH",
      "Sweep file (absolute, or relative to",
      "../fixtures/). Defaults to",
      "../fixtures/.fixture-sweep.jsonc.",
    ),
    ...opt(
      "  -v, --verbose",
      "Print plan to stdout; -vv adds Planner/Coder",
      "prompts/replies; -vvv adds full agent turns",
    ),
    ...helpLine,
  ]
}

export function printSubcommandHelp(sub: Subcommand): void {
  const trailer = sub === "sweep" ? [""] : ["", ...MODEL_CODE_HELP, ""]
  const lines = [...subcommandHelpBody(sub), ...trailer]
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
    sub !== "sweep" &&
    sub !== "evaluate"
  ) {
    fail(
      `unknown subcommand "${sub}"; expected init | project | plan | repo | sweep | evaluate`,
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
            : sub === "sweep"
              ? parseSweep(rest)
              : parseEvaluate(rest)
  if (opts.help) {
    printSubcommandHelp(sub)
    process.exit(0)
  }
  return opts
}
