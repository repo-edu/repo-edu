import * as ts from "typescript"
import {
  memberName,
  syntaxTree,
  unwrap,
  walk,
} from "./desktop-inventory-syntax.js"

export interface RendererSource {
  source: ts.SourceFile
  origin: (node: ts.Node) => string | undefined
}

export function rendererSources(
  sources: readonly { file: string; content: string }[],
): RendererSource[] {
  const files = new Map(
    sources.map(({ file, content }) => [file, syntaxTree(file, content)]),
  )
  const host = ts.createCompilerHost({})
  host.getSourceFile = (file) => files.get(file)
  const program = ts.createProgram(
    [...files.keys()],
    { noLib: true, noResolve: true },
    host,
  )
  const checker = program.getTypeChecker()
  return [...files.values()].map((source) => ({
    source,
    origin: rendererOrigins(source, checker),
  }))
}

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
  if (path.endsWith("/session-operations.js")) {
    if (name === "SessionOperationGateway") return "gateway"
    if (name === "SessionOperationScope") return "scope"
    if (name === "SessionOperationReservation") return "reservation"
  }
  if (
    path.endsWith("/session-query.js") &&
    name === "scopedSessionQueryOptions"
  )
    return "scopedSessionQueryOptions"
  if (path.endsWith("/session-controller.js") && name === "SessionController")
    return "controller"
  if (
    path.endsWith("/session-controller-context.js") &&
    ["useSessionController", "getSessionController"].includes(name)
  )
    return "controllerFactory"
  if (
    path.endsWith("/session-controller-context.js") &&
    name === "useSessionControllerSelector"
  )
    return "store"
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

const queryReturns = new Map([
  ["query.useQuery", "observer"],
  ["query.useInfiniteQuery", "observer"],
  ["query.useSuspenseQuery", "observer"],
  ["query.useSuspenseInfiniteQuery", "observer"],
  ["query.useQueries", "observer"],
  ["query.useSuspenseQueries", "observer"],
  ["query.QueryObserver", "observer"],
  ["query.InfiniteQueryObserver", "observer"],
  ["query.QueriesObserver", "observer"],
  ["query.QueryClient", "queryClient"],
  ["query.useQueryClient", "queryClient"],
  ["query.QueryCache", "queryCache"],
  ["query.useMutation", "mutationHook"],
  ["query.MutationObserver", "mutationObserver"],
])

function rendererOrigins(source: ts.SourceFile, checker: ts.TypeChecker) {
  const origins = new Map<ts.Symbol, string>()
  const namespaces = new Map<ts.Symbol, string>()
  const bind = (node: ts.Node, kind: string) => {
    const symbol = checker.getSymbolAtLocation(node)
    if (symbol && !origins.has(symbol)) origins.set(symbol, kind)
  }
  const memberOrigin = (kind: string, member: string) =>
    kind === "controller" && member === "operations"
      ? "gateway"
      : `${kind}.${member}`
  const origin = (node: ts.Node): string | undefined => {
    const symbol = checker.getSymbolAtLocation(node)
    const known = symbol && origins.get(symbol)
    if (known) return known
    if (ts.isTypeReferenceNode(node)) {
      const kind = origin(node.typeName)
      return kind && (queryReturns.get(kind) ?? kind)
    }
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
      if (kind && member) return memberOrigin(kind, member)
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
      if (factory === "gateway.reserve") return "reservation"
      if (
        factory === "controllerFactory" ||
        (factory === "controller" && ts.isNewExpression(node))
      )
        return "controller"
      const queryReturn = factory && queryReturns.get(factory)
      if (queryReturn) return queryReturn
      if (factory === "queryClient.getQueryCache") return "queryCache"
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
      if (ts.isCallExpression(node)) {
        const method = origin(node.expression)
        const body =
          method === "gateway.execute"
            ? node.arguments[2]
            : method === "reservation.run"
              ? node.arguments[0]
              : undefined
        if (
          body &&
          (ts.isArrowFunction(body) || ts.isFunctionExpression(body))
        ) {
          const parameter = body.parameters[0]
          if (parameter) bind(parameter.name, "scope")
        }
      }
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
          if (member) bind(element.name, memberOrigin(kind, member))
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
