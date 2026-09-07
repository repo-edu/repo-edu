import assert from "node:assert/strict"
import { it } from "node:test"
import { checkDesktopEntrySource } from "../desktop-entry-checks.js"

const feature = "apps/desktop/src/feature.ts"
for (const source of [
  'import { ipcMain } from "electron"; ipcMain.on("intent", handler)',
  'import { ipcMain as ipc } from "electron"; const register = ipc.handle; register("trpc", handler)',
  'import * as electron from "electron"; electron.ipcMain.handle("direct", handler)',
  'const { ipcMain: ipc } = require("electron"); ipc.on("intent", handler)',
  'window.webContents.ipc.on("intent", handler)',
  'window.webContents["ipc"].handle("direct", handler)',
  'window.webContents.on("ipc-message", handler)',
  'import { callTRPCProcedure as call } from "@trpc/server"',
  'import { parseTRPCMessage } from "@trpc/server/unstable-core-do-not-import"',
  'const transport = require("trpc-electron/main")',
  "function parseTRPCMessage(raw) { return raw }",
]) {
  it(`rejects a transport ownership bypass: ${source}`, () => {
    assert.ok(checkDesktopEntrySource(feature, source).length > 0)
  })
}

it("allows composition to hand IPC to the gateway without registering handlers", () => {
  assert.deepEqual(
    checkDesktopEntrySource(
      "apps/desktop/src/desktop-application.ts",
      `
    import { ipcMain } from "electron"
    installDesktopEntryGateway({ ipc: ipcMain })
  `,
    ),
    [],
  )
})

it("permits gateway registration and public adapter APIs", () => {
  assert.deepEqual(
    checkDesktopEntrySource(
      "apps/desktop/src/desktop-entry-gateway.ts",
      `
    import { ipcMain } from "electron"
    ipcMain.on("entry", receive)
  `,
    ),
    [],
  )
  assert.deepEqual(
    checkDesktopEntrySource(
      "apps/desktop/src/desktop-trpc-adapter.ts",
      `
    import { callTRPCProcedure, transformTRPCResponse } from "@trpc/server"
    import { parseTRPCMessage } from "@trpc/server/rpc"
  `,
    ),
    [],
  )
})
