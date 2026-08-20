import * as fs from "node:fs"
import type { DependencyGraph } from "./dependency-cruiser-runner.js"
import {
  analyzeDesktopRuntimeLoadSyntax,
  type DesktopRuntimeLoadSyntax,
  type RuntimePackageLoad,
} from "./desktop-runtime-dependency-syntax.js"
import type { SourceInventory } from "./inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import {
  isRuntimeSuppliedLoadName,
  requirePackageRoot,
} from "./runtime-package-names.js"
import { collectRuntimeSourceClosure } from "./runtime-source-closure.js"
import type { Violation } from "./violations.js"

const RUNTIME_EXTERNALS_FILE = "apps/desktop/src/desktop-runtime-externals.json"
const DESKTOP_MANIFEST = "apps/desktop/package.json"
const WORKSPACE_MANIFEST_PATTERN =
  /^(?:apps|packages|tools)\/[^/]+\/package\.json$/
const SHIPPED_ENTRY_SOURCES = new Map([
  ["main", "apps/desktop/src/main.ts"],
  ["codex-sdk-host", "packages/integrations-llm/src/codex/sdk-host-entry.ts"],
] as const)
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const

type RollupRuntimeExternal = {
  readonly fullName: string
  readonly packageRoot: string
  readonly proof: "rollup"
}

type DirectRuntimeExternal = {
  readonly fullName: string
  readonly packageRoot: string
  readonly proof: "direct"
  readonly entry: string
}

type DesktopRuntimeExternal = RollupRuntimeExternal | DirectRuntimeExternal

type RuntimeExternalRead = {
  readonly declarations: readonly DesktopRuntimeExternal[]
  readonly violations: readonly Violation[]
}

type WorkspaceManifest = {
  readonly file: string
  readonly dependencies: Readonly<Record<string, string>>
  readonly declarations: readonly ManifestDependencyDeclaration[]
}

type ManifestDependencyDeclaration = {
  readonly file: string
  readonly section: (typeof DEPENDENCY_SECTIONS)[number]
  readonly packageName: string
  readonly specifier: string
}

export function checkDesktopRuntimeDependencyOwnership(
  root: string,
  inventory: SourceInventory,
  graph: DependencyGraph,
): Violation[] {
  const externalRead = readRuntimeExternals(root, inventory.worktreePaths)
  const violations = [...externalRead.violations]
  const entrySources = Array.from(SHIPPED_ENTRY_SOURCES.values())

  for (const source of entrySources) {
    if (!inventory.fileSet.has(source)) {
      violations.push({
        file: source,
        message:
          "desktop shipped-host entry is missing from the source inventory",
      })
    }
  }

  const shippedClosure = collectRuntimeSourceClosure(
    entrySources,
    inventory,
    graph,
  )
  for (const testImport of shippedClosure.testSourceImports) {
    violations.push({
      file: testImport.from,
      message: `shipped host production source imports test source "${testImport.to}"`,
    })
  }

  const entryClosures = new Map(
    Array.from(SHIPPED_ENTRY_SOURCES, ([entry, source]) => [
      entry,
      collectRuntimeSourceClosure([source], inventory, graph).files,
    ]),
  )
  const syntax = analyzeShippedClosure(root, shippedClosure.files)
  for (const issue of syntax.issues) {
    violations.push({
      file: issue.file,
      message: `line ${issue.line}, column ${issue.column}: ${issue.message}`,
    })
  }

  checkProofPaths(externalRead.declarations, syntax, entryClosures, violations)
  checkManifestOwnership(
    root,
    inventory.worktreePaths,
    externalRead.declarations,
    violations,
  )

  return violations
}

function readRuntimeExternals(
  root: string,
  worktreePaths: readonly string[],
): RuntimeExternalRead {
  if (!worktreePaths.includes(RUNTIME_EXTERNALS_FILE)) {
    return {
      declarations: [],
      violations: [
        {
          file: RUNTIME_EXTERNALS_FILE,
          message: "desktop runtime-external declaration is missing",
        },
      ],
    }
  }

  let value: unknown
  try {
    value = JSON.parse(
      fs.readFileSync(repoPathToAbsolute(root, RUNTIME_EXTERNALS_FILE), "utf8"),
    ) as unknown
  } catch (error) {
    return {
      declarations: [],
      violations: [
        {
          file: RUNTIME_EXTERNALS_FILE,
          message: `desktop runtime-external declaration is not valid JSON: ${errorText(error)}`,
        },
      ],
    }
  }

  if (!Array.isArray(value)) {
    return {
      declarations: [],
      violations: [
        {
          file: RUNTIME_EXTERNALS_FILE,
          message: "desktop runtime-external declaration must be an array",
        },
      ],
    }
  }

  const declarations: DesktopRuntimeExternal[] = []
  const violations: Violation[] = []
  const fullNames = new Set<string>()
  for (const [index, candidate] of value.entries()) {
    const declaration = parseRuntimeExternal(candidate, index, violations)
    if (!declaration) continue
    if (fullNames.has(declaration.fullName)) {
      violations.push({
        file: RUNTIME_EXTERNALS_FILE,
        message: `runtime external "${declaration.fullName}" is declared more than once`,
      })
      continue
    }
    fullNames.add(declaration.fullName)
    declarations.push(declaration)
  }

  return { declarations, violations }
}

