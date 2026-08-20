import * as ts from "typescript"

import {
  isRelativeModuleName,
  isRuntimeProtocolName,
  isRuntimeSuppliedLoadName,
  packageRootForBareLoad,
} from "./runtime-package-names.js"

export type RuntimePackageLoad = {
  readonly file: string
  readonly fullName: string
  readonly line: number
  readonly column: number
}

export type RuntimeLoadSyntaxIssue = {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly message: string
}

export type DesktopRuntimeLoadSyntax = {
  readonly rollupLoads: readonly RuntimePackageLoad[]
  readonly directLoads: readonly RuntimePackageLoad[]
  readonly issues: readonly RuntimeLoadSyntaxIssue[]
}

export function analyzeDesktopRuntimeLoadSyntax(
  content: string,
  file: string,
): DesktopRuntimeLoadSyntax {
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const createRequireNames = collectCreateRequireNames(sourceFile)
  const requireNames = collectRequireNames(sourceFile, createRequireNames)
  const localStringConstants = collectLocalStringConstants(sourceFile)
  const rollupLoads: RuntimePackageLoad[] = []
  const directLoads: RuntimePackageLoad[] = []
  const issues: RuntimeLoadSyntaxIssue[] = []

  function location(node: ts.Node): {
    readonly line: number
    readonly column: number
  } {
    const point = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    )
    return { line: point.line + 1, column: point.character + 1 }
  }

  function recordPackageLoad(
    target: RuntimePackageLoad[],
    fullName: string,
    node: ts.Node,
  ): void {
    if (
      packageRootForBareLoad(fullName) === null ||
      isRuntimeSuppliedLoadName(fullName)
    ) {
      return
    }
    target.push({ file, fullName, ...location(node) })
  }

  function addIssue(node: ts.Node, message: string): void {
    issues.push({ file, message, ...location(node) })
  }

  function inspectDynamicImport(node: ts.CallExpression): void {
    const argument = node.arguments[0]
    if (node.arguments.length !== 1 || argument === undefined) {
      addIssue(node, "dynamic import must have exactly one target")
      return
    }
    if (ts.isStringLiteralLike(argument)) {
      inspectLiteralDynamicTarget(argument.text, argument)
      return
    }

    if (ts.isIdentifier(argument)) {
      const resolved = localStringConstants.get(argument.text)
      if (resolved !== undefined) {
        if (packageRootForBareLoad(resolved) !== null) {
          addIssue(
            argument,
            `dynamic import of bare package "${resolved}" must use a string literal`,
          )
          return
        }
        if (isRuntimeProtocolName(resolved) || isRelativeModuleName(resolved)) {
          return
        }
        addIssue(
          argument,
          `dynamic import target "${resolved}" is not a relative path or runtime protocol`,
        )
        return
      }
    }

    if (startsWithWrittenRelativePrefix(argument, sourceFile)) {
      return
    }
    addIssue(
      argument,
      "dynamic import target must be a string literal, one local string constant, or a written relative path",
    )
  }

  function inspectLiteralDynamicTarget(fullName: string, node: ts.Node): void {
    if (packageRootForBareLoad(fullName) !== null) {
      recordPackageLoad(rollupLoads, fullName, node)
      return
    }
    if (isRuntimeProtocolName(fullName) || isRelativeModuleName(fullName)) {
      return
    }
    addIssue(
      node,
      `dynamic import target "${fullName}" is not a relative path, runtime protocol, or bare package`,
    )
  }

  function inspectDirectLoad(node: ts.CallExpression): void {
    const argument = node.arguments[0]
    if (
      node.arguments.length !== 1 ||
      argument === undefined ||
      !ts.isStringLiteralLike(argument)
    ) {
      addIssue(node, "createRequire load must use one string literal target")
      return
    }
    recordPackageLoad(directLoads, argument.text, argument)
  }

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      isRuntimeImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      recordPackageLoad(
        rollupLoads,
        node.moduleSpecifier.text,
        node.moduleSpecifier,
      )
    }

    if (
      ts.isExportDeclaration(node) &&
      isRuntimeExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      recordPackageLoad(
        rollupLoads,
        node.moduleSpecifier.text,
        node.moduleSpecifier,
      )
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      recordPackageLoad(
        rollupLoads,
        node.moduleReference.expression.text,
        node.moduleReference.expression,
      )
    }

    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        inspectDynamicImport(node)
      } else if (isDirectRequireCall(node, requireNames, createRequireNames)) {
        inspectDirectLoad(node)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { directLoads, issues, rollupLoads }
}

function collectCreateRequireNames(
  sourceFile: ts.SourceFile,
): ReadonlySet<string> {
  const names = new Set<string>()
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
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      if (importedName === "createRequire" && !element.isTypeOnly) {
        names.add(element.name.text)
      }
    }
  }
  return names
}

function collectRequireNames(
  sourceFile: ts.SourceFile,
  createRequireNames: ReadonlySet<string>,
): ReadonlySet<string> {
  const names = new Set<string>(["require"])

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isCreateRequireFactoryCall(node.initializer, createRequireNames)
    ) {
      names.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return names
}

function collectLocalStringConstants(
  sourceFile: ts.SourceFile,
): ReadonlyMap<string, string> {
  const values = new Map<string, string>()
  const ambiguous = new Set<string>()

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isStringLiteralLike(node.initializer) &&
      isConstVariableDeclaration(node)
    ) {
      if (values.has(node.name.text)) {
        ambiguous.add(node.name.text)
      } else {
        values.set(node.name.text, node.initializer.text)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  for (const name of ambiguous) values.delete(name)
  return values
}

function isConstVariableDeclaration(node: ts.VariableDeclaration): boolean {
  const declarationList = node.parent
  return (
    ts.isVariableDeclarationList(declarationList) &&
    (declarationList.flags & ts.NodeFlags.Const) !== 0
  )
}

function isCreateRequireFactoryCall(
  node: ts.Node,
  createRequireNames: ReadonlySet<string>,
): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    createRequireNames.has(node.expression.text)
  )
}

function isDirectRequireCall(
  node: ts.CallExpression,
  requireNames: ReadonlySet<string>,
  createRequireNames: ReadonlySet<string>,
): boolean {
  return (
    (ts.isIdentifier(node.expression) &&
      requireNames.has(node.expression.text)) ||
    isCreateRequireFactoryCall(node.expression, createRequireNames)
  )
}

function startsWithWrittenRelativePrefix(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
): boolean {
  return /^(?:["'`])\.\.?\//.test(expression.getText(sourceFile))
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
