import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import {
  createRendererHostFromBridge,
  type DesktopRendererHostBridge,
  desktopRendererHostChannels,
} from "../renderer-host-bridge.js"

describe("desktop renderer host bridge parity", () => {
  it("bridge channels cover all RendererHost methods plus desktop extras", () => {
    const rendererHostChannels: Record<
      keyof RendererHost,
      keyof typeof desktopRendererHostChannels
    > = {
      pickUserFile: "pickUserFile",
      pickSaveTarget: "pickSaveTarget",
      pickDirectory: "pickDirectory",
      setNativeTheme: "setNativeTheme",
      onCloseRequest: "requestClose",
      onCloseCancel: "cancelClose",
    }

    const channelKeys = Object.keys(desktopRendererHostChannels)

    for (const [method, channel] of Object.entries(rendererHostChannels)) {
      assert.ok(
        channelKeys.includes(channel),
        `Missing bridge channel for RendererHost.${method}`,
      )
    }
  })

  it("all channel values are unique", () => {
    const values = Object.values(desktopRendererHostChannels)
    const unique = new Set(values)
    assert.equal(values.length, unique.size, "Duplicate channel values found")
  })

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
