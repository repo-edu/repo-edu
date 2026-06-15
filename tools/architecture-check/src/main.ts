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
    [
      "packages/application/",
      "packages/renderer-app/",
      "packages/tree-sitter-grammar-assets/",
      "apps/",
    ],
  ],
  ["packages/host-runtime-contract/", ["packages/tree-sitter-grammar-assets/"]],
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
      "packages/integrations-llm/src/",
      "packages/host-node/",
    ],
  ],
]

const CLAUDE_CODER_PACKAGE = "@repo-edu/claude-coder"
const CLAUDE_AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk"

type Violation = { file: string; message: string }

const CONTROLLER_WORKFLOW_IDS = new Set([
  "settings.loadApp",
  "settings.saveCredentials",
  "settings.savePreferences",
  "course.load",
  "course.save",
  "course.delete",
])

const SEMANTIC_COURSE_ACTIONS = new Set([
  "hydrate",
  "clear",
  "applySaveStamp",
  "addMember",
  "updateMember",
  "removeMember",
  "deleteMemberPermanently",
  "setRoster",
  "setIdSequences",
  "addAssignment",
  "updateAssignment",
  "deleteAssignment",
  "createGroup",
  "updateGroup",
  "deleteGroup",
  "moveMemberToGroup",
  "copyMemberToGroup",
  "createLocalGroupSet",
  "copyGroupSet",
  "renameGroupSet",
  "deleteGroupSet",
  "removeGroupFromSet",
  "updateGroupSetTemplate",
  "updateGroupSetColumnVisibility",
  "updateGroupSetColumnSizing",
  "setCourseId",
  "setLmsConnectionId",
  "setOrganization",
  "setRepositoryTemplate",
  "setRepositoryCloneTargetDirectory",
  "setRepositoryCloneDirectoryLayout",
  "setDisplayName",
  "setSearchFolder",
  "setAnalysisInputs",
  "ensureSystemGroupSets",
  "runChecks",
  "undo",
  "redo",
  "clearHistory",
])

function isRendererSessionInternal(file: string): boolean {
  return file.startsWith("session/") || file.startsWith("persistence/")
}

function isUseCourseStoreImport(importPath: string): boolean {
  return importPath.endsWith("stores/course-store.js")
}

function isIdentifierNamed(node: ts.Node, names: Set<string>): boolean {
  return ts.isIdentifier(node) && names.has(node.text)
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text
  return null
}

function callExpressionName(node: ts.CallExpression): string | null {
  const expression = node.expression
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text
  }
  return null
}

function isUseCourseStoreGetStateCall(
  node: ts.Node,
  useCourseStoreNames: Set<string>,
): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false
  const expression = node.expression
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "getState" &&
    isIdentifierNamed(expression.expression, useCourseStoreNames)
  )
}

function selectedCourseActionFromUseCourseStoreCall(
  node: ts.CallExpression,
): string | null {
  const selector = node.arguments[0]
  if (
    selector === undefined ||
    (!ts.isArrowFunction(selector) && !ts.isFunctionExpression(selector))
  ) {
    return null
  }

  const storeParameter = selector.parameters[0]?.name
  if (!storeParameter || !ts.isIdentifier(storeParameter)) return null
  const storeParameterName = storeParameter.text
  let selectedAction: string | null = null

  function visitSelection(child: ts.Node): void {
    if (selectedAction !== null) return
    if (
      ts.isPropertyAccessExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === storeParameterName &&
      SEMANTIC_COURSE_ACTIONS.has(child.name.text)
    ) {
      selectedAction = child.name.text
      return
    }

    ts.forEachChild(child, visitSelection)
  }

  visitSelection(selector.body)
  return selectedAction
}

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

