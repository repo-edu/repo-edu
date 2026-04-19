#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const STALE_FILES = ["_plan.json", "_state.json", "_review.md"]

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "../..")
const STUDENT_REPOS = resolve(REPO_ROOT, ".student-repos")

const DEFAULT_ROUNDS = 3
const DEFAULT_MODEL = "sonnet"
const SKILL = "/create-students-repo"

function printHelp() {
  process.stdout.write(
    [
      "Usage: create-fixture [options]",
      "",
      "Generate one synthetic student-repo fixture under .student-repos/ by",
      "driving the create-students-repo Claude skill (Coordinator + per-commit",
      "Coder sub-agent).",
      "",
      "Options:",
      `  -r, --rounds=N   Number of commits to produce (positive integer, default: ${DEFAULT_ROUNDS})`,
      `  -m, --model=ID   Coordinator model alias or id (default: ${DEFAULT_MODEL})`,
      "  -h, --help       Show this help and exit",
      "",
      "Examples:",
      "  node scripts/fixtures/create-fixture.mjs --help",
      "  node scripts/fixtures/create-fixture.mjs --rounds=5",
      "  node scripts/fixtures/create-fixture.mjs --model=haiku",
      "  pnpm create:fixture -r 4",
      "",
    ].join("\n"),
  )
}

function fail(msg) {
  process.stderr.write(`create-fixture: ${msg}\n`)
  process.stderr.write("Run with --help for usage.\n")
  process.exit(2)
}

function parseArgs(argv) {
  const opts = { rounds: DEFAULT_ROUNDS, model: DEFAULT_MODEL, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "-h" || a === "--help") {
      opts.help = true
    } else if (a.startsWith("--rounds=")) {
      opts.rounds = Number(a.slice("--rounds=".length))
    } else if (a === "-r" || a === "--rounds") {
      const v = argv[++i]
      if (v === undefined) fail(`${a} requires a value`)
      opts.rounds = Number(v)
    } else if (a.startsWith("--model=")) {
      opts.model = a.slice("--model=".length)
    } else if (a === "-m" || a === "--model") {
      const v = argv[++i]
      if (v === undefined) fail(`${a} requires a value`)
      opts.model = v
    } else {
      fail(`unknown argument: ${a}`)
    }
  }
  if (!Number.isInteger(opts.rounds) || opts.rounds < 1) {
    fail(`--rounds must be a positive integer, got "${opts.rounds}"`)
  }
  if (!opts.model) fail("--model must be a non-empty string")
  return opts
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  printHelp()
  process.exit(0)
}

mkdirSync(STUDENT_REPOS, { recursive: true })
for (const name of STALE_FILES) {
  rmSync(resolve(STUDENT_REPOS, name), { force: true })
}

const claude = spawnSync(
  "claude",
  [
    "--dangerously-skip-permissions",
    "--model",
    opts.model,
    "--settings",
    '{"sandbox":{"enabled":false}}',
    `${SKILL} --rounds=${opts.rounds}`,
  ],
  { cwd: STUDENT_REPOS, stdio: "inherit" },
)
process.exit(claude.status ?? 1)
