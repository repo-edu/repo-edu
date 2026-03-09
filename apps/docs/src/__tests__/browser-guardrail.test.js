import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, it } from "node:test"

const repoRoot = resolve(process.cwd(), "../..")
const guardedFiles = [
  "packages/domain/src/index.ts",
  "packages/application-contract/src/index.ts",
  "packages/integrations-lms-contract/src/index.ts",
  "packages/integrations-git-contract/src/index.ts",
  "packages/application/src/index.ts",
  "packages/app/src/index.ts",
]
const forbiddenImportPatterns = [
  /from\s+["']node:/,
  /from\s+["']fs["']/,
  /from\s+["']path["']/,
  /from\s+["']child_process["']/,
  /from\s+["']worker_threads["']/,
  /from\s+["']net["']/,
  /from\s+["']tls["']/,
]
describe("docs browser guardrail", () => {
  it("prevents Node-only imports in docs-required shared packages", async () => {
    for (const relativePath of guardedFiles) {
      const absolutePath = resolve(repoRoot, relativePath)
      const source = await readFile(absolutePath, "utf8")
      for (const pattern of forbiddenImportPatterns) {
        assert.equal(
          pattern.test(source),
          false,
          `Forbidden import pattern ${pattern} found in ${relativePath}`,
        )
      }
    }
  })
})
