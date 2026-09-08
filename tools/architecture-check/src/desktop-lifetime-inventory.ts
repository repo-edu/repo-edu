import type { DesktopEntryList } from "./desktop-source-inventory.js"

const desktop = "apps/desktop/src/"

/** Runtime bindings for Decision 21's terminal and fatal source lists. These
 * checks do not impose renderer sender proof on main-process events. */
export const desktopLifetimeLists: readonly DesktopEntryList[] = [
  {
    owner: "terminal child-loss classification",
    file: `${desktop}desktop-terminal-sources.ts`,
    selector: { kind: "comparison", expression: "details.reason" },
    members: ["===:clean-exit"],
  },
  {
    owner: "terminal adapters only report",
    file: `${desktop}desktop-terminal-sources.ts`,
    selector: { kind: "calls", within: "installDesktopTerminalSources" },
    members: [
      "options.process.on",
      "options.app.on",
      "contents.on",
      "terminal",
    ],
  },
  {
    owner: "terminal archive boundary",
    file: `${desktop}desktop-terminal-sources.ts`,
    selector: { kind: "calls", within: "access" },
    members: ["body", "terminal"],
  },
  {
    owner: "terminal archive installation",
    file: `${desktop}desktop-bootstrap.ts`,
    selector: {
      kind: "call",
      name: "observeDesktopExaminationStorage",
      argument: 1,
    },
    members: ["<dynamic:admission.terminal>"],
  },
  {
    owner: "terminal course and settings failures",
    file: `${desktop}trpc.ts`,
    selector: { kind: "call", name: "ctx.terminal" },
    members: ["<dynamic:error>"],
  },
  {
    owner: "terminal preparation failures",
    file: `${desktop}request-persistence.ts`,
    selector: { kind: "call", name: "admission.terminal" },
    members: ["<dynamic:error>"],
  },
  {
    owner: "terminal command failures",
    file: `${desktop}host-command-execution.ts`,
    selector: { kind: "call", name: "admission.terminal" },
    members: ["<dynamic:error>", "<dynamic:failure>"],
  },
  {
    owner: "terminal port loss and malformed messages",
    file: `${desktop}request-port-endpoint.ts`,
    selector: { kind: "calls", within: "fail" },
    members: ["options.terminal", "dispose"],
  },
  {
    owner: "terminal invalid port admission",
    file: `${desktop}request-port-endpoint.ts`,
    selector: { kind: "calls", within: "accept" },
    members: ["parse", "options.permit", "advanceRequestProtocol"],
  },
  {
    owner: "terminal renderer-created window",
    file: `${desktop}desktop-renderer-document.ts`,
    selector: { kind: "property", name: "action" },
    members: ["deny"],
  },
  {
    owner: "fatal exception binding",
    file: `${desktop}main.ts`,
    selector: { kind: "call", name: "on", argument: 1 },
    members: ["<dynamic:fatalDesktop>"],
  },
  {
    owner: "fatal synchronous action",
    file: `${desktop}main.ts`,
    selector: { kind: "calls", within: "fatalDesktop" },
    members: ["String", "writeSync", "process.exit"],
  },
  {
    owner: "fatal rejected import and thrown installer",
    file: `${desktop}main.ts`,
    selector: { kind: "call", name: "fatalDesktop" },
    members: ["<dynamic:error>"],
  },
  {
    owner: "fatal synchronous product installer",
    file: `${desktop}main.ts`,
    selector: { kind: "call", name: "installDesktopApplication" },
    members: ["<no-argument>"],
  },
  {
    owner: "same-program focus action",
    file: `${desktop}desktop-session-lifetime.ts`,
    selector: { kind: "calls", within: "focus" },
    members: [
      "options.getWindow",
      "window.isMinimized",
      "window.restore",
      "window.focus",
    ],
  },
  {
    owner: "same-program focus binding",
    file: `${desktop}desktop-session-lifetime.ts`,
    selector: { kind: "call", name: "on", argument: 1 },
    members: ["<dynamic:focus>", "<dynamic:options.close>"],
  },
]
