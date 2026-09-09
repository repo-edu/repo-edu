import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import { updateRestartRefusedMessage } from "../../src/renderer-host-bridge"
import { createPackagedTrustRuntime } from "./packaged-trust-runtime"

test("offers restart retry only for a downloaded update", async () => {
  const runtime = await createPackagedTrustRuntime()
  let application: Awaited<ReturnType<typeof runtime.launch>> | undefined
  try {
    const bundle = await build({
      stdin: {
        resolveDir: resolve(import.meta.dirname, "../../src"),
        sourcefile: "update-dialog-test.tsx",
        loader: "tsx",
        contents: `
          import { createRoot } from "react-dom/client"
          import { UpdateDialog } from "./UpdateDialog"
          const listeners = new Map()
          const listen = name => callback => {
            listeners.set(name, callback)
            return () => listeners.delete(name)
          }
          let attempts = 0
          let downloadFails = false
          const bridge = {
            onUpdateAvailable: listen("available"),
            onDownloadProgress: listen("progress"),
            onUpdateDownloaded: listen("downloaded"),
            onUpdateError: listen("error"),
            downloadUpdate: async () => {
              if (downloadFails) throw new Error("Download failed")
              listeners.get("downloaded")()
            },
            quitAndInstall: async () => {
              attempts++
              if (attempts === 1) throw new Error("Admission refused")
            }
          }
          window.dialogTest = {
            ready: () => listeners.size === 4,
            available: () => listeners.get("available")({ version: "2.0.0" }),
            attempts: () => attempts,
            failDownload: () => { downloadFails = true }
          }
          createRoot(document.getElementById("app")).render(<UpdateDialog bridge={bridge} />)
        `,
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      write: false,
    })
    await writeFile(
      runtime.documentPath("renderer.js"),
      bundle.outputFiles[0].contents,
    )
    await writeFile(
      runtime.documentPath("index.html"),
      '<!doctype html><title>Update dialog test</title><div id="app"></div><script src="renderer.js"></script>',
    )
    await writeFile(
      runtime.documentPath("dialog-main.cjs"),
      `
      const { app, BrowserWindow } = require("electron")
      app.whenReady().then(() => {
        const window = new BrowserWindow({ show: false })
        window.loadFile(require("node:path").join(__dirname, "index.html"))
      })
    `,
    )
    application = await runtime.launch(
      runtime.documentPath("dialog-main.cjs"),
      [],
    )
    const page = await application.firstWindow()
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.waitForFunction("window.dialogTest?.ready()")
    await page.evaluate("window.dialogTest.available()")
    await page.getByRole("button", { name: "Update Now" }).click()
    await expect(
      page.getByText("Repo Edu 2.0.0 has been downloaded.", { exact: false }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Install and Restart" }).click()
    await expect(page.getByText(updateRestartRefusedMessage)).toBeVisible()
    assert.equal(await page.evaluate("window.dialogTest.attempts()"), 1)
    await page.getByRole("button", { name: "Install and Restart" }).click()
    assert.equal(await page.evaluate("window.dialogTest.attempts()"), 2)
    await page.getByRole("button", { name: "Dismiss" }).click()
    await page.evaluate(
      "window.dialogTest.failDownload(); window.dialogTest.available()",
    )
    await page.getByRole("button", { name: "Update Now" }).click()
    await expect(page.getByText("Download failed")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Install and Restart" }),
    ).toHaveCount(0)
    assert.deepEqual(errors, [])
  } finally {
    await application?.close()
    await runtime.dispose()
  }
})
