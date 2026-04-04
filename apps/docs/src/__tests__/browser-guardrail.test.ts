import assert from "node:assert/strict"
import { access, readdir, readFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { describe, it } from "node:test"

const repoRoot = resolve(process.cwd(), "../..")

const guardedRoots = [
  "packages/domain/src",
  "packages/application-contract/src",
  "packages/renderer-host-contract/src",
  "packages/renderer-app/src",
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

    const normalizedPath = absolutePath.replaceAll("\\", "/")
    if (normalizedPath.includes("/__tests__/")) {
      continue
    }

    files.push(absolutePath)
  }

  return files
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function sourcePatternToRegex(sourcePattern: string): RegExp {
  const normalizedPattern = sourcePattern
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")

  return new RegExp(
    `^${escapeRegex(normalizedPattern).replaceAll("\\*", "[^/]+")}$`,
  )
}

async function listWorkspacePackageDirectories(
  packagesRoot: string,
): Promise<string[]> {
  const entries = await readdir(packagesRoot, { withFileTypes: true })
  const directories: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const packageDirectory = join(packagesRoot, entry.name)
    try {
      await access(join(packageDirectory, "package.json"))
      directories.push(packageDirectory)
    } catch {
      // Ignore directories that are not packages.
    }
  }

  return directories
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

  it("ensures exports.source targets point to real source files", async () => {
    const packagesRoot = resolve(repoRoot, "packages")
    const packageDirectories =
      await listWorkspacePackageDirectories(packagesRoot)
    assert.equal(
      packageDirectories.length > 0,
      true,
      "Expected workspace package directories under packages/.",
    )

    for (const packageDirectory of packageDirectories) {
      const packageJsonPath = join(packageDirectory, "package.json")
      const packageJsonText = await readFile(packageJsonPath, "utf8")
      const packageJson = JSON.parse(packageJsonText) as {
        exports?: Record<string, unknown>
      }

      if (!packageJson.exports || Array.isArray(packageJson.exports)) {
        continue
      }

      let sourceFiles: string[] | null = null

      for (const [exportKey, exportTarget] of Object.entries(
        packageJson.exports,
      )) {
        if (
          typeof exportTarget !== "object" ||
          exportTarget === null ||
          Array.isArray(exportTarget)
        ) {
          continue
        }

        const sourceTarget = (exportTarget as { source?: unknown }).source
        if (typeof sourceTarget !== "string") {
          continue
        }

        const packageJsonRelativePath = relative(repoRoot, packageJsonPath)
        if (!sourceTarget.includes("*")) {
          const absoluteSourceTarget = resolve(packageDirectory, sourceTarget)
          try {
            await access(absoluteSourceTarget)
          } catch {
            assert.fail(
              `Missing source target ${sourceTarget} for ${exportKey} in ${packageJsonRelativePath}`,
            )
          }
          continue
        }

        sourceFiles ??= await listSourceFiles(join(packageDirectory, "src"))
        const matcher = sourcePatternToRegex(sourceTarget)
        const hasMatchingFile = sourceFiles.some((sourceFilePath) => {
          const relativeSourcePath = relative(packageDirectory, sourceFilePath)
          const normalizedRelativeSourcePath = relativeSourcePath.replaceAll(
            "\\",
            "/",
          )
          return matcher.test(normalizedRelativeSourcePath)
        })

        assert.equal(
          hasMatchingFile,
          true,
          `Missing source target ${sourceTarget} for ${exportKey} in ${packageJsonRelativePath}`,
        )
      }
    }
  })
})
