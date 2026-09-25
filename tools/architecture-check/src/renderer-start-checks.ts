import * as ts from "typescript"
import {
  memberName,
  syntaxTree,
  unwrap,
  walk,
} from "./desktop-inventory-syntax.js"
import { rendererStartOrigins } from "./renderer-start-origins.js"
import type { Violation } from "./violations.js"

const admissions = new Set([
  "gateway.execute",
  "gateway.reserve",
  "controller.activateSurface",
  "controller.createCourse",
  "controller.renameCourse",
  "controller.duplicateCourse",
  "controller.deleteCourse",
])
const effects = new Set([
  "react.useEffect",
  "react.useLayoutEffect",
  "react.useInsertionEffect",
])
const queryOptions = new Set([
  "query.useQuery",
  "query.useInfiniteQuery",
  "query.useSuspenseQuery",
  "query.useSuspenseInfiniteQuery",
  "query.useQueries",
  "query.useSuspenseQueries",
  "query.QueryObserver",
  "query.InfiniteQueryObserver",
  "query.QueriesObserver",
  "observer.setOptions",
])
type Context = "render" | "effect" | "Query observer" | "store subscription"
type FunctionBody = ts.FunctionLikeDeclaration & { body: ts.ConciseBody }

function hasBody(node: ts.Node): node is FunctionBody {
  return ts.isFunctionLike(node) && "body" in node && node.body !== undefined
}

export function checkRendererStartSources(
  sources: readonly { file: string; content: string }[],
): Violation[] {
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
  return [...files.values()].flatMap((source) =>
    checkSource(source, program.getTypeChecker()),
  )
}

function checkSource(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): Violation[] {
  const origin = rendererStartOrigins(source, checker)
  const contexts = new Map<ts.Node, Context>()
  const violations: Violation[] = []
  const callback = (node: ts.Expression | undefined, context: Context) => {
    if (!node) return
    const value = unwrap(node)
    // Named callback references deliberately remain outside this local contract.
    if (hasBody(value)) contexts.set(value, context)
  }
  const options = (node: ts.Node) => {
    if (hasBody(node)) {
      contexts.set(node, "Query observer")
      return
    }
    ts.forEachChild(node, options)
  }
  walk(source, (node) => {
    if (hasBody(node)) {
      const name = node.name
        ? memberName(node.name)
        : ts.isVariableDeclaration(node.parent)
          ? memberName(node.parent.name)
          : undefined
      if (name && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name)))
        contexts.set(node, "render")
    }
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return
    const api = origin(node.expression)
    const args = node.arguments ?? []
    if (api && effects.has(api)) callback(args[0], "effect")
    if (
      api === "react.memo" ||
      api === "react.forwardRef" ||
      api === "react.useMemo" ||
      api === "react.useState"
    )
      callback(args[0], "render")
    if (api === "react.useSyncExternalStore") {
      for (const arg of args) callback(arg, "store subscription")
    }
    if (api && queryOptions.has(api)) {
      for (const arg of args) options(arg)
    }
    if (api === "observer.subscribe") callback(args[0], "Query observer")
    if (
      api === "subscription" ||
      api === "store.subscribe" ||
      api === "controller.subscribe"
    ) {
      for (const arg of args) callback(arg, "store subscription")
    }
    // A store hook's selector is evaluated automatically too.
    if (api === "store") callback(args[0], "store subscription")
  })
  const visit = (node: ts.Node, context?: Context) => {
    if (hasBody(node)) {
      // Function creation does not execute its body. Only a recognised inline
      // callback or a directly invoked function inherits an automatic context.
      let parent: ts.Node = node
      while (ts.isParenthesizedExpression(parent.parent)) parent = parent.parent
      const invoked =
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent
      context = contexts.get(node) ?? (invoked ? context : undefined)
    }
    if (ts.isCallExpression(node) && context) {
      const api = origin(node.expression)
      if (
        api &&
        (admissions.has(api) ||
          api === "boundHandler" ||
          (api === "binding" && context !== "render"))
      ) {
        const position = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        )
        violations.push({
          file: source.fileName,
          message: `starts or binds user work directly in ${context} at line ${position.line + 1}; use a start-table control event`,
        })
      }
    }
    ts.forEachChild(node, (child) => visit(child, context))
  }
  visit(source)
  return violations
}
