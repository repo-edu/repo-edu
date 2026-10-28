import * as fs from "node:fs"
import * as ts from "typescript"
import { memberName } from "./desktop-inventory-syntax.js"

import { type GitPathProvider, readGitWorktreePaths } from "./git.js"
import { extractImportPaths } from "./imports.js"
import type { SourceInventory } from "./inventory.js"
import { checkRendererQuerySources } from "./renderer-query-checks.js"
import {
  type RendererSource,
  rendererSources,
} from "./renderer-source-origins.js"
import { checkRendererStartSources } from "./renderer-start-checks.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const CLAUDE_CODER_PACKAGE = "@repo-edu/claude-coder"
const CLAUDE_AGENT_SDK_PACKAGE = "@anthropic-ai/claude-agent-sdk"

const PACKAGE_MANIFEST_PATTERN =
  /^(?:apps|packages|tools)\/[^/]+\/package\.json$/

const RENDERER_SRC_PREFIX = "packages/renderer-app/src/"

const CONTROLLER_WORKFLOW_IDS = new Set([
  "course.list",
  "settings.loadApp",
  "settings.saveCredentials",
  "settings.savePreferences",
  "course.load",
  "course.save",
  "course.delete",
])

export const SEMANTIC_COURSE_ACTIONS = new Set([
  "hydrate",
  "applyCommittedCourse",
  "applyLmsPreview",
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
  pathProvider: GitPathProvider = readGitWorktreePaths,
): Violation[] {
  const sources = rendererSources(
    inventory.files
      .filter(
        (file) =>
          file.startsWith(RENDERER_SRC_PREFIX) && !file.includes("/__tests__/"),
      )
      .map((file) => ({
        file,
        content: fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
      })),
  )
  return [
    ...checkNonSourceClaudeCoderImports(root, inventory, pathProvider),
    ...checkClaudeCoderPackageDeclarations(root, pathProvider),
    ...checkRendererSessionOwnership(sources),
    ...checkRendererQuerySources(sources),
    ...checkRendererStartSources(sources),
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

function checkRendererSessionOwnership(
  sources: readonly RendererSource[],
): Violation[] {
  const violations: Violation[] = []

  for (const { source: sourceFile, origin } of sources) {
    const file = sourceFile.fileName.slice(RENDERER_SRC_PREFIX.length)
    if (isRendererSessionInternal(file)) continue

    function visit(node: ts.Node): void {
      if (
        ts.isImportSpecifier(node) &&
        (node.propertyName?.text ?? node.name.text) === "WorkflowClient" &&
        file !== "components/App.tsx"
      ) {
        violations.push({
          file: `${RENDERER_SRC_PREFIX}${file}`,
          message: "retains a raw WorkflowClient outside session composition",
        })
      }
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
          origin(node.expression) === "courseStore" &&
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
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        SEMANTIC_COURSE_ACTIONS.has(memberName(node) ?? "")
      ) {
        if (origin(node.expression) === "courseStoreSnapshot") {
          violations.push({
            file: `packages/renderer-app/src/${file}`,
            message: `reads course-store action "${memberName(node)}" from a store snapshot outside session ownership`,
          })
        }
      }

      if (ts.isBindingElement(node)) {
        const action = origin(node.name)?.replace(/^courseStoreSnapshot\./, "")
        if (action && SEMANTIC_COURSE_ACTIONS.has(action)) {
          violations.push({
            file: `packages/renderer-app/src/${file}`,
            message: `destructures course-store action "${action}" outside session ownership`,
          })
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return violations
}

function isRendererSessionInternal(file: string): boolean {
  return [
    "session/session-controller.ts",
    "session/session-operations.ts",
    "session/session-persistence.ts",
    "session/session-settings.ts",
    "session/session-query.ts",
    "persistence/create-persister.ts",
    "persistence/course-persister.ts",
    "persistence/settings-persister.ts",
  ].includes(file)
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
      (ts.isPropertyAccessExpression(child) ||
        ts.isElementAccessExpression(child)) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === storeParameterName &&
      SEMANTIC_COURSE_ACTIONS.has(memberName(child) ?? "")
    ) {
      selectedAction = memberName(child) ?? null
      return
    }

    ts.forEachChild(child, visitSelection)
  }

  visitSelection(selector.body)
  return selectedAction
}