function parseRuntimeExternal(
  value: unknown,
  index: number,
  violations: Violation[],
): DesktopRuntimeExternal | null {
  const record = isRecord(value) ? value : null
  const label = `runtime external at index ${index}`
  if (!record || typeof record.fullName !== "string") {
    violations.push({
      file: RUNTIME_EXTERNALS_FILE,
      message: `${label} must name one package load`,
    })
    return null
  }

  let packageRoot: string
  try {
    packageRoot = requirePackageRoot(record.fullName)
  } catch (error) {
    violations.push({
      file: RUNTIME_EXTERNALS_FILE,
      message: `${label} ${errorText(error)}`,
    })
    return null
  }
  if (isRuntimeSuppliedLoadName(record.fullName)) {
    violations.push({
      file: RUNTIME_EXTERNALS_FILE,
      message: `${label} names runtime-supplied load "${record.fullName}"`,
    })
    return null
  }

  if (record.proof === "rollup") {
    if (!hasExactKeys(record, ["fullName", "proof"])) {
      violations.push({
        file: RUNTIME_EXTERNALS_FILE,
        message: `${label} has fields outside the Rollup proof shape`,
      })
      return null
    }
    return { fullName: record.fullName, packageRoot, proof: "rollup" }
  }

  if (record.proof === "direct" && typeof record.entry === "string") {
    if (!hasExactKeys(record, ["entry", "fullName", "proof"])) {
      violations.push({
        file: RUNTIME_EXTERNALS_FILE,
        message: `${label} has fields outside the direct proof shape`,
      })
      return null
    }
    return {
      entry: record.entry,
      fullName: record.fullName,
      packageRoot,
      proof: "direct",
    }
  }

  violations.push({
    file: RUNTIME_EXTERNALS_FILE,
    message: `${label} must select a valid proof path`,
  })
  return null
}

function analyzeShippedClosure(
  root: string,
  files: ReadonlySet<string>,
): DesktopRuntimeLoadSyntax {
  const rollupLoads: RuntimePackageLoad[] = []
  const directLoads: RuntimePackageLoad[] = []
  const issues: DesktopRuntimeLoadSyntax["issues"][number][] = []

  for (const file of [...files].sort()) {
    const analysis = analyzeDesktopRuntimeLoadSyntax(
      fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
      file,
    )
    rollupLoads.push(...analysis.rollupLoads)
    directLoads.push(...analysis.directLoads)
    issues.push(...analysis.issues)
  }

  return { directLoads, issues, rollupLoads }
}

