import * as fs from "node:fs"

import { type GitPathProvider, readGitWorktreePaths } from "./git.js"
import { extractImportPaths } from "./imports.js"
import type { SourceInventory } from "./inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const CLAUDE_CODER_PACKAGE = "@repo-edu/claude-coder"
const CLAUDE_AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk"

const PACKAGE_MANIFEST_PATTERN =
  /^(?:apps|packages|tools)\/[^/]+\/package\.json$/

export function runBespokeChecks(
  root: string,
  inventory: SourceInventory,
  pathProvider: GitPathProvider = readGitWorktreePaths,
): Violation[] {
  return [
    ...checkNonSourceClaudeCoderImports(root, inventory, pathProvider),
    ...checkClaudeCoderPackageDeclarations(root, pathProvider),
  ]
}

function checkNonSourceClaudeCoderImports(
  root: string,
  inventory: SourceInventory,
  pathProvider: GitPathProvider,
): Violation[] {
  const sourceFiles = inventory.fileSet
  const files = pathProvider(root).filter(
    (file) =>
      /^(apps|packages|tools)\/.+\.tsx?$/.test(file) &&
      !sourceFiles.has(file) &&
      !/(^|\/)(node_modules|dist|out|build|coverage|\.turbo|\.vite)\//.test(
        file,
      ),
  )
  const violations: Violation[] = []

  for (const file of files) {
    const imports = extractImportPaths(
      fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
      file,
    )
    for (const importPath of imports) {
      pushClaudeCoderImportViolation(violations, file, importPath)
    }
  }

  return violations
}

function pushClaudeCoderImportViolation(
  violations: Violation[],
  file: string,
  importPath: string,
): void {
  if (
    (importPath === CLAUDE_CODER_PACKAGE ||
      importPath.startsWith(`${CLAUDE_CODER_PACKAGE}/`)) &&
    !file.startsWith("packages/fixture-engine/")
  ) {
    violations.push({
      file,
      message: `imports dev-only Claude coder package "${importPath}" outside fixture-engine`,
    })
  }

  if (
    (importPath === CLAUDE_AGENT_SDK_PACKAGE ||
      importPath.startsWith(`${CLAUDE_AGENT_SDK_PACKAGE}/`)) &&
    !file.startsWith("packages/claude-coder/")
  ) {
    violations.push({
      file,
      message: `imports proprietary Claude agent SDK "${importPath}" outside claude-coder`,
    })
  }
}

function checkClaudeCoderPackageDeclarations(
  root: string,
  pathProvider: GitPathProvider,
): Violation[] {
  const violations: Violation[] = []
  const packageJsonFiles = pathProvider(root).filter(
    (file) => file === "package.json" || PACKAGE_MANIFEST_PATTERN.test(file),
  )

  for (const file of packageJsonFiles) {
    const packageJson = JSON.parse(
      fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
    ) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    const dependencyNames = new Set(
      [
        packageJson.dependencies,
        packageJson.devDependencies,
        packageJson.peerDependencies,
        packageJson.optionalDependencies,
      ].flatMap((deps) => Object.keys(deps ?? {})),
    )

    if (
      dependencyNames.has(CLAUDE_CODER_PACKAGE) &&
      file !== "packages/fixture-engine/package.json"
    ) {
      violations.push({
        file,
        message:
          "declares dev-only Claude coder package outside fixture-engine",
      })
    }

    if (
      dependencyNames.has(CLAUDE_AGENT_SDK_PACKAGE) &&
      file !== "packages/claude-coder/package.json"
    ) {
      violations.push({
        file,
        message: "declares proprietary Claude agent SDK outside claude-coder",
      })
    }
  }

  return violations
}
