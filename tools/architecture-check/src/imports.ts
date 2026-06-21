import * as ts from "typescript"

export function extractImportPaths(
  content: string,
  fileName: string,
): string[] {
  const paths: string[] = []
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const createRequireNames = collectCreateRequireNames(sourceFile)
  const requireCallNames = collectRequireCallNames(
    sourceFile,
    createRequireNames,
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
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      paths.push(node.moduleReference.expression.text)
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      paths.push(node.arguments[0].text)
    }

    if (
      ts.isCallExpression(node) &&
      isRequireLikeCall(node, requireCallNames) &&
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

function collectCreateRequireNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !["node:module", "module"].includes(statement.moduleSpecifier.text)
    ) {
      continue
    }

    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue

    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text
      if (imported === "createRequire") names.add(element.name.text)
    }
  }
  return names
}

function collectRequireCallNames(
  sourceFile: ts.SourceFile,
  createRequireNames: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>(["require"])

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      createRequireNames.has(node.initializer.expression.text)
    ) {
      names.add(node.name.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return names
}

function isRequireLikeCall(
  node: ts.CallExpression,
  requireCallNames: ReadonlySet<string>,
): boolean {
  return (
    ts.isIdentifier(node.expression) &&
    requireCallNames.has(node.expression.text)
  )
}
