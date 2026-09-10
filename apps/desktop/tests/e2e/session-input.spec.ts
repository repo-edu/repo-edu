import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import { createPackagedTrustRuntime } from "./packaged-trust-runtime"

test("admits command cancellation while freezing edits and reports picker failures", async () => {
  const runtime = await createPackagedTrustRuntime()
  let application: Awaited<ReturnType<typeof runtime.launch>> | undefined
  try {
    const bundle = await build({
      stdin: {
        resolveDir: resolve(
          import.meta.dirname,
          "../../../../packages/renderer-app/src",
        ),
        sourcefile: "session-input-test.tsx",
        loader: "tsx",
        contents: `
          import { useState } from "react"
          import { createRoot } from "react-dom/client"
          import { SessionController } from "./session/session-controller"
          import { SessionControllerProvider, useSessionControllerSelector } from "./session/session-controller-context"
          import { WorkflowClientProvider } from "./contexts/workflow-client"
          import { RendererHostProvider } from "./contexts/renderer-host"
          import { ExaminationControlsCard } from "./components/tabs/examination/ExaminationControlsCard"
          import { ImportStudentsFromFileDialog } from "./components/dialogs/ImportStudentsFromFileDialog"
          import { useUiStore } from "./stores/ui-store"

          let active
          let stops = 0
          const controller = new SessionController({
            workflowClient: { run: async () => { throw new Error("Unexpected workflow") } },
            commandClient: {
              async runBody(_command, _prepare, body, settle) {
                const result = await body({ run: async () => { throw new Error("Unexpected host call") } })
                await settle()
                active.settled = true
                await active.release.promise
                return result
              }
            },
            onBootstrapReady: async () => {}
          })
          window.inputTest = {
            reserve() {
              active = {
                reservation: controller.operations.reserve("examination.generateQuestions"),
                abort: new AbortController(),
                stopped: Promise.withResolvers(),
                release: Promise.withResolvers(),
                settled: false
              }
              active.abort.signal.addEventListener("abort", () => {
                stops++
                active.stopped.resolve()
              }, { once: true })
            },
            begin() {
              active.running = active.reservation.run(async () => active.stopped.promise)
            },
            settled: () => active.settled,
            stops: () => stops,
            async release() {
              active.release.resolve()
              await active.running
            },
            dispose: () => controller.dispose()
          }
          function Fixture() {
            const [draft, setDraft] = useState("original")
            const isGenerating = useSessionControllerSelector(snapshot =>
              [...snapshot.transactions.admitted.values()].some(entry => entry.kind === "command")
            )
            return <>
              <label>Local draft<input value={draft} onChange={event => setDraft(event.target.value)} /></label>
              <button onClick={() => setDraft("selected")}>Change selection</button>
              <ExaminationControlsCard
                questionCount={4} showAnswers={false} blocker={null}
                isGenerating={isGenerating} canRegenerate={false}
                canToggleAnswers={false} canCopyMarkdown={false}
                onQuestionCountChange={() => {}} onShowAnswersChange={() => {}}
                onGenerate={() => setDraft("generated")}
                onStopGeneration={() => active.abort.abort()}
                onRegenerate={() => {}} onCopyMarkdown={() => {}}
              />
              <button onClick={() => useUiStore.getState().setImportFileDialogOpen(true)}>Open import</button>
              <ImportStudentsFromFileDialog />
            </>
          }
          const host = { pickUserFile: async () => { throw new Error("Native picker failed") } }
          createRoot(document.getElementById("app")).render(
            <WorkflowClientProvider value={controller.operations}>
              <RendererHostProvider value={host}>
                <SessionControllerProvider controller={controller}>
                  <Fixture />
                </SessionControllerProvider>
              </RendererHostProvider>
            </WorkflowClientProvider>
          )
        `,
      },
      bundle: true,
      platform: "browser",
      format: "iife",
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
      '<!doctype html><title>Session input test</title><div id="app"></div><script src="renderer.js"></script>',
    )
    const main = runtime.documentPath("session-input-main.cjs")
    await writeFile(
      main,
      `
      const { app, BrowserWindow } = require("electron")
      app.whenReady().then(() => {
        const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
        window.loadFile(require("node:path").join(__dirname, "index.html"))
      })
    `,
    )
    application = await runtime.launch(main, [
      `--user-data-dir=${runtime.documentPath("user-data")}`,
    ])
    const page = await application.firstWindow()
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const draft = page.getByRole("textbox", { name: "Local draft" })
    await expect(draft).toHaveValue("original")

    for (const input of ["mouse", "Enter", "Space"]) {
      await page.evaluate("window.inputTest.reserve()")
      await page.getByRole("button", { name: "Change selection" }).click()
      await expect(draft).toHaveValue("original")
      await draft.press("ArrowRight")
      await draft.pressSequentially("blocked")
      await expect(draft).toHaveValue("original")
      await page.evaluate("window.inputTest.begin()")
      const stop = page.getByRole("button", { name: "Stop", exact: true })
      if (input === "mouse") await stop.click()
      else await stop.press(input)
      await expect
        .poll(() => page.evaluate("window.inputTest.settled()"))
        .toBe(true)
      await page.getByRole("button", { name: "Change selection" }).click()
      await expect(draft).toHaveValue("original")
      await page.evaluate("window.inputTest.release()")
      await expect(stop).toHaveCount(0)
    }
    expect(await page.evaluate("window.inputTest.stops()")).toBe(3)
    await page.getByRole("button", { name: "Change selection" }).click()
    await expect(draft).toHaveValue("selected")

    await page.getByRole("button", { name: "Open import" }).click()
    const dialog = page.getByRole("dialog", { name: "Import Students" })
    await dialog.getByRole("button", { name: "Browse" }).click()
    await expect(dialog.getByText("Native picker failed")).toBeVisible()
    await page.evaluate("window.inputTest.reserve(); window.inputTest.begin()")
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toBeVisible()
    await page.evaluate("window.inputTest.dispose()")
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await application?.close()
    await runtime.dispose()
  }
})