function checkProofPaths(
  declarations: readonly DesktopRuntimeExternal[],
  syntax: DesktopRuntimeLoadSyntax,
  entryClosures: ReadonlyMap<string, ReadonlySet<string>>,
  violations: Violation[],
): void {
  const rollupDeclarations = new Map(
    declarations
      .filter(
        (declaration): declaration is RollupRuntimeExternal =>
          declaration.proof === "rollup",
      )
      .map((declaration) => [declaration.fullName, declaration]),
  )
  const directDeclarations = new Map(
    declarations
      .filter(
        (declaration): declaration is DirectRuntimeExternal =>
          declaration.proof === "direct",
      )
      .map((declaration) => [declaration.fullName, declaration]),
  )
  const externalRoots = new Set(
    declarations.map((declaration) => declaration.packageRoot),
  )

  for (const load of syntax.rollupLoads) {
    const packageRoot = requirePackageRoot(load.fullName)
    if (
      externalRoots.has(packageRoot) &&
      !rollupDeclarations.has(load.fullName)
    ) {
      violations.push(
        loadViolation(
          load,
          `runtime load "${load.fullName}" belongs to externalized package root "${packageRoot}" but has no matching Rollup declaration`,
        ),
      )
    }
  }

  for (const load of syntax.directLoads) {
    const declaration = directDeclarations.get(load.fullName)
    if (!declaration) {
      violations.push(
        loadViolation(
          load,
          `direct package load "${load.fullName}" has no matching direct declaration`,
        ),
      )
      continue
    }
    const closure = entryClosures.get(declaration.entry)
    if (!closure?.has(load.file)) {
      violations.push(
        loadViolation(
          load,
          `direct package load "${load.fullName}" is outside declared entry "${declaration.entry}" source closure`,
        ),
      )
    }
  }

  for (const declaration of declarations) {
    if (declaration.proof === "rollup") {
      if (
        !syntax.rollupLoads.some(
          (load) => load.fullName === declaration.fullName,
        )
      ) {
        violations.push({
          file: RUNTIME_EXTERNALS_FILE,
          message: `Rollup runtime external "${declaration.fullName}" has no matching literal source load`,
        })
      }
      continue
    }

    const entryClosure = entryClosures.get(declaration.entry)
    if (!entryClosure) {
      violations.push({
        file: RUNTIME_EXTERNALS_FILE,
        message: `direct runtime external "${declaration.fullName}" names unknown emitted entry "${declaration.entry}"`,
      })
      continue
    }
    if (
      !syntax.directLoads.some(
        (load) =>
          load.fullName === declaration.fullName && entryClosure.has(load.file),
      )
    ) {
      violations.push({
        file: RUNTIME_EXTERNALS_FILE,
        message: `direct runtime external "${declaration.fullName}" has no matching literal load in entry "${declaration.entry}" source closure`,
      })
    }
  }
}

function checkManifestOwnership(
  root: string,
  worktreePaths: readonly string[],
  declarations: readonly DesktopRuntimeExternal[],
  violations: Violation[],
): void {
  const manifests = readWorkspaceManifests(root, worktreePaths)
  const desktop = manifests.find(({ file }) => file === DESKTOP_MANIFEST)

  for (const declaration of declarations) {
    if (!desktop?.dependencies[declaration.packageRoot]) {
      violations.push({
        file: DESKTOP_MANIFEST,
        message: `runtime external "${declaration.fullName}" derives package root "${declaration.packageRoot}", which is absent from desktop runtime dependencies`,
      })
    }
  }

  const packageRoots = new Set(
    declarations.map((declaration) => declaration.packageRoot),
  )
  for (const packageRoot of packageRoots) {
    const packageDeclarations = manifests.flatMap(({ declarations }) =>
      declarations.filter(({ packageName }) => packageName === packageRoot),
    )
    const manifestCount = new Set(packageDeclarations.map(({ file }) => file))
      .size
    if (manifestCount <= 1) continue

    for (const packageDeclaration of packageDeclarations) {
      if (packageDeclaration.specifier === "catalog:") continue
      violations.push({
        file: packageDeclaration.file,
        message: `desktop runtime-external package "${packageRoot}" is declared by ${manifestCount} workspace manifests, so ${packageDeclaration.section} must use "catalog:" instead of "${packageDeclaration.specifier}"`,
      })
    }
  }
}

function readWorkspaceManifests(
  root: string,
  worktreePaths: readonly string[],
): WorkspaceManifest[] {
  const manifests: WorkspaceManifest[] = []
  for (const file of worktreePaths.filter((candidate) =>
    WORKSPACE_MANIFEST_PATTERN.test(candidate),
  )) {
    let value: unknown
    try {
      value = JSON.parse(
        fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
      ) as unknown
    } catch {
      continue
    }
    if (!isRecord(value)) continue

    const declarations: ManifestDependencyDeclaration[] = []
    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = value[section]
      if (!isRecord(dependencies)) continue
      for (const [packageName, specifier] of Object.entries(dependencies)) {
        if (typeof specifier !== "string") continue
        declarations.push({ file, packageName, section, specifier })
      }
    }
    const runtimeDependencies = isRecord(value.dependencies)
      ? Object.fromEntries(
          Object.entries(value.dependencies).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {}
    manifests.push({
      declarations,
      dependencies: runtimeDependencies,
      file,
    })
  }
  return manifests
}

function loadViolation(load: RuntimePackageLoad, message: string): Violation {
  return {
    file: load.file,
    message: `line ${load.line}, column ${load.column}: ${message}`,
  }
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const expected = new Set(keys)
  const actual = Object.keys(value)
  return (
    actual.length === expected.size && actual.every((key) => expected.has(key))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
