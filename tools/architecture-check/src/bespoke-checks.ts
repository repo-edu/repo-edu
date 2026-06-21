import * as fs from "node:fs"
import * as path from "node:path"
import * as ts from "typescript"

import { readGitTrackedPaths, type TrackedPathProvider } from "./git.js"
import { extractImportPaths } from "./imports.js"
import type { SourceInventory } from "./inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const CLAUDE_CODER_PACKAGE = "@repo-edu/claude-coder"
const CLAUDE_AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk"

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

export function runBespokeChecks(
  root: string,
  inventory: SourceInventory,
  trackedPathProvider: TrackedPathProvider = readGitTrackedPaths,
): Violation[] {
  return [
    ...checkNonSourceClaudeCoderImports(root, inventory, trackedPathProvider),
    ...checkClaudeCoderPackageDeclarations(root),
    ...checkRendererSessionOwnership(root),
  ]
}

function checkNonSourceClaudeCoderImports(
  root: string,
  inventory: SourceInventory,
  trackedPathProvider: TrackedPathProvider,
): Violation[] {
  const sourceFiles = inventory.fileSet
  const files = trackedPathProvider(root).filter(
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

function checkClaudeCoderPackageDeclarations(root: string): Violation[] {
  const violations: Violation[] = []
  const packageJsonFiles = [
    "package.json",
    ...["apps", "packages", "tools"].flatMap((scope) => {
      const scopeDir = repoPathToAbsolute(root, scope)
      if (!fs.existsSync(scopeDir)) return []
      return fs
        .readdirSync(scopeDir, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory() ? [`${scope}/${entry.name}/package.json`] : [],
        )
    }),
  ]

  for (const file of packageJsonFiles) {
    const fullPath = repoPathToAbsolute(root, file)
    if (!fs.existsSync(fullPath)) continue
    const packageJson = JSON.parse(fs.readFileSync(fullPath, "utf8")) as {
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

function checkRendererSessionOwnership(root: string): Violation[] {
  const rendererSrc = repoPathToAbsolute(root, "packages/renderer-app/src")
  if (!fs.existsSync(rendererSrc)) return []

  const files = findFiles(
    rendererSrc,
    [".ts", ".tsx"],
    ["node_modules", "dist"],
  )
    .filter((file) => !/(^|\/)__tests__\//.test(file))
    .filter((file) => !isRendererSessionInternal(file))
  const violations: Violation[] = []

  for (const file of files) {
    const fullPath = path.join(rendererSrc, ...file.split("/"))
    const content = fs.readFileSync(fullPath, "utf8")
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const useCourseStoreNames = collectUseCourseStoreImportNames(sourceFile)
    const courseStoreSnapshotNames = collectCourseStoreSnapshots(
      sourceFile,
      useCourseStoreNames,
      violations,
      file,
    )

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
          violations.push({
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
            violations.push({
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
          violations.push({
            file: `packages/renderer-app/src/${file}`,
            message: `reads course-store action "${node.name.text}" outside session ownership`,
          })
        }

        if (
          ts.isIdentifier(node.expression) &&
          courseStoreSnapshotNames.has(node.expression.text)
        ) {
          violations.push({
            file: `packages/renderer-app/src/${file}`,
            message: `reads course-store action "${node.name.text}" from a store snapshot outside session ownership`,
          })
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return violations
}

function collectUseCourseStoreImportNames(
  sourceFile: ts.SourceFile,
): Set<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith("stores/course-store.js")
    ) {
      continue
    }

    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue

    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text
      if (imported === "useCourseStore") names.add(element.name.text)
    }
  }
  return names
}

function collectCourseStoreSnapshots(
  sourceFile: ts.SourceFile,
  useCourseStoreNames: Set<string>,
  violations: Violation[],
  file: string,
): Set<string> {
  const courseStoreSnapshotNames = new Set<string>()

  function collect(node: ts.Node): void {
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
            violations.push({
              file: `packages/renderer-app/src/${file}`,
              message: `destructures course-store action "${name}" outside session ownership`,
            })
          }
        }
      }
    }

    ts.forEachChild(node, collect)
  }

  collect(sourceFile)
  return courseStoreSnapshotNames
}

function isRendererSessionInternal(file: string): boolean {
  return file.startsWith("session/") || file.startsWith("persistence/")
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

function findFiles(
  dir: string,
  extensions: readonly string[],
  ignoredSegments: readonly string[],
): string[] {
  const results: string[] = []
  function walk(current: string, relative: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      if (ignoredSegments.some((segment) => rel.split("/").includes(segment))) {
        continue
      }
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), rel)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(rel)
      }
    }
  }
  walk(dir, "")
  return results.sort()
}
