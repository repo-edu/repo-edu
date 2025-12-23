import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_FIXTURES_DIR = resolve(__dirname, "../../test-fixtures")

// Clean up leftover plan from previous run
const planPath = resolve(TEST_FIXTURES_DIR, "_plan.json")
if (existsSync(planPath)) {
  unlinkSync(planPath)
  console.log("Removed stale _plan.json")
}

function randomFileCount(): number {
  const r = Math.random() * 100
  if (r < 30) return 1
  if (r < 60) return 2
  if (r < 80) return 3
  if (r < 95) return 4
  return 5
}

const constraints = {
  file_counts: Array.from({ length: 10 }, randomFileCount),
  existing_dirs: readdirSync(TEST_FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name),
}

writeFileSync(
  resolve(TEST_FIXTURES_DIR, "_constraints.json"),
  JSON.stringify(constraints, null, 2),
)
console.log("Generated constraints:", constraints)
