import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { describe, it } from "node:test"

const repoRoot = resolve(process.cwd(), "../..")

const guardedRoots = [
  "packages/domain/src",
  "packages/application-contract/src",
  "packages/renderer-host-contract/src",
  "packages/app/src",
  "packages/host-browser-mock/src",
  "packages/test-fixtures/src",
] as const

const forbiddenImportPatterns = [
  /from\s+["']node:/,
  /from\s+["']fs["']/,
  /from\s+["']path["']/,
  /from\s+["']child_process["']/,
  /from\s+["']worker_threads["']/,
  /from\s+["']net["']/,
  /from\s+["']tls["']/,
] as const

async function listSourceFiles(rootDirectory: string): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = join(rootDirectory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(absolutePath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
      continue
    }

    if (absolutePath.includes("/__tests__/")) {
      continue
    }

    files.push(absolutePath)
  }

  return files
}

describe("docs browser guardrail", () => {
  it("prevents Node-only imports in docs-required shared packages", async () => {
    for (const root of guardedRoots) {
      const absoluteRoot = resolve(repoRoot, root)
      const sourceFiles = await listSourceFiles(absoluteRoot)
      assert.equal(
        sourceFiles.length > 0,
        true,
        `Expected files under ${root}.`,
      )

      for (const absolutePath of sourceFiles) {
        const source = await readFile(absolutePath, "utf8")
        const relativePath = relative(repoRoot, absolutePath)
        for (const pattern of forbiddenImportPatterns) {
          assert.equal(
            pattern.test(source),
            false,
            `Forbidden import pattern ${pattern} found in ${relativePath}`,
          )
        }
      }
    }
  })
})
