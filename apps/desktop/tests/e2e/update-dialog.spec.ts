import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import { updateRestartRefusedMessage } from "../../src/renderer-host-bridge"
import { createPackagedTrustRuntime } from "./packaged-trust-runtime"

test("defers update notices during session work and retains restart retry", async () => {
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
          import { defaultAppSettings, splitAppSettings } from "@repo-edu/domain/settings"
          import { canAdmitSessionInput, getSessionController, RendererSessionRoot, useSessionController } from "@repo-edu/renderer-app"
          import { bindSessionStart } from "../../../packages/renderer-app/src/session/session-start"
          import { UpdateDialog } from "./UpdateDialog"
          const listeners = new Map()
          const listen = name => callback => {
            listeners.set(name, callback)
            return () => listeners.delete(name)
          }
          let attempts = 0
          let downloadFails = false
          let stops = 0
          const begin = bindSessionStart("cloneAllSearch", start => getSessionController().operations.execute(start, "repo.listNamespace", scope =>
            new Promise(resolve => scope.signal.addEventListener("abort", () => {
              stops++
              resolve()
            }, { once: true }))
          ))
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
            ready: () => listeners.size === 4 && canAdmitSessionInput(getSessionController().getSnapshot()),
            available: () => listeners.get("available")({ version: "2.0.0" }),
            attempts: () => attempts,
            failDownload: () => { downloadFails = true },
            begin: () => { void begin() },
            stops: () => stops
          }
          function Controls() {
            const controller = useSessionController()
            return <>
              <button id="listing-start" onClick={() => { void begin() }}>List repositories</button>
              <button data-session-cancellation-control="repo.listNamespace"
                onClick={() => controller.operations.stop("repo.listNamespace")}>Cancel listing</button>
            </>
          }
          const workflowClient = {
            async run(id) {
              if (id === "settings.loadApp") return { ...splitAppSettings(defaultAppSettings), recovery: [] }
              if (id === "course.list") return []
              throw new Error("Unexpected workflow: " + id)
            }
          }
          const rendererHost = {
            onCloseRequest: () => () => {},
            setNativeTheme: async () => {}
          }
          createRoot(document.getElementById("app")).render(
            <RendererSessionRoot workflowClient={workflowClient} commandClient={{}}
              rendererHost={rendererHost} onBootstrapReady={async () => {}}>
              <Controls />
              <UpdateDialog bridge={bridge} />
            </RendererSessionRoot>
          )
        `,
      },
      bundle: true,
      platform: "browser",
      format: "esm",
      loader: { ".wasm": "dataurl" },
      jsx: "automatic",
      // Match Vite's browser treatment of the tokenizer's Node-only imports.
      external: ["fs/promises", "module"],
      define: { "process.env.NODE_ENV": '"production"' },
      write: false,
    })
    await writeFile(
      runtime.documentPath("renderer.js"),
      bundle.outputFiles[0].contents,
    )
    await writeFile(
      runtime.documentPath("index.html"),
      '<!doctype html><title>Update dialog test</title><div id="app"></div><script type="module" src="renderer.js"></script>',
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
    const cancel = page.getByRole("button", { name: "Cancel listing" })
    const freeze = page.locator("[data-session-input-frozen]")
    await page.locator("#listing-start").click()
    await expect(freeze).toHaveCount(1)
    await page.evaluate("window.dialogTest.available()")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.locator("#listing-start").focus()
    await page.keyboard.press("Tab")
    await expect(cancel).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(freeze).toHaveCount(0)
    await expect(
      page.getByRole("dialog", { name: "Update Available" }),
    ).toBeVisible()
    assert.equal(await page.evaluate("window.dialogTest.stops()"), 1)
    await page.getByRole("button", { name: "Later" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)

    await page.evaluate("window.dialogTest.available()")
    await page.getByRole("button", { name: "Update Now" }).click()
    await expect(
      page.getByText("Repo Edu 2.0.0 has been downloaded.", { exact: false }),
    ).toBeVisible()
    // Host-started work can close an already open notice without losing its phase.
    await page.evaluate("window.dialogTest.begin()")
    await expect(freeze).toHaveCount(1)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.locator("#listing-start").focus()
    await page.keyboard.press("Tab")
    await expect(cancel).toBeFocused()
    await page.keyboard.press("Space")
    await expect(freeze).toHaveCount(0)
    await expect(
      page.getByRole("dialog", { name: "Ready to Install" }),
    ).toBeVisible()
    assert.equal(await page.evaluate("window.dialogTest.stops()"), 2)
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
