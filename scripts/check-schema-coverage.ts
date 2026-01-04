import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Legacy types retained for backward compatibility during migration.
 * These will be removed in Phase 6 when the UI migrates to roster-centric stores.
 * Excluding them from schema coverage checks to avoid false positives.
 */
const LEGACY_TYPES = new Set([
  "VerifyCourseParams",
  "VerifyCourseResult",
  "GenerateFilesParams",
  "GetGroupCategoriesParams",
  "GroupCategory",
  "PathBuf",
  "ConfigParams",
  "SetupParams",
  "CloneParams",
])

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const manifestPath = resolve(
  repoRoot,
  "apps/repo-manage/schemas/commands/manifest.json",
)
const typesDir = resolve(repoRoot, "apps/repo-manage/schemas/types")

function parseTypeName(type: string): string[] {
  const trimmed = type.trim()
  if (trimmed === "()") return []
  if (trimmed === "String" || trimmed === "bool") return []
  const match = trimmed.match(/^(\w+)\s*<(.+)>$/)
  if (!match) return [trimmed]
  const name = match[1]
  const inner = match[2]
  const parts = inner.split(",").map((part) => part.trim())
  if (name === "Vec" || name === "Option" || name === "Channel") {
    return parts.flatMap(parseTypeName)
  }
  if (name === "Result") {
    return parts.flatMap(parseTypeName)
  }
  return [name]
}

function main(): void {
  if (!existsSync(manifestPath)) {
    console.log("schema coverage: manifest.json not found (skipping)")
    return
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
  const typeFiles = new Set(
    readdirSync(typesDir)
      .filter((file) => file.endsWith(".schema.json"))
      .map((file) => file.replace(/\.schema\.json$/, "")),
  )

  type ManifestEntry = {
    input?: ({ type: string } | string)[]
    output?: string
    error?: string
  }

  const missing: string[] = []
  const commands = manifest.commands ?? {}
  for (const entry of Object.values(commands) as ManifestEntry[]) {
    const inputs = entry.input ?? []
    const outputs = entry.output ? [entry.output] : []
    const errors = entry.error ? [entry.error] : []
    const allTypes = [...inputs, ...outputs, ...errors]
    for (const item of allTypes) {
      if (!item) continue
      if (typeof item === "string") {
        for (const name of parseTypeName(item)) {
          if (!typeFiles.has(name) && !LEGACY_TYPES.has(name)) {
            missing.push(name)
          }
        }
      } else if (item && typeof item === "object" && item.type) {
        for (const name of parseTypeName(item.type)) {
          if (!typeFiles.has(name) && !LEGACY_TYPES.has(name)) {
            missing.push(name)
          }
        }
      }
    }
  }

  const uniqueMissing = Array.from(new Set(missing))
  if (uniqueMissing.length > 0) {
    for (const name of uniqueMissing) {
      console.error(`schema coverage: missing schema for ${name}`)
    }
    process.exit(1)
  }

  console.log("schema coverage: OK")
}

main()
