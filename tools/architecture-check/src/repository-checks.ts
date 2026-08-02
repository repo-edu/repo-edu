import * as fs from "node:fs"
import { builtinModules } from "node:module"
import * as path from "node:path"

import type {
  DependencyEdge,
  DependencyGraph,
} from "./dependency-cruiser-runner.js"
import { extractImportPaths } from "./imports.js"
import type { SourceInventory } from "./inventory.js"
import { normalizeRepoPath, repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const WORKSPACE_MANIFEST_PATTERN =
  /^(?:apps|packages|tools)\/[^/]+\/package\.json$/
const WORKSPACE_TEST_PATTERN = /^(?:apps|packages|tools)\/.+\.test\.tsx?$/
const TEST_SOURCE_PATTERN = /(^|\/)__tests__\/|\.test\.tsx?$/
const DESKTOP_RENDERER_ENTRY = "apps/desktop/src/renderer.ts"
const INDEPENDENT_BROWSER_SAFE_ROOTS = [
  "packages/renderer-host-contract/src/",
  "packages/integrations-llm-contract/src/",
  "packages/host-runtime-contract/src/",
  "packages/test-fixtures/src/",
] as const

// Prefix-only builtins (node:test, node:sqlite, ...) are listed with their
// prefix and stay prefix-only here: their bare names resolve to npm packages,
// not to Node.
const NODE_BUILTIN_IMPORTS = new Set(
  builtinModules.flatMap((moduleName) =>
    moduleName.startsWith("node:")
      ? [moduleName]
      : [moduleName, `node:${moduleName}`],
  ),
)

export function runRepositoryChecks(
  root: string,
  inventory: SourceInventory,
  graph: DependencyGraph,
): Violation[] {
  return [
    ...checkWorkspaceExportSources(root, inventory.worktreePaths),
    ...checkWorkspaceTestRunner(root, inventory.worktreePaths),
    ...checkBrowserSafeSourceBoundary(inventory, graph),
  ]
}

export function checkWorkspaceExportSources(
  root: string,
  worktreePaths: readonly string[],
): Violation[] {
  const worktreeSet = new Set(worktreePaths)
  const violations: Violation[] = []

  for (const manifestPath of worktreePaths.filter((file) =>
    WORKSPACE_MANIFEST_PATTERN.test(file),
  )) {
    let manifest: { readonly exports?: unknown }
    try {
      manifest = JSON.parse(
        fs.readFileSync(repoPathToAbsolute(root, manifestPath), "utf8"),
      ) as { readonly exports?: unknown }
    } catch (error) {
      violations.push({
        file: manifestPath,
        message: `manifest is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
      continue
    }
    if (!isRecord(manifest.exports)) continue

    const packageDirectory = path.posix.dirname(manifestPath)
    for (const [exportKey, target] of Object.entries(manifest.exports)) {
      if (!isRecord(target) || typeof target.source !== "string") continue
      const sourceTarget = normalizeRepoPath(
        path.posix.join(packageDirectory, target.source),
      )

      if (sourceTarget.includes("*")) {
        const matcher = wildcardPathMatcher(sourceTarget)
        if (worktreePaths.some((file) => matcher.test(file))) continue
      } else if (worktreeSet.has(sourceTarget)) {
        continue
      }

      violations.push({
        file: manifestPath,
        message: `exports.${exportKey}.source target does not match current source: ${target.source}`,
      })
    }
  }

  return violations
}

export function checkWorkspaceTestRunner(
  root: string,
  worktreePaths: readonly string[],
): Violation[] {
  const violations: Violation[] = []
  for (const file of worktreePaths.filter((candidate) =>
    WORKSPACE_TEST_PATTERN.test(candidate),
  )) {
    const imports = new Set(
      extractImportPaths(
        fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
        file,
      ),
    )
    if (!imports.has("node:test")) {
      violations.push({ file, message: "test source must import node:test" })
    }
    if (!imports.has("node:assert/strict")) {
      violations.push({
        file,
        message: "test source must import node:assert/strict",
      })
    }
  }
  return violations
}

export function checkBrowserSafeSourceBoundary(
  inventory: SourceInventory,
  graph: DependencyGraph,
): Violation[] {
  if (!inventory.fileSet.has(DESKTOP_RENDERER_ENTRY)) {
    return [
      {
        file: DESKTOP_RENDERER_ENTRY,
        message: "desktop renderer entry is missing from the source inventory",
      },
    ]
  }

  const independentRoots = inventory.files.filter(
    (file) =>
      isProductionSource(file) &&
      INDEPENDENT_BROWSER_SAFE_ROOTS.some((root) => file.startsWith(root)),
  )
  const closure = runtimeSourceClosure(
    [DESKTOP_RENDERER_ENTRY, ...independentRoots],
    inventory,
    graph,
  )

  const violations: Violation[] = [...closure.violations]
  for (const file of [...closure.files].sort()) {
    for (const edge of graph.get(file) ?? []) {
      if (!isRuntimeEdge(edge) || !NODE_BUILTIN_IMPORTS.has(edge.module)) {
        continue
      }
      violations.push({
        file,
        message: `browser-safe production source imports Node built-in module "${edge.module}"`,
      })
    }
  }
  return violations
}

function runtimeSourceClosure(
  entries: readonly string[],
  inventory: SourceInventory,
  graph: DependencyGraph,
): { readonly files: Set<string>; readonly violations: Violation[] } {
  const visited = new Set<string>()
  const violations: Violation[] = []
  const testImportKeys = new Set<string>()
  const pending = [...entries]

  while (pending.length > 0) {
    const file = pending.pop()
    if (
      file === undefined ||
      visited.has(file) ||
      !inventory.fileSet.has(file)
    ) {
      continue
    }
    visited.add(file)
    for (const edge of graph.get(file) ?? []) {
      if (
        !isRuntimeEdge(edge) ||
        edge.resolved === undefined ||
        !inventory.fileSet.has(edge.resolved) ||
        visited.has(edge.resolved)
      ) {
        continue
      }
      if (!isProductionSource(edge.resolved)) {
        const key = `${file}\0${edge.resolved}`
        if (!testImportKeys.has(key)) {
          testImportKeys.add(key)
          violations.push({
            file,
            message: `browser-safe production source imports test source "${edge.resolved}"`,
          })
        }
        continue
      }
      pending.push(edge.resolved)
    }
  }

  return { files: visited, violations }
}

function isRuntimeEdge(edge: DependencyEdge): boolean {
  return (
    !edge.preCompilationOnly &&
    !edge.typeOnly &&
    !edge.dependencyTypes.includes("pre-compilation-only") &&
    !edge.dependencyTypes.includes("type-only") &&
    !edge.dependencyTypes.includes("type-import")
  )
}

function isProductionSource(file: string): boolean {
  return !TEST_SOURCE_PATTERN.test(file)
}

// Node's exports `*` is plain string substitution and may span `/`.
function wildcardPathMatcher(value: string): RegExp {
  const escaped = value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
  return new RegExp(`^${escaped.replaceAll("\\*", ".+")}$`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
