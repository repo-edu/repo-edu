import * as ts from "typescript"

export type EntrySelector =
  | { kind: "map"; name: string; values?: boolean }
  | { kind: "property"; name: string; within?: string }
  | { kind: "call"; name: string; argument?: number; within?: string }
  | { kind: "cases"; expression: string }
  | { kind: "callback-calls"; property: string; within?: string }
  | { kind: "calls"; within: string }
  | { kind: "comparison"; expression: string }
  | { kind: "capture" }

export function syntaxTree(file: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

export function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  )
    node = node.expression
  return node
}

export function memberName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  )
    return node.argumentExpression.text
  return undefined
}

function literal(node: ts.Expression): string {
  const value = unwrap(node)
  if (ts.isStringLiteralLike(value)) return value.text
  if (
    ts.isCallExpression(value) &&
    memberName(value.expression) === "literal" &&
    value.arguments[0]
  )
    return literal(value.arguments[0])
  // Dynamic entries are never silently omitted from an exact inventory.
  return `<dynamic:${value.getText()}>`
}

function within(node: ts.Node, name: string | undefined): boolean {
  if (name === undefined) return true
  for (let parent: ts.Node | undefined = node; parent; parent = parent.parent) {
    if (
      (ts.isFunctionDeclaration(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isVariableDeclaration(parent) ||
        ts.isMethodDeclaration(parent)) &&
      parent.name &&
      memberName(parent.name) === name
    )
      return true
  }
  return false
}

/** Inspect syntax through TypeScript, never through a second source parser. */
export function readEntryMembers(
  source: ts.SourceFile,
  selector: EntrySelector,
): string[] {
  const entries: string[] = []
  walk(source, (node) => {
    if (
      selector.kind === "capture" &&
      ts.isJsxAttribute(node) &&
      node.name.getText(source).endsWith("Capture")
    )
      entries.push(
        `${node.name.getText(source)}:${node.initializer?.getText(source) ?? "<missing>"}`,
      )
    if (
      selector.kind === "calls" &&
      ts.isCallExpression(node) &&
      within(node, selector.within)
    )
      entries.push(node.expression.getText(source))
    if (
      selector.kind === "comparison" &&
      ts.isBinaryExpression(node) &&
      node.left.getText(source) === selector.expression
    )
      entries.push(
        `${ts.tokenToString(node.operatorToken.kind)}:${literal(node.right)}`,
      )
    if (
      selector.kind === "map" &&
      ts.isVariableDeclaration(node) &&
      memberName(node.name) === selector.name &&
      node.initializer
    ) {
      const value = unwrap(node.initializer)
      if (!ts.isObjectLiteralExpression(value)) {
        entries.push("<non-object>")
        return
      }
      for (const property of value.properties) {
        if (!ts.isPropertyAssignment(property)) {
          entries.push("<non-property>")
          continue
        }
        const key = memberName(property.name) ?? "<dynamic-key>"
        entries.push(
          selector.values ? `${key}:${literal(property.initializer)}` : key,
        )
      }
    }
    if (
      selector.kind === "property" &&
      ts.isPropertyAssignment(node) &&
      memberName(node.name) === selector.name &&
      within(node, selector.within)
    )
      entries.push(literal(node.initializer))
    if (
      selector.kind === "call" &&
      ts.isCallExpression(node) &&
      (node.expression.getText(source) === selector.name ||
        memberName(node.expression) === selector.name) &&
      within(node, selector.within)
    ) {
      const argument = node.arguments[selector.argument ?? 0]
      entries.push(argument ? literal(argument) : "<no-argument>")
    }
    if (
      selector.kind === "cases" &&
      ts.isSwitchStatement(node) &&
      node.expression.getText(source) === selector.expression
    ) {
      for (const clause of node.caseBlock.clauses)
        if (ts.isCaseClause(clause)) entries.push(literal(clause.expression))
    }
    if (
      selector.kind === "callback-calls" &&
      ts.isPropertyAssignment(node) &&
      memberName(node.name) === selector.property &&
      within(node, selector.within)
    ) {
      walk(node.initializer, (child) => {
        if (ts.isCallExpression(child))
          entries.push(child.expression.getText(source))
      })
    }
  })
  return entries
}

export function compareEntryMembers(
  expected: readonly string[],
  actual: readonly string[],
): string[] {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  return [
    ...expected
      .filter((entry) => !actualSet.has(entry))
      .map((entry) => `missing ${entry}`),
    ...actual
      .filter((entry) => !expectedSet.has(entry))
      .map((entry) => `extra or differently classified ${entry}`),
  ]
}
