import { readFileSync } from "node:fs"
import * as ts from "typescript"
import { SEMANTIC_COURSE_ACTIONS } from "./bespoke-checks.js"
import { memberName, syntaxTree, walk } from "./desktop-inventory-syntax.js"
import type { SourceInventory } from "./inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const renderer = "packages/renderer-app/src/"
const rawClientOwners = new Set([
  "components/App.tsx",
  "session/session-controller.ts",
  "session/session-operations.ts",
  "session/session-persistence.ts",
  "session/session-settings.ts",
  "persistence/create-persister.ts",
  "persistence/course-persister.ts",
  "persistence/settings-persister.ts",
])
const nativeListeners = new Map([
  ["components/App.tsx", "keydown"],
  ["hooks/use-theme.ts", "change"],
  [
    "components/tabs/groups-assignments/GroupSetGroupsTable/GroupSetGroupsTable.tsx",
    "scroll",
  ],
  ["components/tabs/students/use-scroll-back-to-top.ts", "scroll"],
])
const directActions = new Set([
  "pickDirectory",
  "pickUserFile",
  "pickSaveTarget",
])

export function checkRendererMutationOwnership(
  root: string,
  inventory: SourceInventory,
): Violation[] {
  return inventory.files
    .filter(
      (file) => file.startsWith(renderer) && !file.includes("/__tests__/"),
    )
    .flatMap((file) =>
      checkRendererMutationSource(
        file,
        readFileSync(repoPathToAbsolute(root, file), "utf8"),
      ),
    )
}

function inDirectBody(node: ts.Node, action: string): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      ts.isCallExpression(parent) &&
      memberName(parent.expression) === "direct" &&
      parent.arguments[0] &&
      ts.isStringLiteralLike(parent.arguments[0]) &&
      parent.arguments[0].text === action
    )
      return true
  }
  return false
}

/** Captured React input, reserved asynchronous bodies and controller mutations
 * are the three existing mutation routes. No new raw route is admitted here. */
export function checkRendererMutationSource(
  file: string,
  content: string,
): Violation[] {
  const relative = file.slice(renderer.length)
  const source = syntaxTree(file, content)
  const violations: Violation[] = []
  const report = (message: string) => {
    violations.push({ file, message })
  }
  walk(source, (node) => {
    if (
      relative === "stores/slices/types.ts" &&
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === "CourseActions" &&
      ts.isTypeLiteralNode(node.type)
    ) {
      const actions = node.type.members.map((member) =>
        member.name ? memberName(member.name) : undefined,
      )
      const expected = new Set([
        ...SEMANTIC_COURSE_ACTIONS,
        "setAssignmentSelection",
      ])
      for (const action of actions)
        if (!action || !expected.has(action))
          report(`has an unclassified course mutation ${action}`)
      for (const action of expected)
        if (!actions.includes(action))
          report(`has a stale course mutation classification ${action}`)
    }
    if (!rawClientOwners.has(relative)) {
      if (
        (ts.isTypeReferenceNode(node) &&
          (ts.isIdentifier(node.typeName)
            ? node.typeName.text
            : node.typeName.right.text) === "WorkflowClient") ||
        (ts.isImportTypeNode(node) &&
          node.qualifier &&
          (ts.isIdentifier(node.qualifier)
            ? node.qualifier.text
            : node.qualifier.right.text) === "WorkflowClient")
      )
        report("retains a raw WorkflowClient outside an admitted client owner")
      if (
        ts.isImportSpecifier(node) &&
        ["WorkflowClient", "createWorkflowClient"].includes(
          node.propertyName?.text ?? node.name.text,
        )
      )
        report("imports a raw workflow client outside an admitted client owner")
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const member = memberName(node)
      if (member === "setState")
        report("accesses raw store writes outside session mutation admission")
      if (
        member === "controllerClient" &&
        ![
          "session/session-controller.ts",
          "session/session-operations.ts",
        ].includes(relative)
      )
        report("extracts the private controller workflow client")
      if (member && directActions.has(member) && !inDirectBody(node, member))
        report(`starts or extracts ${member} outside its reserved direct body`)
      if (member === "ipcRenderer" || member === "ipcMain")
        report("accesses raw Electron transport from a renderer feature")
    }
    if (
      ts.isBindingElement(node) &&
      directActions.has(memberName(node.propertyName ?? node.name) ?? "")
    )
      report("extracts a direct host action outside its reserved body")
    if (
      ts.isCallExpression(node) &&
      memberName(node.expression) === "addEventListener"
    ) {
      const event = node.arguments[0]
      if (
        !event ||
        !ts.isStringLiteralLike(event) ||
        nativeListeners.get(relative) !== event.text
      )
        report(
          "registers a native event route outside the session input inventory",
        )
    }
  })
  return violations
}