function checkClaudeCoderBoundary(errors: Violation[]) {
  const sourceRoots = ["apps", "packages", "tools"]
  for (const root of sourceRoots) {
    const rootDir = path.join(ROOT, root)
    if (!fs.existsSync(rootDir)) continue
    const files = findFiles(
      rootDir,
      [".ts", ".tsx"],
      ["node_modules", "dist", "out", "release", ".d.ts"],
    )

    for (const file of files) {
      const repoFile = `${root}/${file}`
      const imports = extractImportPaths(
        fs.readFileSync(path.join(rootDir, file), "utf-8"),
      )
      for (const imp of imports) {
        if (
          (imp === CLAUDE_CODER_PACKAGE ||
            imp.startsWith(`${CLAUDE_CODER_PACKAGE}/`)) &&
          !repoFile.startsWith("packages/fixture-engine/")
        ) {
          errors.push({
            file: repoFile,
            message: `imports dev-only Claude coder package "${imp}" outside fixture-engine`,
          })
        }
        if (
          (imp === CLAUDE_AGENT_SDK_PACKAGE ||
            imp.startsWith(`${CLAUDE_AGENT_SDK_PACKAGE}/`)) &&
          !repoFile.startsWith("packages/claude-coder/")
        ) {
          errors.push({
            file: repoFile,
            message: `imports proprietary Claude agent SDK "${imp}" outside claude-coder`,
          })
        }
      }
    }
  }

  const packageJsonFiles = [
    "package.json",
    ...sourceRoots.flatMap((root) => {
      const rootDir = path.join(ROOT, root)
      if (!fs.existsSync(rootDir)) return []
      return fs
        .readdirSync(rootDir, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory() ? [`${root}/${entry.name}/package.json`] : [],
        )
    }),
  ]

  for (const file of packageJsonFiles) {
    const fullPath = path.join(ROOT, file)
    if (!fs.existsSync(fullPath)) continue
    const packageJson = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as {
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
      errors.push({
        file,
        message: `declares dev-only Claude coder package outside fixture-engine`,
      })
    }
    if (
      dependencyNames.has(CLAUDE_AGENT_SDK_PACKAGE) &&
      file !== "packages/claude-coder/package.json"
    ) {
      errors.push({
        file,
        message: `declares proprietary Claude agent SDK outside claude-coder`,
      })
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

function checkRendererSessionOwnership(errors: Violation[]) {
  const rendererSrc = path.join(ROOT, "packages/renderer-app/src")
  if (!fs.existsSync(rendererSrc)) return

  const files = findFiles(
    rendererSrc,
    [".ts", ".tsx"],
    ["node_modules", "dist", "__tests__"],
  )

  for (const file of files) {
    if (isRendererSessionInternal(file)) continue

    const fullPath = path.join(rendererSrc, file)
    const content = fs.readFileSync(fullPath, "utf-8")
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const useCourseStoreNames = new Set<string>()

    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !isUseCourseStoreImport(statement.moduleSpecifier.text)
      ) {
        continue
      }

      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue

      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text
        if (imported === "useCourseStore") {
          useCourseStoreNames.add(element.name.text)
        }
      }
    }

    const courseStoreSnapshotNames = new Set<string>()

    function collectCourseStoreSnapshots(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer !== undefined &&
        isUseCourseStoreGetStateCall(node.initializer, useCourseStoreNames)
      ) {
        if (ts.isIdentifier(node.name)) {
          courseStoreSnapshotNames.add(node.name.text)
        } else if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const name = element.propertyName
              ? propertyNameText(element.propertyName)
              : ts.isIdentifier(element.name)
                ? element.name.text
                : null
            if (name && SEMANTIC_COURSE_ACTIONS.has(name)) {
              errors.push({
                file: `packages/renderer-app/src/${file}`,
                message: `destructures course-store action "${name}" outside session ownership`,
              })
            }
          }
        }
      }

      ts.forEachChild(node, collectCourseStoreSnapshots)
    }

    collectCourseStoreSnapshots(sourceFile)

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const runName = callExpressionName(node)
        const workflowId = node.arguments[0]
        if (
          runName === "run" &&
          workflowId !== undefined &&
          ts.isStringLiteralLike(workflowId) &&
          CONTROLLER_WORKFLOW_IDS.has(workflowId.text)
        ) {
          errors.push({
            file: `packages/renderer-app/src/${file}`,
            message: `calls controller-owned workflow "${workflowId.text}" outside session/persistence`,
          })
        }

        if (
          isIdentifierNamed(node.expression, useCourseStoreNames) &&
          node.arguments.length > 0
        ) {
          const selectedAction =
            selectedCourseActionFromUseCourseStoreCall(node)
          if (selectedAction) {
            errors.push({
              file: `packages/renderer-app/src/${file}`,
              message: `selects course-store action "${selectedAction}" outside session ownership`,
            })
          }
        }
      }

      if (
        ts.isPropertyAccessExpression(node) &&
        SEMANTIC_COURSE_ACTIONS.has(node.name.text)
      ) {
        if (
          isUseCourseStoreGetStateCall(node.expression, useCourseStoreNames)
        ) {
          errors.push({
            file: `packages/renderer-app/src/${file}`,
            message: `reads course-store action "${node.name.text}" outside session ownership`,
          })
        }

        if (
          ts.isIdentifier(node.expression) &&
          courseStoreSnapshotNames.has(node.expression.text)
        ) {
          errors.push({
            file: `packages/renderer-app/src/${file}`,
            message: `reads course-store action "${node.name.text}" from a store snapshot outside session ownership`,
          })
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const errors: Violation[] = []

  checkDomainModuleOrder(errors)
  checkCrossLayerImports(errors)
  checkClaudeCoderBoundary(errors)
  checkImportCycles(errors)
  checkRendererSessionOwnership(errors)

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
