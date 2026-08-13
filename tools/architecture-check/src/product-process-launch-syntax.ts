import * as ts from "typescript"

import type { ProductProcessMechanism } from "./product-process-launch-inventory.js"

const MODULE_MECHANISMS = new Map<string, ProductProcessMechanism>([
  ["child_process", "node-child-process"],
  ["node:child_process", "node-child-process"],
  ["cluster", "node-cluster"],
  ["node:cluster", "node-cluster"],
  ["cross-spawn", "cross-spawn"],
  ["@malept/cross-spawn-promise", "cross-spawn"],
  ["execa", "execa"],
  ["@openai/codex-sdk", "codex-sdk"],
  ["@anthropic-ai/claude-agent-sdk", "claude-agent-sdk"],
])

const PACKAGE_MODULE_MECHANISMS = [
  "cross-spawn",
  "@malept/cross-spawn-promise",
  "execa",
  "@openai/codex-sdk",
  "@anthropic-ai/claude-agent-sdk",
] as const

export function collectProcessMechanisms(
  content: string,
  file: string,
): ReadonlySet<ProductProcessMechanism> {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  )
  const mechanisms = new Set<ProductProcessMechanism>()
  const requireNames = collectRequireNames(sourceFile)

  function recordModule(moduleName: string): void {
    const mechanism = moduleMechanism(moduleName)
    if (mechanism !== null) mechanisms.add(mechanism)
  }

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      isRuntimeImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      recordModule(node.moduleSpecifier.text)
    }

    if (
      ts.isExportDeclaration(node) &&
      isRuntimeExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      recordModule(node.moduleSpecifier.text)
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      recordModule(node.moduleReference.expression.text)
    }

    if (ts.isCallExpression(node)) {
      const argument = node.arguments[0]
      if (
        argument !== undefined &&
        ts.isStringLiteralLike(argument) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            requireNames.has(node.expression.text)) ||
          isMember(node.expression, "process", "getBuiltinModule"))
      ) {
        recordModule(argument.text)
      }
      if (
        isMember(node.expression, "Bun", "spawn") ||
        isMember(node.expression, "Bun", "spawnSync")
      ) {
        mechanisms.add("bun-process")
      }
    }

    if (
      ts.isNewExpression(node) &&
      isMember(node.expression, "Deno", "Command")
    ) {
      mechanisms.add("deno-command")
    }

    if (ts.isTaggedTemplateExpression(node) && isMember(node.tag, "Bun", "$")) {
      mechanisms.add("bun-process")
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return mechanisms
}

function isRuntimeImportDeclaration(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause
  if (clause === undefined) return true
  if (clause.isTypeOnly) return false
  if (clause.name !== undefined) return true
  const bindings = clause.namedBindings
  if (bindings === undefined || ts.isNamespaceImport(bindings)) return true
  return bindings.elements.some((element) => !element.isTypeOnly)
}

function isRuntimeExportDeclaration(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return false
  const clause = node.exportClause
  if (clause === undefined || ts.isNamespaceExport(clause)) return true
  return clause.elements.some((element) => !element.isTypeOnly)
}

function collectRequireNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const createRequireNames = new Set<string>()
  const requireNames = new Set<string>(["require"])

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.isTypeOnly ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !["module", "node:module"].includes(statement.moduleSpecifier.text)
    ) {
      continue
    }
    const bindings = statement.importClause?.namedBindings
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      if (importedName === "createRequire" && !element.isTypeOnly) {
        createRequireNames.add(element.name.text)
      }
    }
  }

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      createRequireNames.has(node.initializer.expression.text)
    ) {
      requireNames.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return requireNames
}

function moduleMechanism(moduleName: string): ProductProcessMechanism | null {
  const exact = MODULE_MECHANISMS.get(moduleName)
  if (exact !== undefined) return exact
  for (const packageName of PACKAGE_MODULE_MECHANISMS) {
    if (moduleName.startsWith(`${packageName}/`)) {
      return MODULE_MECHANISMS.get(packageName) ?? null
    }
  }
  return null
}

function isMember(node: ts.Expression, owner: string, member: string): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === owner &&
      node.name.text === member
    )
  }
  return (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === owner &&
    ts.isStringLiteralLike(node.argumentExpression) &&
    node.argumentExpression.text === member
  )
}

function scriptKind(file: string): ts.ScriptKind {
  if (/\.[cm]?jsx$/.test(file)) return ts.ScriptKind.JSX
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS
  if (/\.[cm]?tsx$/.test(file)) return ts.ScriptKind.TSX
  return ts.ScriptKind.TS
}
