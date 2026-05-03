import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as ts from "typescript"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
)

function findFiles(
  dir: string,
  extensions: string[],
  ignore: string[],
): string[] {
  const results: string[] = []
  function shouldIgnore(rel: string): boolean {
    const segments = rel.split("/")
    return ignore.some((pattern) => {
      if (pattern.endsWith("/")) {
        return rel === pattern.slice(0, -1) || rel.startsWith(pattern)
      }
      if (pattern === ".d.ts") return rel.endsWith(pattern)
      if (pattern.startsWith(".")) return rel.includes(pattern)
      return segments.includes(pattern)
    })
  }
  function walk(current: string, relative: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      if (shouldIgnore(rel)) continue
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), rel)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(rel)
      }
    }
  }
  walk(dir, "")
  results.sort()
  return results
}

// ---------------------------------------------------------------------------
// 1. Dependency boundary checks (hard failures)
// ---------------------------------------------------------------------------

/** Domain module dependency order — later modules may import earlier ones only. */
const DOMAIN_MODULE_ORDER = [
  "types",
  "settings",
  "roster",
  "roster-lms-merge",
  "group-set",
  "group-set-import-export",
  "group-selection",
  "repository-planning",
  "validation",
  "schemas",
] as const

/** Cross-layer import rules — keys may NOT import from values. */
const FORBIDDEN_CROSS_LAYER: [string, string[]][] = [
  [
    "packages/domain/",
    ["packages/application/", "packages/renderer-app/", "apps/"],
  ],
  [
    "packages/application-contract/",
    [
      "packages/application/",
      "packages/renderer-app/",
      "apps/",
      "packages/host-node/",
    ],
  ],
  [
    "packages/renderer-app/",
    [
      "packages/integrations-git/src/",
      "packages/integrations-lms/src/",
      "packages/host-node/",
    ],
  ],
]

type Violation = { file: string; message: string }

function extractImportPaths(content: string): string[] {
  const paths: string[] = []
  const sourceFile = ts.createSourceFile(
    "check-architecture.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      paths.push(node.moduleSpecifier.text)
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      paths.push(node.moduleSpecifier.text)
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      paths.push(node.arguments[0].text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return paths
}

function getWorkspacePackageNameMap(): Map<string, string> {
  const packageNames = new Map<string, string>()
  for (const scope of ["apps", "packages", "tools"]) {
    const scopeDir = path.join(ROOT, scope)
    if (!fs.existsSync(scopeDir)) continue

    for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const folderName = entry.name
      const packageJsonPath = path.join(scopeDir, folderName, "package.json")
      if (!fs.existsSync(packageJsonPath)) continue

      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf-8"),
      ) as {
        name?: string
      }
      if (typeof packageJson.name === "string") {
        packageNames.set(`${scope}/${folderName}`, packageJson.name)
      }
    }
  }
  return packageNames
}

function resolveForbiddenPackages(
  forbidden: string,
  packageNames: Map<string, string>,
): string[] {
  const normalized = forbidden.replace(/\/+$/, "")
  if (normalized === "apps") {
    return Array.from(packageNames.entries())
      .filter(([key]) => key.startsWith("apps/"))
      .map(([, value]) => value)
  }

  const [scope, packageDir] = normalized.split("/", 3)
  if (!scope || !packageDir) return []

  return [
    packageNames.get(`${scope}/${packageDir}`) ?? `@repo-edu/${packageDir}`,
  ]
}

function checkDomainModuleOrder(errors: Violation[]) {
  const domainSrc = path.join(ROOT, "packages/domain/src")
  const orderIndex = new Map(DOMAIN_MODULE_ORDER.map((mod, i) => [mod, i]))

  for (const mod of DOMAIN_MODULE_ORDER) {
    const filePath = path.join(domainSrc, `${mod}.ts`)
    if (!fs.existsSync(filePath)) continue

    const content = fs.readFileSync(filePath, "utf-8")
    const imports = extractImportPaths(content)
    const selfIndex = orderIndex.get(mod) ?? -1

    for (const imp of imports) {
      const match = imp.match(/^\.\/(.+)\.js$/)
      if (!match) continue

      const depMod = match[1] as (typeof DOMAIN_MODULE_ORDER)[number]
      const depIndex = orderIndex.get(depMod)
      if (depIndex === undefined) continue

      if (depIndex >= selfIndex) {
        errors.push({
          file: `packages/domain/src/${mod}.ts`,
          message: `imports from "${depMod}" which is at the same or later position in the dependency order`,
        })
      }
    }
  }
}

function checkCrossLayerImports(errors: Violation[]) {
  const packageNames = getWorkspacePackageNameMap()

  for (const [sourcePrefix, forbiddenTargets] of FORBIDDEN_CROSS_LAYER) {
    const sourceDir = path.join(ROOT, sourcePrefix)
    if (!fs.existsSync(sourceDir)) continue
    const forbiddenPackages = forbiddenTargets.flatMap((forbidden) =>
      resolveForbiddenPackages(forbidden, packageNames),
    )

    const files = findFiles(
      sourceDir,
      [".ts", ".tsx"],
      ["node_modules", "dist", "__tests__"],
    )

    for (const file of files) {
      const fullPath = path.join(sourceDir, file)
      const content = fs.readFileSync(fullPath, "utf-8")
      const imports = extractImportPaths(content)

      for (const imp of imports) {
        if (!imp.startsWith("@repo-edu/")) continue

        for (const pkgName of forbiddenPackages) {
          if (imp === pkgName || imp.startsWith(`${pkgName}/`)) {
            errors.push({
              file: `${sourcePrefix}${file}`,
              message: `imports from "${imp}" which violates layer boundary`,
            })
          }
        }
      }
    }
  }
}

function checkImportCycles(errors: Violation[]) {
  const domainSrc = path.join(ROOT, "packages/domain/src")
  const graph = new Map<string, string[]>()

  for (const mod of DOMAIN_MODULE_ORDER) {
    const filePath = path.join(domainSrc, `${mod}.ts`)
    if (!fs.existsSync(filePath)) continue

    const content = fs.readFileSync(filePath, "utf-8")
    const imports = extractImportPaths(content)
    const deps: string[] = []

    for (const imp of imports) {
      const match = imp.match(/^\.\/(.+)\.js$/)
      if (!match) continue
      const depMod = match[1]
      if (
        DOMAIN_MODULE_ORDER.includes(
          depMod as (typeof DOMAIN_MODULE_ORDER)[number],
        )
      ) {
        deps.push(depMod)
      }
    }

    graph.set(mod, deps)
  }

  // Topological sort to detect cycles
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(node: string, trail: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = trail.indexOf(node)
      const cyclePath = cycleStart >= 0 ? trail.slice(cycleStart) : [...trail]
      const cycle = cyclePath.concat(node)
      errors.push({
        file: "packages/domain/src/",
        message: `import cycle detected: ${cycle.join(" → ")}`,
      })
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    inStack.add(node)

    try {
      for (const dep of graph.get(node) ?? []) {
        dfs(dep, [...trail, node])
      }
    } finally {
      inStack.delete(node)
    }
  }

  for (const mod of graph.keys()) {
    dfs(mod, [])
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const errors: Violation[] = []

  checkDomainModuleOrder(errors)
  checkCrossLayerImports(errors)
  checkImportCycles(errors)

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} architecture violation(s):`)
    for (const e of errors) {
      console.error(`  ${e.file}: ${e.message}`)
    }
    process.exit(1)
  }

  console.log("\n✓ Architecture check passed")
}

main()
