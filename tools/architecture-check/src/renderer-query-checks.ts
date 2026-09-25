import * as ts from "typescript"
import { memberName, walk } from "./desktop-inventory-syntax.js"
import type { RendererSource } from "./renderer-source-origins.js"
import type { Violation } from "./violations.js"

const queryHooks = new Set([
  "query.useQuery",
  "query.useInfiniteQuery",
  "query.useSuspenseQuery",
  "query.useSuspenseInfiniteQuery",
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
export function checkRendererQuerySources(
  sources: readonly RendererSource[],
): Violation[] {
  return sources.flatMap(checkRendererQuerySource)
}

function checkRendererQuerySource({
  source,
  origin,
}: RendererSource): Violation[] {
  const file = source.fileName
  const violations: Violation[] = []
  const report = (message: string) => violations.push({ file, message })
  const inBody = (node: ts.Node): boolean => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isFunctionLike(parent) && "parameters" in parent) {
        if (
          parent.parameters.some(
            (parameter) => origin(parameter.name) === "scope",
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
        origin(property.expression.arguments[0]) === "scope",
    )

  walk(source, (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const factory = origin(node.expression)
      const args = node.arguments ?? []
      if (
        factory &&
        (queryHooks.has(factory) || factory === "query.QueryObserver")
      ) {
        if (!disabled(args[factory === "query.QueryObserver" ? 1 : 0]))
          report("starts a Query watcher without enabled: false")
      }
      if (
        factory === "query.useQueries" ||
        factory === "query.useSuspenseQueries"
      ) {
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
        owner = origin(node.expression.expression)
        method = memberName(node.expression)
      } else if (factory?.includes(".")) {
        ;[owner, method] = factory.split(".")
      }
      if (owner === "queryClient" && method && fetchMethods.has(method)) {
        if (!inBody(node) || !awaited(node) || !scopedFetch(args[0]))
          report(
            "starts a Query fetch outside a scoped body; use scopedSessionQueryOptions",
          )
      }
      if (owner === "observer" && method === "setOptions" && !disabled(args[0]))
        report("enables a Query watcher through setOptions")
      if (owner === "observer" && method === "refetch")
        report(
          "starts a Query fetch from a watcher; fetch inside a scoped body",
        )
      if (
        (owner === "mutationHook" || owner === "mutationObserver") &&
        (method === "mutate" || method === "mutateAsync")
      ) {
        if (
          !inBody(node) ||
          !awaited(node) ||
          (owner === "mutationHook" && method === "mutate")
        )
          report("starts a Query mutation outside an awaited session body")
      }
      if (owner === "queryClient" && method === "invalidateQueries") {
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
        origin(node.initializer) === "query.skipToken"
      ) &&
      file !== "packages/renderer-app/src/session/session-query.ts"
    )
      report(
        "defines a Query fetch outside the scoped helper; use scopedSessionQueryOptions",
      )
  })
  return violations
}
