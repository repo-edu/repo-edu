import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createRendererHostFromBridge,
  type DesktopRendererHostBridge,
} from "../renderer-host-bridge.js"

describe("desktop renderer host bridge parity", () => {
  it("createRendererHostFromBridge delegates all calls to the bridge", async () => {
    const calls: string[] = []

    const bridge: DesktopRendererHostBridge = {
      async pickUserFile() {
        calls.push("pickUserFile")
        return null
      },
      async pickSaveTarget() {
        calls.push("pickSaveTarget")
        return null
      },
      async pickDirectory() {
        calls.push("pickDirectory")
        return null
      },
      async setNativeTheme() {
        calls.push("setNativeTheme")
      },
      onCloseRequest() {
        calls.push("onCloseRequest")
        return () => {}
      },
      onCloseCancel() {
        calls.push("onCloseCancel")
        return () => {}
      },
    }

    const host = createRendererHostFromBridge(bridge)

    await host.pickUserFile()
    await host.pickSaveTarget()
    await host.pickDirectory()
    await host.setNativeTheme("system")
    const unsubscribeClose = host.onCloseRequest(async () => {})
    const unsubscribeCancel = host.onCloseCancel(() => {})
    unsubscribeClose()
    unsubscribeCancel()

    assert.deepEqual(calls, [
      "pickUserFile",
      "pickSaveTarget",
      "pickDirectory",
      "setNativeTheme",
      "onCloseRequest",
      "onCloseCancel",
    ])
  })
})
