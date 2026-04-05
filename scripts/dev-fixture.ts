import { execFileSync } from "node:child_process"
import { readdirSync, rmSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  fixtureTiers,
  fixtureSources,
  isFixtureTier,
  isFixtureSource,
} from "@repo-edu/test-fixtures"

const storageRoot = join(
  process.env.HOME ?? "~",
  "Library/Application Support/repo-edu",
)

const usage = [
  "Usage: pnpm dev:fixture [options]",
  "",
  "Launch the desktop app with fixture data.",
  "Use --clean alone to clean fixtures without launching.",
  "",
  "Options:",
  `  -t, --tier <tier>      ${fixtureTiers.join(" | ")} (default: medium)`,
  `  -s, --source <source>  ${fixtureSources.join(" | ")} (required)`,
  "                          file -> repobee teams fixture",
  "                          canvas|moodle -> task-groups fixture",
  "  -c, --clean            Delete stale fixture courses and artifacts before launch",
  "  -h, --help             Show this help message",
  "",
  "Examples:",
  "  pnpm dev:fixture -t small -s file",
  "  pnpm dev:fixture -s canvas -c",
].join("\n")

function parseCliArgs(args: string[]) {
  try {
    return parseArgs({
      args,
      options: {
        tier: { type: "string", short: "t", default: "medium" },
        source: { type: "string", short: "s" },
        clean: { type: "boolean", short: "c", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error"
    console.error(`Error: ${message}\n`)
    console.log(usage)
    process.exit(1)
  }
}

function cleanFixtureData() {
  const coursesDir = join(storageRoot, "courses")
  try {
    const files = readdirSync(coursesDir)
    for (const file of files) {
      if (file.startsWith("Fixture") && file.endsWith(".json")) {
        unlinkSync(join(coursesDir, file))
        console.log(`  deleted courses/${file}`)
      }
    }
  } catch {
    // courses directory may not exist yet
  }

  const fixturesDir = join(storageRoot, "fixtures")
  try {
    rmSync(fixturesDir, { recursive: true })
    console.log("  deleted fixtures/")
  } catch {
    // fixtures directory may not exist yet
  }
}

function toFixturePreset(source: string) {
  return source === "file" ? "repobee-teams" : "task-groups"
}

const { values } = parseCliArgs(process.argv.slice(2))

if (values.help) {
  console.log(usage)
  process.exit(0)
}

const tier = values.tier ?? "medium"
const source = values.source

if (!isFixtureTier(tier)) {
  console.error(
    `Error: Invalid tier "${tier}". Must be one of: ${fixtureTiers.join(", ")}`,
  )
  process.exit(1)
}
if (source === undefined) {
  if (values.clean) {
    console.log("Cleaning stale fixture data...")
    cleanFixtureData()
    process.exit(0)
  }
  console.log(usage)
  process.exit(0)
}
if (!isFixtureSource(source)) {
  console.error(
    `Error: Invalid source "${source}". Must be one of: ${fixtureSources.join(", ")}`,
  )
  process.exit(1)
}

if (values.clean) {
  console.log("Cleaning stale fixture data...")
  cleanFixtureData()
  console.log()
}

const fixtureSelector = `${tier}/${toFixturePreset(source)}/${source}`
console.log(`Launching desktop with REPO_EDU_FIXTURE=${fixtureSelector}\n`)

execFileSync("pnpm", ["--filter", "@repo-edu/desktop", "run", "dev"], {
  stdio: "inherit",
  env: { ...process.env, REPO_EDU_FIXTURE: fixtureSelector },
})
