import assert from "node:assert/strict"
import { it } from "node:test"
import { childProcessUnconfirmedTreeMessage } from "@repo-edu/host-node/child-process-lifetime"
import type { Details } from "electron"
import { runDesktopEntry } from "./desktop-entry-harness"
import { terminalCollaborators } from "./desktop-terminal-collaborators"

async function proveTerminal(
  trigger: string,
  unconfirmed = false,
  failure = true,
) {
  const exitCode = unconfirmed || failure ? 1 : 0
  const result = await runDesktopEntry({
    collaborators: terminalCollaborators(trigger, unconfirmed, failure),
  })
  assert.equal(result.error, undefined)
  assert.equal(result.signal, null)
  assert.equal(result.status, exitCode, result.stderr)
  assert.equal(result.stderr, "")
  const events = result.events
  assert.equal(events.filter((event) => event === "stop-owned-work").length, 1)
  const ordered = [
    "held",
    "interactive",
    "stop-owned-work",
    "ending-pending",
    unconfirmed ? "unconfirmed" : "confirmed",
    "close-storage",
    ...(unconfirmed
      ? [
          "warning:Repo Edu could not confirm shutdown",
          childProcessUnconfirmedTreeMessage,
        ]
      : []),
    `app-exit:${exitCode}`,
    `process-exit:${exitCode}`,
    "release",
  ]
  let previous = -1
  for (const event of ordered) {
    const index = events.indexOf(event)
    assert.ok(index > previous, `${event}: ${events.join(", ")}`)
    assert.equal(events.filter((value) => value === event).length, 1, event)
    previous = index
  }
  assert.equal(
    events.includes(unconfirmed ? "confirmed" : "unconfirmed"),
    false,
  )
  assert.equal(
    events.filter((event) => event.startsWith("warning:")).length,
    unconfirmed ? 1 : 0,
  )
  assert.equal(
    events.some((event) => event.startsWith("unexpected-")),
    false,
  )
  return events
}

for (const unconfirmed of [false, true]) {
  it(`real clean-close port drains persistence before ${unconfirmed ? "expiry" : "confirmation"} and exit`, async () => {
    const events = await proveTerminal(
      'app.quit(); closePort.receive({ type: "bundle", bundle: {} }); await turn(); closePort.receive({ type: "close-ready" })',
      unconfirmed,
      false,
    )
    assert.ok(
      events.indexOf("port:persisted") <
        events.indexOf("port:close-acknowledged"),
    )
    assert.ok(
      events.indexOf("port:close-acknowledged") <
        events.indexOf("stop-owned-work"),
    )
  })
}

it("update restart through the real gateway and close port skips installation on expiry", async () => {
  await proveTerminal(
    'invoke({ action: "quitAndInstall" }); closePort.receive({ type: "bundle", bundle: {} }); await turn(); closePort.receive({ type: "close-ready" })',
    true,
    false,
  )
})

const invalidEntries = {
  "foreign sender": "send(null, [], { ...event, sender: {} })",
  "foreign direct sender":
    'invoke({ action: "bootstrapReady" }, { ...event, senderFrame: null })',
  "malformed envelope": "send(null)",
  "unknown gateway kind": 'send({ kind: "unknown" })',
  "unknown direct action": 'invoke({ action: "unknown" })',
  "malformed direct payload":
    'invoke({ action: "setNativeTheme", input: "invalid" })',
  "malformed workflow input":
    'send({ kind: "trpc", message: { id: 1, method: "subscription", params: { path: "course.save", input: null } } })',
  "invalid command":
    'send({ kind: "command-intent", workflowId: "course.list" }, [new Port()])',
  "missing intent port":
    'send({ kind: "command-intent", workflowId: "userFile.exportPreview" })',
  "extra intent port":
    'send({ kind: "command-intent", workflowId: "userFile.exportPreview" }, [new Port(), new Port()])',
  "malformed command message": "command().receive(null)",
  "unknown command message": 'command().receive({ type: "unknown" })',
  "invalid persistence bundle":
    'command().receive({ type: "bundle", bundle: { course: null } })',
  "early acknowledgement": 'command().receive({ type: "acknowledged" })',
  "wrong direction": 'command().receive({ type: "prepare" })',
  "duplicate cancellation":
    'const port = command(); port.receive({ type: "cancel" }); port.receive({ type: "cancel" })',
  "duplicate persistence":
    'const port = command(); port.receive({ type: "bundle", bundle: {} }); await turn(); port.receive({ type: "bundle", bundle: {} })',
  "transferred request port":
    'command().receive({ type: "bundle", bundle: {} }, [new Port()])',
  "current command port loss": "command().close()",
  "malformed close message": "app.quit(); closePort.receive(null)",
  "early close ready": 'app.quit(); closePort.receive({ type: "close-ready" })',
  "command message on close port":
    'app.quit(); closePort.receive({ type: "cancel" })',
  "current close port loss": "app.quit(); closePort.close()",
  "renderer loss":
    'contents.emit("render-process-gone", {}, { reason: "clean-exit" })',
  "rejected navigation":
    'contents.emit("will-navigate", { preventDefault() {} })',
  "renderer-created window": "window.openWindow()",
}

for (const [source, trigger] of Object.entries(invalidEntries)) {
  for (const unconfirmed of [false, true]) {
    it(`installed ${source} exits through one ${unconfirmed ? "unconfirmed" : "confirmed"} ending`, async () => {
      await proveTerminal(trigger, unconfirmed)
    })
  }
}

// New Electron types or reasons must extend this proof; unknown values fail closed.
const childTypes: Record<Details["type"], true> = {
  Utility: true,
  Zygote: true,
  "Sandbox helper": true,
  GPU: true,
  "Pepper Plugin": true,
  "Pepper Plugin Broker": true,
  Unknown: true,
}
const childReasons: Record<Details["reason"], true> = {
  "clean-exit": true,
  "abnormal-exit": true,
  killed: true,
  crashed: true,
  oom: true,
  "launch-failed": true,
  "integrity-failure": true,
  "memory-eviction": true,
}

for (const type of [...Object.keys(childTypes), "Future child"]) {
  for (const reason of [...Object.keys(childReasons), "future-reason"]) {
    it(`installed Electron child adapter handles ${type}/${reason}`, async () => {
      const trigger = `app.emit("child-process-gone", {}, ${JSON.stringify({ type, reason })})`
      await proveTerminal(
        reason === "clean-exit"
          ? `${trigger}; await turn(); assert.equal(typeof globalThis.finishEnding, "undefined"); trace("clean-child-survived"); contents.emit("render-process-gone", {}, { reason: "crashed" })`
          : trigger,
      )
    })
  }
}
