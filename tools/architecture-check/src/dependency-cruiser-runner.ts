import { realpath } from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

import type { DependencyCruiserRuleSet } from "./graph-policy.js"
import type { SourceInventory } from "./inventory.js"
import {
  normalizeRepoPath,
  repoPathToAbsolute,
  toRepoPath,
} from "./repo-paths.js"
import type { Violation } from "./violations.js"

type CruiseResult = {
  readonly modules?: readonly CruiseModule[]
  readonly summary?: {
    readonly violations?: readonly CruiseViolation[]
  }
}

type CruiseModule = {
  readonly source: string
  readonly dependencies: readonly CruiseDependency[]
}

type CruiseDependency = {
  readonly resolved?: string
  readonly module: string
}

type CruiseViolation = {
  readonly from?: string
  readonly to?: string
  readonly rule: CruiseRuleSummary
}

type CruiseRuleSummary = {
  readonly name: string
  readonly severity: string
}

type DependencyCruiserModule = {
  readonly cruise: (
    files: readonly string[],
    options: Record<string, unknown>,
    resolveOptions: Record<string, unknown>,
    transpileOptions: Record<string, unknown>,
  ) => Promise<{ readonly output: unknown; readonly exitCode: number }>
}

export async function runDependencyCruiserRules(
  root: string,
  inventory: SourceInventory,
  ruleSet: DependencyCruiserRuleSet,
): Promise<Violation[]> {
  const dependencyCruiser = await loadDependencyCruiser()
  const canonicalRoot = await realpath(root)
  const tsConfigPath = repoPathToAbsolute(canonicalRoot, "tsconfig.base.json")
  const tsConfigAliases = compileTsConfigAliases(tsConfigPath)
  const result = await runWithCwd(canonicalRoot, () =>
    dependencyCruiser.cruise(
      inventory.files,
      {
        baseDir: canonicalRoot,
        validate: true,
        tsConfig: { fileName: tsConfigPath },
        ruleSet,
        outputType: "json",
        tsPreCompilationDeps: true,
        combinedDependencies: true,
        progress: { type: "none" },
        enhancedResolveOptions: {
          exportsFields: ["exports"],
          conditionNames: ["source", "import", "types", "node", "default"],
          extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json"],
          mainFields: ["source", "types", "module", "main"],
        },
      },
      {
        alias: tsConfigAliases,
        tsConfig: tsConfigPath,
        exportsFields: ["exports"],
        conditionNames: ["source", "import", "types", "node", "default"],
        extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json"],
        mainFields: ["source", "types", "module", "main"],
        bustTheCache: true,
      },
      {
        tsConfig: { fileName: tsConfigPath },
      },
    ),
  )

  const cruiseResult = normalizeCruiseResult(result.output)
  // summary.violations already aggregates and de-duplicates every rule breach
  // dependency-cruiser found; reading the per-dependency rules as well would
  // report each violation twice.
  const summaryViolations =
    cruiseResult.summary?.violations?.map((violation) => ({
      file: violation.from ?? violation.to ?? "dependency-cruiser",
      message: `violates graph rule ${violation.rule.name}${
        violation.to ? ` via ${violation.to}` : ""
      }`,
    })) ?? []

  return dedupeViolations([
    ...summaryViolations,
    ...workspaceImportProjectionViolations(
      canonicalRoot,
      inventory,
      cruiseResult,
    ),
  ])
}

function workspaceImportProjectionViolations(
  root: string,
  inventory: SourceInventory,
  cruiseResult: CruiseResult,
): Violation[] {
  return (
    cruiseResult.modules?.flatMap((module) =>
      module.dependencies.flatMap((dependency) => {
        const source = normalizeCruisePath(root, module.source)
        if (!inventory.fileSet.has(source)) return []
        if (!isWorkspacePackageImport(dependency.module)) return []

        const resolved = normalizedResolvedPath(root, dependency.resolved)
        if (resolved && inventory.fileSet.has(resolved)) return []

        return [
          {
            file: source,
            message: `imports workspace package "${dependency.module}" but dependency-cruiser resolved it outside the source inventory${
              resolved ? `: ${resolved}` : ""
            }`,
          },
        ]
      }),
    ) ?? []
  )
}

function isWorkspacePackageImport(moduleName: string): boolean {
  return moduleName === "@repo-edu" || moduleName.startsWith("@repo-edu/")
}

function normalizedResolvedPath(
  root: string,
  filePath: string | undefined,
): string | undefined {
  if (!filePath) return undefined
  const normalized = normalizeCruisePath(root, filePath)
  return normalized.startsWith("..") ? undefined : normalized
}

function normalizeCruisePath(root: string, filePath: string): string {
  if (filePath.startsWith("file://")) {
    return normalizeCruisePath(root, fileURLToPath(filePath))
  }
  if (path.isAbsolute(filePath)) return toRepoPath(root, filePath)
  return normalizeRepoPath(filePath)
}

function compileTsConfigAliases(
  tsConfigPath: string,
): Readonly<Record<string, string>> {
  const config = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
  if (config.error) {
    throw new Error(formatTsConfigError(config.error))
  }

  const configDirectory = path.dirname(tsConfigPath)
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    configDirectory,
  )
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(formatTsConfigError).join("\n"))
  }

  const paths = parsed.options.paths ?? {}
  const baseUrl = parsed.options.baseUrl ?? configDirectory
  const aliases: Record<string, string> = {}

  for (const [key, targets] of Object.entries(paths)) {
    const [target] = targets
    if (!target) continue
    const aliasKey = terminalWildcardPrefix(key)
    const aliasTarget = terminalWildcardPrefix(target)

    if (!aliasKey || !aliasTarget) {
      throw new Error(`Unsupported tsconfig paths alias: ${key}`)
    }

    aliases[aliasKey.exact ? `${aliasKey.value}$` : aliasKey.value] =
      path.resolve(baseUrl, aliasTarget.value)
  }

  return aliases
}

function terminalWildcardPrefix(
  value: string,
): { readonly value: string; readonly exact: boolean } | undefined {
  if (!value.includes("*")) {
    return { value, exact: true }
  }

  if (!value.endsWith("/*") || value.indexOf("*") !== value.length - 1) {
    return undefined
  }

  return { value: value.slice(0, -2), exact: false }
}

function formatTsConfigError(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
}

async function loadDependencyCruiser(): Promise<DependencyCruiserModule> {
  try {
    return (await import("dependency-cruiser")) as DependencyCruiserModule
  } catch (error) {
    throw new Error(
      `dependency-cruiser is required for graph-level architecture checks. Run pnpm install after this change. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function normalizeCruiseResult(output: unknown): CruiseResult {
  if (typeof output === "string") {
    return JSON.parse(output) as CruiseResult
  }
  return output as CruiseResult
}

function dedupeViolations(violations: readonly Violation[]): Violation[] {
  const seen = new Set<string>()
  const result: Violation[] = []
  for (const violation of violations) {
    const key = `${violation.file}\0${violation.message}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(violation)
  }
  return result
}

async function runWithCwd<T>(
  cwd: string,
  callback: () => Promise<T>,
): Promise<T> {
  const originalCwd = process.cwd()
  process.chdir(cwd)
  try {
    return await callback()
  } finally {
    process.chdir(originalCwd)
  }
}
