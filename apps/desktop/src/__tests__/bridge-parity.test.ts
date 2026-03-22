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
    const rendererHostMethods: (keyof RendererHost)[] = [
      "pickUserFile",
      "pickSaveTarget",
      "pickDirectory",
      "openExternalUrl",
      "getEnvironmentSnapshot",
    ]

    const channelKeys = Object.keys(desktopRendererHostChannels)

    for (const method of rendererHostMethods) {
      assert.ok(
        channelKeys.includes(method),
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
      async openExternalUrl() {
        calls.push("openExternalUrl")
      },
      async getEnvironmentSnapshot() {
        calls.push("getEnvironmentSnapshot")
        return {
          shell: "electron-renderer" as const,
          theme: "system" as const,
          windowChrome: "system" as const,
          canPromptForFiles: true,
          lastOpenedExternalUrl: null,
        }
      },
      async setNativeTheme() {
        calls.push("setNativeTheme")
      },
      async revealCoursesDirectory() {
        calls.push("revealCoursesDirectory")
      },
    }

    const host = createRendererHostFromBridge(bridge)

    await host.pickUserFile()
    await host.pickSaveTarget()
    await host.pickDirectory()
    await host.openExternalUrl("https://example.com")
    await host.getEnvironmentSnapshot()

    assert.deepEqual(calls, [
      "pickUserFile",
      "pickSaveTarget",
      "pickDirectory",
      "openExternalUrl",
      "getEnvironmentSnapshot",
    ])
  })
})
