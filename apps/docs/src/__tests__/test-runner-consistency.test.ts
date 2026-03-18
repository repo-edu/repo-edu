import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { describe, it } from "node:test"

const repoRoot = resolve(process.cwd(), "../..")
const testSearchRoots = ["apps", "packages"] as const

async function listTestFiles(rootDirectory: string): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = join(rootDirectory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listTestFiles(absolutePath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (!entry.name.endsWith(".test.ts")) {
      continue
    }

    files.push(absolutePath)
  }

  return files
}

describe("test runner consistency", () => {
  it("uses node:test and node:assert/strict across test files", async () => {
    const allTestFiles = (
      await Promise.all(
        testSearchRoots.map((root) => listTestFiles(resolve(repoRoot, root))),
      )
    ).flat()

    assert.equal(allTestFiles.length > 0, true, "Expected test files.")

    for (const file of allTestFiles) {
      const source = await readFile(file, "utf8")
      const relativePath = relative(repoRoot, file)
      assert.equal(
        /from\s+["']node:test["']/.test(source),
        true,
        `Missing node:test import in ${relativePath}`,
      )
      assert.equal(
        /node:assert\/strict/.test(source),
        true,
        `Missing node:assert/strict import in ${relativePath}`,
      )
    }
  })
})
