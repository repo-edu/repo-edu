import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

const generatedFiles = [
  "packages/backend-interface/src/types.ts",
  "packages/backend-interface/src/index.ts",
  "packages/app-core/src/bindings/commands.ts",
  "apps/repo-manage/src/bindings/tauri.ts",
  "apps/repo-manage/core/src/generated/types.rs",
]

function main(): void {
  const absolutePaths = generatedFiles.map((f) => resolve(repoRoot, f))

  // Snapshot current contents
  const snapshots = new Map<string, string>()
  for (const path of absolutePaths) {
    snapshots.set(path, readFileSync(path, "utf-8"))
  }

  // Re-run the generator + format (mirrors `pnpm gen:bindings`)
  const tsFiles = absolutePaths.filter((f) => f.endsWith(".ts"))
  try {
    execSync("pnpx tsx scripts/gen-from-schema.ts", {
      cwd: repoRoot,
      stdio: "pipe",
    })
    execSync(`pnpm biome format --write ${tsFiles.join(" ")}`, {
      cwd: repoRoot,
      stdio: "pipe",
    })
    execSync(`pnpm biome check --write ${tsFiles.join(" ")}`, {
      cwd: repoRoot,
      stdio: "pipe",
    })
  } catch (error) {
    console.error("bindings freshness: generator failed to run")
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  // Compare and always restore originals
  const stale: string[] = []
  for (const path of absolutePaths) {
    const fresh = readFileSync(path, "utf-8")
    const original = snapshots.get(path)
    if (original === undefined) continue
    writeFileSync(path, original)
    if (fresh !== original) {
      stale.push(path)
    }
  }

  if (stale.length > 0) {
    console.error(
      "bindings freshness: generated files are out of date — run `pnpm gen:bindings`",
    )
    for (const path of stale) {
      const relative = path.slice(repoRoot.length + 1)
      console.error(`  ${relative}`)
    }
    process.exit(1)
  }

  console.log("bindings freshness: OK")
}

main()
