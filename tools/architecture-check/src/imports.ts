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
