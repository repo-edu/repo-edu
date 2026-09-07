import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { it } from "node:test"
import type { App } from "electron"
import { installDesktopSessionLifetime } from "../desktop-session-lifetime"
import { HostAdmission } from "../host-admission"

it("activation during startup does not create a renderer and quit needs no renderer preparation", () => {
  const app = new EventEmitter()
  const events: string[] = []
  const admission = new HostAdmission((effect) => events.push(effect.type))
  installDesktopSessionLifetime({
    app: app as Pick<App, "on">,
    getWindow: () => undefined,
    close: () => {
      admission.dispatch({
        type: "host-start",
        source: "application-quit",
        request: { cancel() {} },
      })
    },
  })
  app.emit("activate")
  app.emit("second-instance")
  assert.deepEqual(events, [])
  app.emit("window-all-closed")
  app.emit("activate")
  assert.deepEqual(events, ["end-host"])
})

it("last-window close ends the host and activation cannot replace the session", () => {
  const app = new EventEmitter()
  const events: string[] = []
  let window:
    | { isMinimized(): boolean; restore(): void; focus(): void }
    | undefined = {
    isMinimized: () => true,
    restore: () => events.push("restore"),
    focus: () => events.push("focus"),
  }
  const admission = new HostAdmission((effect) => {
    events.push(effect.type)
    if (effect.type === "prepare-close") {
      admission.dispatch({ type: "close-ready", request: effect.request })
    }
  })
  admission.dispatch({ type: "bootstrap-acknowledged" })
  installDesktopSessionLifetime({
    app: app as Pick<App, "on">,
    getWindow: () => window,
    close: () => {
      admission.dispatch({
        type: "host-start",
        source: "application-quit",
        request: { cancel() {} },
      })
    },
  })
  app.emit("activate")
  app.emit("second-instance")
  assert.deepEqual(events, ["restore", "focus", "restore", "focus"])
  events.length = 0
  window = undefined
  app.emit("window-all-closed")
  app.emit("activate")
  app.emit("second-instance")
  app.emit("window-all-closed")
  assert.deepEqual(events, ["prepare-close", "end-host"])
})
