import type { EntrySelector } from "./desktop-inventory-syntax.js"
import {
  desktopDirectInventory,
  desktopWorkflowInventory,
  requestMessageInventory,
  updaterMessageInventory,
} from "./desktop-workflow-inventory.js"

export type DesktopEntryList = {
  owner: string
  file: string
  selector: EntrySelector
  members: readonly string[]
}

const desktop = "apps/desktop/src/"
const session = "packages/renderer-app/src/session/"
const direct = Object.keys(desktopDirectInventory)
const shell = Object.entries(desktopDirectInventory).filter(
  ([key]) => key !== "bootstrapReady" && key !== "quitAndInstall",
)
const hostStarts = [
  "window-close:close",
  "application-quit:close",
  "menu-close:close",
  "menu-quit:close",
  "menu-update-restart:update-restart",
]

/** Each list is checked at its owner, not treated as a gateway action.
 * Function and event selectors inspect the installed code, not a duplicate
 * runtime manifest that can drift away from the real registrations. */
export const desktopEntryLists: readonly DesktopEntryList[] = [
  {
    owner: "gateway workflow input schemas",
    file: "packages/application-contract/src/workflow-input-schemas.ts",
    selector: { kind: "map", name: "workflowInputSchemas" },
    members: desktopWorkflowInventory.map(([id]) => id),
  },
  {
    owner: "gateway exclusive declarations",
    file: "packages/application-contract/src/exclusive-command-contract.ts",
    selector: { kind: "map", name: "exclusiveCommandDeclarations" },
    members: desktopWorkflowInventory
      .filter(([, host]) => host === "exclusive")
      .map(([id]) => id),
  },
  {
    owner: "gateway workflow starts",
    file: `${desktop}host-entry-inventory.ts`,
    selector: { kind: "map", name: "desktopWorkflowStarts", values: true },
    members: desktopWorkflowInventory.map(([id, host]) => `${id}:${host}`),
  },
  {
    owner: "session workflow classes",
    file: `${session}session-operation-inventory.ts`,
    selector: { kind: "map", name: "sessionWorkflowClasses", values: true },
    members: desktopWorkflowInventory.map(
      ([id, , renderer]) => `${id}:${renderer}`,
    ),
  },
  {
    owner: "gateway shell actions",
    file: `${desktop}host-entry-inventory.ts`,
    selector: { kind: "map", name: "desktopShellActions", values: true },
    members: shell.map(([id, kind]) => `${id}:${kind}`),
  },
  {
    owner: "session direct classes",
    file: `${session}session-operation-inventory.ts`,
    selector: { kind: "map", name: "sessionDirectClasses", values: true },
    members: Object.entries(desktopDirectInventory).map(
      ([id, kind]) => `${id}:${kind}`,
    ),
  },
  {
    owner: "gateway direct schemas",
    file: `${desktop}desktop-wire.ts`,
    selector: {
      kind: "property",
      name: "action",
      within: "desktopDirectMessageSchema",
    },
    members: direct,
  },
  {
    owner: "gateway direct dispatch",
    file: `${desktop}desktop-application.ts`,
    selector: { kind: "cases", expression: "message.action" },
    members: direct,
  },
  {
    owner: "gateway preload actions",
    file: `${desktop}preload.ts`,
    selector: { kind: "property", name: "action" },
    members: direct,
  },
  {
    owner: "ordinary transport lifecycle",
    file: `${desktop}desktop-wire.ts`,
    selector: { kind: "property", name: "method" },
    members: ["subscription", "subscription.stop"],
  },
  {
    owner: "request-port schemas",
    file: `${desktop}request-port-wire.ts`,
    selector: {
      kind: "property",
      name: "type",
      within: "requestMessageSchemas",
    },
    members: requestMessageInventory,
  },
  {
    owner: "reducer host starts",
    file: `${desktop}host-entry-inventory.ts`,
    selector: { kind: "map", name: "desktopHostStarts", values: true },
    members: hostStarts,
  },
  {
    owner: "reducer start dispatch",
    file: `${desktop}desktop-application.ts`,
    selector: { kind: "property", name: "source" },
    members: hostStarts.map((row) => row.split(":")[0]),
  },
  {
    owner: "terminal process adapters",
    file: `${desktop}desktop-terminal-sources.ts`,
    selector: { kind: "call", name: "on" },
    members: [
      "unhandledRejection",
      "child-process-gone",
      "render-process-gone",
    ],
  },
  {
    owner: "terminal document adapters",
    file: `${desktop}desktop-renderer-document.ts`,
    selector: { kind: "call", name: "on" },
    members: [
      "did-start-navigation",
      "will-navigate",
      "will-redirect",
      "did-frame-navigate",
      "did-navigate-in-page",
    ],
  },
  {
    owner: "fatal bootstrap sources",
    file: `${desktop}main.ts`,
    selector: { kind: "call", name: "on" },
    members: ["uncaughtException"],
  },
  {
    owner: "fatal product import",
    file: `${desktop}main.ts`,
    selector: { kind: "call", name: "import" },
    members: ["./desktop-application"],
  },
  {
    owner: "same-program focus and lifetime",
    file: `${desktop}desktop-session-lifetime.ts`,
    selector: { kind: "call", name: "on" },
    members: ["second-instance", "activate", "window-all-closed"],
  },
  {
    owner: "same-program lock",
    file: `${desktop}desktop-application.ts`,
    selector: { kind: "call", name: "requestSingleInstanceLock" },
    members: ["<no-argument>"],
  },
  {
    owner: "main-process menu definitions",
    file: `${desktop}desktop-menu.ts`,
    selector: { kind: "callback-calls", property: "click" },
    members: [
      "options.documentation",
      "options.about",
      "options.close",
      "options.quit",
    ],
  },
  {
    owner: "updater menu starts",
    file: `${desktop}desktop-application.ts`,
    selector: {
      kind: "callback-calls",
      property: "click",
      within: "buildUpdateMenuItems",
    },
    members: [
      "checkForUpdatesNow",
      "downloadUpdate",
      "admission.dispatch",
      "closeRequest",
    ],
  },
  {
    owner: "native-menu allowlist",
    file: `${desktop}desktop-menu.ts`,
    selector: { kind: "property", name: "role" },
    members: [
      "services",
      "hide",
      "hideOthers",
      "unhide",
      "editMenu",
      "resetZoom",
      "zoomIn",
      "zoomOut",
      "togglefullscreen",
      "windowMenu",
    ],
  },
  {
    owner: "updater transport schemas",
    file: `${desktop}updater-wire.ts`,
    selector: { kind: "map", name: "updaterMessageSchemas" },
    members: updaterMessageInventory,
  },
  {
    owner: "updater transport channels",
    file: `${desktop}updater-wire.ts`,
    selector: { kind: "map", name: "updaterMessageChannels" },
    members: updaterMessageInventory,
  },
  {
    owner: "updater presentation sends",
    file: `${desktop}auto-updater.ts`,
    selector: { kind: "call", name: "sendUpdaterMessage" },
    members: updaterMessageInventory,
  },
  {
    owner: "updater presentation validation",
    file: `${desktop}preload.ts`,
    selector: { kind: "call", name: "parseUpdaterMessage" },
    members: updaterMessageInventory,
  },
]
