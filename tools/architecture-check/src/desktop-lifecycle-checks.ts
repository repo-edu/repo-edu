import * as ts from "typescript"
import { memberName, syntaxTree, walk } from "./desktop-inventory-syntax.js"
import type { Violation } from "./violations.js"

const prefix = "apps/desktop/src/"
const sourceOwners = new Map([
  ["unhandledRejection", "desktop-terminal-sources.ts"],
  ["child-process-gone", "desktop-terminal-sources.ts"],
  ["render-process-gone", "desktop-terminal-sources.ts"],
  ["uncaughtException", "main.ts"],
  ["second-instance", "desktop-session-lifetime.ts"],
  ["activate", "desktop-session-lifetime.ts"],
  ["window-all-closed", "desktop-session-lifetime.ts"],
  ["before-quit", "desktop-application.ts"],
  ["did-start-navigation", "desktop-renderer-document.ts"],
  ["will-navigate", "desktop-renderer-document.ts"],
  ["will-redirect", "desktop-renderer-document.ts"],
  ["did-frame-navigate", "desktop-renderer-document.ts"],
  ["did-navigate-in-page", "desktop-renderer-document.ts"],
])
const terminalOwners = new Set([
  "desktop-application.ts",
  "desktop-bootstrap.ts",
  "desktop-entry-gateway.ts",
  "desktop-renderer-document.ts",
  "desktop-terminal-sources.ts",
  "desktop-trpc-adapter.ts",
  "host-admission.ts",
  "host-command-execution.ts",
  "host-request-transport.ts",
  "preload-request-transport.ts",
  "request-persistence.ts",
  "request-port-endpoint.ts",
  "trpc.ts",
])

export function checkDesktopLifecycleSource(
  file: string,
  content: string,
): Violation[] {
  const owner = file.slice(prefix.length)
  const violations: Violation[] = []
  const report = (message: string) => {
    violations.push({ file, message })
  }
  const source = syntaxTree(file, content)
  walk(source, (node) => {
    if (ts.isCallExpression(node)) {
      const name = memberName(node.expression)
      if (
        [
          "on",
          "once",
          "addListener",
          "prependListener",
          "prependOnceListener",
        ].includes(name ?? "")
      ) {
        const event = node.arguments[0]
        if (event && ts.isStringLiteralLike(event)) {
          const expected = sourceOwners.get(event.text)
          if (expected && expected !== owner)
            report(
              `registers ${event.text} outside its ${expected} source owner`,
            )
          if (
            ts.isPropertyAccessExpression(node.expression) &&
            ["app", "process", "options.app", "options.process"].includes(
              node.expression.expression.getText(source),
            ) &&
            !expected &&
            !["exit", "loaded"].includes(event.text)
          )
            report(`registers an unclassified process source ${event.text}`)
        }
      }
      if (
        name === "setWindowOpenHandler" &&
        owner !== "desktop-renderer-document.ts"
      )
        report("installs window admission outside the document owner")
      if (name === "setApplicationMenu" && owner !== "desktop-application.ts")
        report("installs a native menu outside desktop composition")
      if (
        name === "requestSingleInstanceLock" &&
        owner !== "desktop-application.ts"
      )
        report("starts same-program admission outside desktop composition")
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const name = memberName(node)
      if (name === "terminal" && !terminalOwners.has(owner))
        report("adds an unclassified terminal source")
      if (name === "ipcRenderer" && owner !== "preload.ts")
        report("accesses raw renderer transport outside preload")
    }
    if (ts.isPropertyAssignment(node)) {
      if (memberName(node.name) === "role" && owner !== "desktop-menu.ts")
        report("defines a native role outside the menu allowlist")
      if (
        memberName(node.name) === "click" &&
        !["desktop-menu.ts", "desktop-application.ts"].includes(owner)
      )
        report("defines a menu start outside its list owner")
    }
  })
  return violations
}
