import * as ts from "typescript"
import {
  memberName,
  syntaxTree,
  unwrap,
  walk,
} from "./desktop-inventory-syntax.js"
import type { Violation } from "./violations.js"

const queryHooks = new Set([
  "useQuery",
  "useInfiniteQuery",
  "useSuspenseQuery",
  "useSuspenseInfiniteQuery",
])
const fetchMethods = new Set([
  "fetchQuery",
  "fetchInfiniteQuery",
  "prefetchQuery",
  "prefetchInfiniteQuery",
  "ensureQueryData",
  "ensureInfiniteQueryData",
  "refetchQueries",
])
const sessionTypes = new Set([
  "SessionOperationGateway",
  "SessionOperationScope",
  "SessionOperationReservation",
])

/** Bind local symbols so aliases retain their origin and unrelated names stay free. */
export function checkRendererQuerySource(
  file: string,
  content: string,
): Violation[] {
  const source = syntaxTree(file, content)
  const host = ts.createCompilerHost({})
  host.getSourceFile = (name) => (name === file ? source : undefined)
  const program = ts.createProgram(
    [file],
    { noLib: true, noResolve: true },
    host,
  )
  const checker = program.getTypeChecker()
  const origins = new Map<ts.Symbol, string>()
  const namespaces = new Set<ts.Symbol>()
  const violations: Violation[] = []
  const report = (message: string) => violations.push({ file, message })
  const symbol = (node: ts.Node) => checker.getSymbolAtLocation(node)
  const bind = (node: ts.Node, origin: string) => {
    const value = symbol(node)
    if (value) origins.set(value, origin)
  }
  const origin = (node: ts.Node): string | undefined => {
    const value = symbol(node)
    if (value && origins.has(value)) return origins.get(value)
    if (ts.isPropertyAccessExpression(node)) {
      const owner = symbol(node.expression)
      if (owner && namespaces.has(owner)) return node.name.text
    }
    return undefined
  }
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue
    const path = statement.moduleSpecifier.text
    const bindings = statement.importClause?.namedBindings
    if (!bindings) continue
    if (ts.isNamespaceImport(bindings) && path === "@tanstack/react-query") {
      const value = symbol(bindings.name)
      if (value) namespaces.add(value)
    }
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const name = element.propertyName?.text ?? element.name.text
        if (
          path === "@tanstack/react-query" ||
          (path.endsWith("/session-operations.js") && sessionTypes.has(name)) ||
          (path.endsWith("/session-query.js") &&
            name === "scopedSessionQueryOptions") ||
          (path.endsWith("/workflow-client.js") &&
            ["useWorkflowClient", "getWorkflowClient"].includes(name))
        )
          bind(element.name, name)
      }
    }
  }
  const expressionOrigin = (node: ts.Expression): string | undefined => {
    const value = unwrap(node)
    const known = origin(value)
    if (known) return known
    if (
      ts.isPropertyAccessExpression(value) ||
      ts.isElementAccessExpression(value)
    ) {
      const owner = origin(value.expression)
      const member = memberName(value)
      if (owner && member) return `${owner}.${member}`
    }
    if (ts.isCallExpression(value) || ts.isNewExpression(value)) {
      const factory = origin(value.expression)
      if (factory === "useWorkflowClient" || factory === "getWorkflowClient")
        return "SessionOperationGateway"
      if (factory === "useQueryClient" || factory === "QueryClient")
        return "QueryClient"
      if (factory && (queryHooks.has(factory) || factory === "QueryObserver"))
        return "QueryObserver"
      if (factory === "useMutation") return "MutationHook"
      if (factory === "MutationObserver") return "MutationObserver"
      if (
        (ts.isPropertyAccessExpression(value.expression) ||
          ts.isElementAccessExpression(value.expression)) &&
        origin(value.expression.expression) === "SessionOperationGateway" &&
        memberName(value.expression) === "reserve"
      )
        return "SessionOperationReservation"
    }
    return undefined
  }
  // Types and initialisers share the same symbols, including constructor properties.
  walk(source, (node) => {
    if (
      (ts.isParameter(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isPropertyDeclaration(node)) &&
      ts.isIdentifier(node.name)
    ) {
      if (node.type && ts.isTypeReferenceNode(node.type)) {
        const kind = origin(node.type.typeName)
        if (kind) bind(node.name, kind)
      }
    }
  })
  // A later declaration can supply an alias used by an earlier function.
  let changed = true
  while (changed) {
    const count = origins.size
    walk(source, (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const kind = expressionOrigin(node.initializer)
        if (kind && ts.isIdentifier(node.name)) bind(node.name, kind)
        if (kind && ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const member = memberName(element.propertyName ?? element.name)
            if (member) bind(element.name, `${kind}.${member}`)
          }
        }
      }
      if (
        ts.isCallExpression(node) &&
        (ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression))
      ) {
        const owner = expressionOrigin(node.expression.expression)
        const method = memberName(node.expression)
        const body =
          owner === "SessionOperationGateway" && method === "execute"
            ? node.arguments[1]
            : owner === "SessionOperationReservation" && method === "run"
              ? node.arguments[0]
              : undefined
        if (
          body &&
          (ts.isArrowFunction(body) || ts.isFunctionExpression(body))
        ) {
          const parameter = body.parameters[0]
          if (parameter) bind(parameter.name, "SessionOperationScope")
        }
      }
    })
    changed = origins.size !== count
  }
  const inBody = (node: ts.Node): boolean => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isFunctionLike(parent) && "parameters" in parent) {
        if (
          parent.parameters.some(
            (parameter) => origin(parameter.name) === "SessionOperationScope",
          )
        )
          return true
      }
    }
    return false
  }
  const awaited = (node: ts.Node): boolean =>
    ts.isAwaitExpression(node.parent) ||
    ts.isReturnStatement(node.parent) ||
    (ts.isArrowFunction(node.parent) && node.parent.body === node)
  const disabled = (node: ts.Expression | undefined): boolean => {
    if (!node || !ts.isObjectLiteralExpression(node)) return false
    let value = false
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) value = false
      if (
        ts.isPropertyAssignment(property) &&
        memberName(property.name) === "enabled"
      )
        value = property.initializer.kind === ts.SyntaxKind.FalseKeyword
    }
    return value
  }
  const scopedFetch = (node: ts.Expression | undefined): boolean =>
    node !== undefined &&
    ts.isObjectLiteralExpression(node) &&
    node.properties.some(
      (property) =>
        ts.isSpreadAssignment(property) &&
        ts.isCallExpression(property.expression) &&
        origin(property.expression.expression) ===
          "scopedSessionQueryOptions" &&
        property.expression.arguments[0] !== undefined &&
        origin(property.expression.arguments[0]) === "SessionOperationScope",
    )

  walk(source, (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const factory = origin(node.expression)
      const args = node.arguments ?? []
      if (factory && (queryHooks.has(factory) || factory === "QueryObserver")) {
        if (!disabled(args[factory === "QueryObserver" ? 1 : 0]))
          report("starts a Query watcher without enabled: false")
      }
      if (factory === "useQueries" || factory === "useSuspenseQueries") {
        const options = args[0]
        const queries =
          options && ts.isObjectLiteralExpression(options)
            ? options.properties.find(
                (property) =>
                  ts.isPropertyAssignment(property) &&
                  memberName(property.name) === "queries",
              )
            : undefined
        if (
          !queries ||
          !ts.isPropertyAssignment(queries) ||
          !ts.isArrayLiteralExpression(queries.initializer) ||
          !queries.initializer.elements.every(disabled)
        )
          report(
            "starts a Query watcher collection without individually disabled watchers",
          )
      }
      let owner: string | undefined
      let method: string | undefined
      if (
        ts.isPropertyAccessExpression(node.expression) ||
        ts.isElementAccessExpression(node.expression)
      ) {
        owner = expressionOrigin(node.expression.expression)
        method = memberName(node.expression)
      } else if (factory?.includes(".")) {
        ;[owner, method] = factory.split(".")
      }
      if (owner === "QueryClient" && method && fetchMethods.has(method)) {
        if (!inBody(node) || !awaited(node) || !scopedFetch(args[0]))
          report(
            "starts a Query fetch outside a scoped body; use scopedSessionQueryOptions",
          )
      }
      if (
        owner === "QueryObserver" &&
        method === "setOptions" &&
        !disabled(args[0])
      )
        report("enables a Query watcher through setOptions")
      if (owner === "QueryObserver" && method === "refetch")
        report(
          "starts a Query fetch from a watcher; fetch inside a scoped body",
        )
      if (
        (owner === "MutationHook" || owner === "MutationObserver") &&
        (method === "mutate" || method === "mutateAsync")
      ) {
        if (
          !inBody(node) ||
          !awaited(node) ||
          (owner === "MutationHook" && method === "mutate")
        )
          report("starts a Query mutation outside an awaited session body")
      }
      if (owner === "QueryClient" && method === "invalidateQueries") {
        const options = args[0]
        if (
          !options ||
          !ts.isObjectLiteralExpression(options) ||
          !options.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              memberName(property.name) === "refetchType" &&
              ts.isStringLiteral(property.initializer) &&
              property.initializer.text === "none",
          )
        )
          report(
            "starts Query refetches through invalidation; use refetchType: none",
          )
      }
    }
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node)) &&
      memberName(node.name) === "queryFn" &&
      !(
        ts.isPropertyAssignment(node) &&
        origin(node.initializer) === "skipToken"
      ) &&
      file !== "packages/renderer-app/src/session/session-query.ts"
    )
      report(
        "defines a Query fetch outside the scoped helper; use scopedSessionQueryOptions",
      )
  })
  return violations
}
