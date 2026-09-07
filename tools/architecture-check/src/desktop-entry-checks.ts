import * as fs from "node:fs"
import * as ts from "typescript"
import { extractImportPaths } from "./imports.js"
import type { SourceInventory } from "./inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const gateway = "apps/desktop/src/desktop-entry-gateway.ts"
const composition = "apps/desktop/src/main.ts"
const adapter = "apps/desktop/src/desktop-trpc-adapter.ts"
const publicTrpcModules = new Set([
  "@trpc/client",
  "@trpc/server",
  "@trpc/server/rpc",
  "@trpc/server/observable",
])
const protocolHelpers = new Set([
  "parseTRPCMessage",
  "callTRPCProcedure",
  "transformTRPCResponse",
  "getTRPCErrorShape",
  "getTRPCErrorFromUnknown",
])

export function checkDesktopEntryOwnership(
  root: string,
  inventory: SourceInventory,
): Violation[] {
  return inventory.files.flatMap((file) => {
    if (!file.startsWith("apps/desktop/src/") || file.includes("/__tests__/"))
      return []
    return checkDesktopEntrySource(
      file,
      fs.readFileSync(repoPathToAbsolute(root, file), "utf8"),
    )
  })
}

export function checkDesktopEntrySource(
  file: string,
  content: string,
): Violation[] {
  const violations: Violation[] = []
  const report = (message: string) => {
    violations.push({ file, message })
  }
  for (const path of extractImportPaths(content, file)) {
    if (path === "trpc-electron" || path.startsWith("trpc-electron/")) {
      report("imports the retired trpc-electron transport")
    }
    if (path.startsWith("@trpc/") && !publicTrpcModules.has(path)) {
      report(
        `imports unsupported tRPC module "${path}"; use public root, RPC or observable APIs`,
      )
    }
  }
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  )
  const ipcNames = new Set<string>()
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const entry of bindings.elements) {
      const imported = entry.propertyName?.text ?? entry.name.text
      if (
        ["electron", "electron/main"].includes(
          statement.moduleSpecifier.text,
        ) &&
        imported === "ipcMain"
      ) {
        ipcNames.add(entry.name.text)
      }
      if (
        statement.moduleSpecifier.text === "@trpc/server" &&
        imported === "callTRPCProcedure" &&
        file !== adapter
      ) {
        report("dispatches tRPC procedures outside the desktop adapter")
      }
    }
  }

  function allowedCompositionArgument(node: ts.Node): boolean {
    const property = node.parent
    if (
      file !== composition ||
      !ts.isPropertyAssignment(property) ||
      property.name.getText(source) !== "ipc"
    )
      return false
    const object = property.parent
    return (
      ts.isObjectLiteralExpression(object) &&
      ts.isCallExpression(object.parent) &&
      object.parent.expression.getText(source) === "installDesktopEntryGateway"
    )
  }

  function visit(node: ts.Node): void {
    if (file !== gateway) {
      if (
        ts.isCallExpression(node) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        ["ipc-message", "ipc-message-sync"].includes(node.arguments[0].text)
      ) {
        report(
          "registers a raw web-contents IPC listener outside the desktop entry gateway",
        )
      }
      if (
        ts.isIdentifier(node) &&
        ipcNames.has(node.text) &&
        !ts.isImportSpecifier(node.parent) &&
        !allowedCompositionArgument(node)
      ) {
        report("uses raw renderer IPC outside the desktop entry gateway")
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ["ipcMain", "ipc"].includes(node.name.text)
      ) {
        report("accesses raw Electron IPC outside the desktop entry gateway")
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        ["ipcMain", "ipc"].includes(node.argumentExpression.text)
      ) {
        report("accesses raw Electron IPC outside the desktop entry gateway")
      }
      if (
        ts.isBindingElement(node) &&
        (node.propertyName?.getText(source) === "ipcMain" ||
          node.name.getText(source) === "ipcMain")
      ) {
        report("extracts raw renderer IPC outside the desktop entry gateway")
      }
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
      node.name &&
      protocolHelpers.has(node.name.getText(source))
    ) {
      report(
        "defines a copied tRPC protocol helper instead of consuming the public API",
      )
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}
