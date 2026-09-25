import * as ts from "typescript"
import { memberName, unwrap, walk } from "./desktop-inventory-syntax.js"

/** Known API identities only. This never inspects a called function's body. */
function importedOrigin(path: string, name: string): string | undefined {
  if (path === "react") return `react.${name}`
  if (path === "@tanstack/react-query") return `query.${name}`
  if (path === "zustand" || path === "zustand/vanilla") return `zustand.${name}`
  if (path.endsWith("/session-start.js") && name === "bindSessionStart")
    return "binding"
  if (
    path.endsWith("/workflow-client.js") &&
    ["useWorkflowClient", "getWorkflowClient"].includes(name)
  )
    return "gatewayFactory"
  if (
    path.endsWith("/session-operations.js") &&
    name === "SessionOperationGateway"
  )
    return "gateway"
  if (path.endsWith("/session-controller.js") && name === "SessionController")
    return "controller"
  if (
    path.endsWith("/session-controller-context.js") &&
    ["useSessionController", "getSessionController"].includes(name)
  )
    return "controllerFactory"
  if (
    path.endsWith("/source-lifecycle-events.js") &&
    name === "subscribeCourseRemoval"
  )
    return "subscription"
  if (
    (path.includes("/stores/") || path.endsWith("-store.js")) &&
    /^use[A-Z].*Store$/.test(name)
  )
    return "store"
  return undefined
}

const queryFactories = new Set([
  "useQuery",
  "useInfiniteQuery",
  "useSuspenseQuery",
  "useSuspenseInfiniteQuery",
  "useQueries",
  "useSuspenseQueries",
  "QueryObserver",
  "InfiniteQueryObserver",
  "QueriesObserver",
  "QueryClient",
  "useQueryClient",
  "QueryCache",
])

export function rendererStartOrigins(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
) {
  const origins = new Map<ts.Symbol, string>()
  const namespaces = new Map<ts.Symbol, string>()
  const bind = (node: ts.Node, kind: string) => {
    const symbol = checker.getSymbolAtLocation(node)
    if (symbol && !origins.has(symbol)) origins.set(symbol, kind)
  }
  const origin = (node: ts.Node): string | undefined => {
    const symbol = checker.getSymbolAtLocation(node)
    const known = symbol && origins.get(symbol)
    if (known) return known
    if (ts.isTypeReferenceNode(node)) return origin(node.typeName)
    if (ts.isQualifiedName(node)) {
      const owner = checker.getSymbolAtLocation(node.left)
      const path = owner && namespaces.get(owner)
      if (path) return importedOrigin(path, node.right.text)
    }
    if (
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node)
    )
      return origin(node.expression)
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const owner = checker.getSymbolAtLocation(node.expression)
      const path = owner && namespaces.get(owner)
      const member = memberName(node)
      if (path && member) return importedOrigin(path, member)
      const kind = origin(node.expression)
      if (kind && member) return `${kind}.${member}`
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const factory = origin(node.expression)
      if (factory === "binding") return "boundHandler"
      // React's memo wrappers retain this explicitly constructed local binding.
      // Do not infer returns from named callbacks or arbitrary helper bodies.
      const argument = node.arguments?.[0]
      if (
        factory === "react.useCallback" &&
        argument &&
        origin(argument) === "boundHandler"
      )
        return "boundHandler"
      if (factory === "react.useMemo" && argument) {
        const callback = unwrap(argument)
        if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
          const body = callback.body
          const returned = ts.isBlock(body)
            ? body.statements.length === 1 &&
              ts.isReturnStatement(body.statements[0])
              ? body.statements[0].expression
              : undefined
            : body
          if (returned && origin(returned) === "boundHandler")
            return "boundHandler"
        }
      }
      if (factory === "gatewayFactory") return "gateway"
      if (
        factory === "controllerFactory" ||
        (factory === "controller" && ts.isNewExpression(node))
      )
        return "controller"
      if (factory?.startsWith("query.") && queryFactories.has(factory.slice(6)))
        return "observer"
      if (factory === "observer.getQueryCache") return "observer"
      if (
        ["zustand.create", "zustand.createStore", "storeFactory"].includes(
          factory ?? "",
        )
      )
        return node.arguments?.length ? "store" : "storeFactory"
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
    const clause = statement.importClause
    if (clause?.name && path === "react") {
      const symbol = checker.getSymbolAtLocation(clause.name)
      if (symbol) namespaces.set(symbol, path)
    }
    const bindings = clause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) {
      const symbol = checker.getSymbolAtLocation(bindings.name)
      if (symbol) namespaces.set(symbol, path)
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const kind = importedOrigin(
          path,
          element.propertyName?.text ?? element.name.text,
        )
        if (kind) bind(element.name, kind)
      }
    }
  }
  // Resolve aliases by symbols, including forward declarations and shadowing.
  // There is no call graph: only known factories contribute return identities.
  let changed = true
  while (changed) {
    const count = origins.size + namespaces.size
    walk(source, (node) => {
      if (
        !(
          ts.isVariableDeclaration(node) ||
          ts.isParameter(node) ||
          ts.isPropertyDeclaration(node)
        )
      )
        return
      const kind =
        (node.type && origin(node.type)) ||
        (node.initializer && origin(node.initializer))
      if (kind && ts.isIdentifier(node.name)) bind(node.name, kind)
      if (kind && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const member = memberName(element.propertyName ?? element.name)
          if (member) bind(element.name, `${kind}.${member}`)
        }
      }
      if (node.initializer) {
        const from = checker.getSymbolAtLocation(unwrap(node.initializer))
        const path = from && namespaces.get(from)
        if (path && ts.isIdentifier(node.name)) {
          const to = checker.getSymbolAtLocation(node.name)
          if (to && !namespaces.has(to)) namespaces.set(to, path)
        }
        if (path && ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const member = memberName(element.propertyName ?? element.name)
            const kind = member && importedOrigin(path, member)
            if (kind) bind(element.name, kind)
          }
        }
      }
    })
    changed = origins.size + namespaces.size !== count
  }
  return origin
}
