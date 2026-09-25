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
          import { createPortal } from "react-dom"
          import { createRoot } from "react-dom/client"
          import { Tabs, TabsList, TabsTrigger } from "@repo-edu/ui"
          import { SessionController } from "./session/session-controller"
          import { bindSessionStart } from "./session/session-start"
          import { SessionControllerProvider, useSessionControllerSelector } from "./session/session-controller-context"
          import { WorkflowClientProvider } from "./contexts/workflow-client"
          import { RendererHostProvider } from "./contexts/renderer-host"
          import { ExaminationControlsCard } from "./components/tabs/examination/ExaminationControlsCard"
          import { ImportStudentsFromFileDialog } from "./components/dialogs/ImportStudentsFromFileDialog"
          import { useUiStore } from "./stores/ui-store"

          let active
          let stops = 0
          let operationStops = 0
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
            reserve: bindSessionStart("questionsGenerate", start => {
              active = {
                reservation: controller.operations.reserve(start, "examination.generateQuestions"),
                abort: new AbortController(),
                stopped: Promise.withResolvers(),
                release: Promise.withResolvers(),
                settled: false
              }
              active.abort.signal.addEventListener("abort", () => {
                stops++
                active.stopped.resolve()
              }, { once: true })
            }),
            begin() {
              active.running = active.reservation.run(async () => active.stopped.promise)
            },
            settled: () => active.settled,
            stops: () => stops,
            operationStops: () => operationStops,
            selectTab: tab => controller.setActiveTab(tab),
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
            const isListing = useSessionControllerSelector(snapshot =>
              [...snapshot.transactions.admitted.values()].some(entry => entry.operation === "repo.listNamespace")
            )
            const activeTab = useSessionControllerSelector(snapshot => snapshot.settings.preferences.activeTab)
            return <>
              <label>Local draft<input value={draft} onChange={event => setDraft(event.target.value)} /></label>
              <Tabs value={activeTab} onValueChange={tab => controller.setActiveTab(tab)}>
                <TabsList>
                  <TabsTrigger value="roster">Roster</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
                </TabsList>
              </Tabs>
              <button disabled={isListing} onClick={bindSessionStart("cloneAllSearch", start => controller.operations.execute(start, "repo.listNamespace", scope =>
                new Promise(resolve => scope.signal.addEventListener("abort", () => {
                  operationStops++
                  resolve()
                }, { once: true }))
              ))}>List repositories</button>
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
              {isListing && createPortal(
                <button data-session-cancellation-control="repo.listNamespace"
                  onClick={() => controller.operations.stop("repo.listNamespace")}>Cancel listing</button>,
                document.body
              )}
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
      else {
        await draft.focus()
        for (let attempt = 0; attempt < 12; attempt++) {
          await page.keyboard.press("Tab")
          if (
            await stop.evaluate((element) => element === document.activeElement)
          )
            break
        }
        await expect(stop).toBeFocused()
        await page.keyboard.press(input)
      }
      await expect
        .poll(() => page.evaluate("window.inputTest.settled()"))
        .toBe(true)
      await page.getByRole("button", { name: "Change selection" }).click()
      await expect(draft).toHaveValue("original")
      await page.evaluate("window.inputTest.release()")
      await expect(stop).toHaveCount(0)
    }
    expect(await page.evaluate("window.inputTest.stops()")).toBe(3)

    // Keep the last focused tab different from the selected tab, as happens
    // when the app opens another view after a file selection.
    const roster = page.getByRole("tab", { name: "Roster", exact: true })
    const analysis = page.getByRole("tab", { name: "Analysis", exact: true })
    await roster.click()
    await page.keyboard.press("ArrowRight")
    await expect(analysis).toBeFocused()
    await expect(roster).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Enter")
    await expect(analysis).toHaveAttribute("aria-selected", "true")
    await page.evaluate('window.inputTest.selectTab("roster")')
    await page.keyboard.press("Tab")
    const listing = page.getByRole("button", { name: "List repositories" })
    await expect(listing).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(listing).toBeDisabled()
    await page.keyboard.press("Shift+Tab")
    await expect(analysis).toBeFocused()
    await expect(roster).toHaveAttribute("aria-selected", "true")
    for (const key of ["ArrowLeft", "Space", "Enter", "Escape"]) {
      await page.keyboard.press(key)
      await expect(analysis).toBeFocused()
      await expect(roster).toHaveAttribute("aria-selected", "true")
    }
    await page.keyboard.press("Tab")
    await expect(
      page.getByRole("button", { name: "Change selection" }),
    ).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(draft).toHaveValue("original")
    const cancel = page.getByRole("button", { name: "Cancel listing" })
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.keyboard.press("Tab")
      if (
        await cancel.evaluate((element) => element === document.activeElement)
      )
        break
    }
    await expect(cancel).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(
      page.getByRole("button", { name: "Open import" }),
    ).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(cancel).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(cancel).toHaveCount(0)
    await expect(listing).toBeEnabled()
    expect(await page.evaluate("window.inputTest.operationStops()")).toBe(1)
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
