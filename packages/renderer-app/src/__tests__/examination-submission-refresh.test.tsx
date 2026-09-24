import assert from "node:assert/strict"
import { it } from "node:test"
import type {
  ExaminationPrepareSubmissionSourceInput,
  WorkflowInput,
} from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { Window } from "happy-dom"
import React from "react"
import { selectDefaultExtensions } from "../session/selectors.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

it("keeps Settings edits uninterrupted and applies extensions only on submission Refresh", {
  timeout: 10000,
}, async (t) => {
  const window = new Window()
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLSelectElement: window.HTMLSelectElement,
    HTMLFormElement: window.HTMLFormElement,
    DocumentFragment: window.DocumentFragment,
    DOMRect: window.DOMRect,
    Event: window.Event,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
    MutationObserver: window.MutationObserver,
    ResizeObserver: window.ResizeObserver,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const descriptors = Object.getOwnPropertyDescriptors(globalThis)
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  }
  // Radix checks DOM availability at import time.
  const { createRoot } = await import("react-dom/client")
  const { createPortal } = await import("react-dom")
  const { SubmissionExaminationTab } = await import(
    "../components/tabs/SubmissionExaminationTab.js"
  )
  const { useOpenSubmissionFolder } = await import(
    "../hooks/use-open-submission-folder.js"
  )
  const { AnalysisPane } = await import(
    "../components/settings/AnalysisPane.js"
  )
  const { SessionControllerProvider } = await import(
    "../session/session-controller-context.js"
  )
  const { WorkflowClientProvider } = await import(
    "../contexts/workflow-client.js"
  )
  const { RendererHostProvider } = await import("../contexts/renderer-host.js")
  const { useExaminationStore } = await import("../stores/examination-store.js")
  resetStores()
  useExaminationStore.getState().reset()
  const listings: WorkflowInput<"analysis.listFolderFiles">[] = []
  const preparations: ExaminationPrepareSubmissionSourceInput[] = []
  const releaseListing = deferred<void>()
  const releasePreparation = deferred<void>()
  const files = [
    { relativePath: "main.ts", size: 20 },
    { relativePath: "other.ts", size: 20 },
    { relativePath: "main.py", size: 20 },
  ]
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "course.list") return []
      if (id === "settings.loadApp") {
        return makeSettings({
          activeSurface: { kind: "submission", path: "/submission" },
          recentSubmissionFolders: [{ path: "/submission" }],
          defaultExtensions: ["ts"],
        })
      }
      if (id === "settings.savePreferences") return undefined
      if (id === "analysis.listFolderFiles") {
        const listing = input as WorkflowInput<"analysis.listFolderFiles">
        listings.push(listing)
        if (listings.length === 2) await releaseListing.promise
        return {
          files: files.filter((file) =>
            listing.extensions?.some((ext) =>
              file.relativePath.endsWith(`.${ext}`),
            ),
          ),
        }
      }
      if (id === "examination.prepareSubmissionSource") {
        const preparation = input as ExaminationPrepareSubmissionSourceInput
        preparations.push(preparation)
        if (listings.length === 2) await releasePreparation.promise
        return {
          folderPath: preparation.folderPath,
          personId: "submission",
          displayTitle: "Submission",
          displaySubtitle: "",
          contentScopeId: "submission-scope",
          localIdentityContext: {
            names: [],
            emails: [],
            opaqueIdentifiers: [],
            gitUsernames: [],
          },
          excerpts: preparation.selectedRelativePaths.map((filePath) => ({
            filePath,
            startLine: 1,
            lines: ["return 1"],
          })),
          excerptFileSources: Object.fromEntries(
            preparation.selectedRelativePaths.map((path) => [path, "return 1"]),
          ),
        }
      }
      assert.fail(`Unexpected workflow: ${id}`)
    }),
  })
  await controller.waitForIdle()
  assert.equal(controller.getSnapshot().bootstrap.status, "ready")
  const container = window.document.createElement("div")
  const settings = window.document.createElement("div")
  window.document.body.append(container, settings)
  const root = createRoot(container as unknown as HTMLElement)
  t.after(async () => {
    await React.act(async () => {
      releaseListing.resolve()
      releasePreparation.resolve()
      await controller.waitForIdle()
      root.unmount()
    })
    controller.dispose()
    useExaminationStore.getState().reset()
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  let settingsClicks = 0
  function OpenSubmission() {
    const open = useOpenSubmissionFolder()
    return (
      <button type="button" onClick={() => void open()}>
        Open submission
      </button>
    )
  }
  const render = (tabKey: string) =>
    root.render(
      <SessionControllerProvider controller={controller}>
        <WorkflowClientProvider value={controller.operations}>
          <RendererHostProvider
            value={{ pickDirectory: async () => "/submission" } as RendererHost}
          >
            <OpenSubmission />
            <SubmissionExaminationTab key={tabKey} />
            {createPortal(
              <>
                <AnalysisPane />
                <button type="button" onClick={() => settingsClicks++}>
                  Close settings
                </button>
              </>,
              settings as unknown as HTMLElement,
            )}
          </RendererHostProvider>
        </WorkflowClientProvider>
      </SessionControllerProvider>,
    )
  await React.act(async () => {
    render("first")
  })
  const settle = async () => {
    await React.act(async () => {
      await controller.waitForIdle()
    })
  }
  await settle()
  assert.equal(listings.length, 0)
  assert.equal(preparations.length, 0)
  assert.match(container.textContent, /Press Refresh to list submission files/)
  await React.act(async () => {
    const open = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Open submission",
    )
    assert.ok(open)
    open.click()
  })
  await settle()
  assert.equal(controller.getSnapshot().lifecycle.kind, "live")
  assert.deepEqual(
    listings.map((input) => input.extensions),
    [["ts"]],
  )
  assert.equal(preparations.length, 1)
  assert.deepEqual(preparations[0]?.configuredExtensions, ["ts"])
  assert.match(container.textContent, /main\.ts/)
  assert.doesNotMatch(container.textContent, /main\.py/)

  const field = settings.querySelector("input")
  assert.ok(field)
  const typeDraft = async (value: string) => {
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set?.call(field, value)
      field.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
  }
  const press = (key: string) => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    })
    field.dispatchEvent(event)
    return event
  }
  for (const [extension, key] of [
    ["py", ","],
    ["rs", "Enter"],
  ]) {
    await typeDraft(extension)
    await React.act(async () => {
      press(key)
    })
    assert.ok(
      selectDefaultExtensions(controller.getSnapshot()).includes(extension),
    )
    assert.equal(press("a").defaultPrevented, false)
    assert.equal(
      window.document.querySelector("[data-session-input-frozen]"),
      null,
    )
    assert.equal(listings.length, 1)
    assert.equal(preparations.length, 1)
  }
  await typeDraft("go")
  await React.act(async () => {
    field.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }))
  })
  await React.act(async () => {
    const close = [...settings.querySelectorAll("button")].find(
      (button) => button.textContent === "Close settings",
    )
    assert.ok(close)
    close.click()
  })
  assert.equal(settingsClicks, 1)
  assert.deepEqual(selectDefaultExtensions(controller.getSnapshot()), [
    "ts",
    "py",
    "rs",
    "go",
  ])
  assert.equal(listings.length, 1)
  assert.equal(preparations.length, 1)

  // Choosing another file still prepares against the listing's old extensions.
  const fileCheckbox = [...container.querySelectorAll("li")]
    .find((item) => item.textContent.includes("other.ts"))
    ?.querySelector("button")
  assert.ok(fileCheckbox)
  await React.act(async () => {
    fileCheckbox.click()
  })
  await settle()
  assert.equal(preparations.length, 2)
  assert.deepEqual(preparations[1]?.configuredExtensions, ["ts"])
  assert.deepEqual(preparations[1]?.selectedRelativePaths, ["main.ts"])

  const refresh = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Refresh",
  )
  assert.ok(refresh)
  await React.act(async () => {
    refresh.click()
  })
  assert.equal(listings.length, 2)
  assert.deepEqual(listings[1]?.extensions, ["ts", "py", "rs", "go"])
  assert.ok(window.document.querySelector("[data-session-input-frozen]"))
  await React.act(async () => {
    refresh.click()
  })
  assert.equal(listings.length, 2)
  await React.act(async () => {
    releaseListing.resolve()
  })
  assert.equal(preparations.length, 3)
  assert.deepEqual(preparations[2]?.configuredExtensions, [
    "ts",
    "py",
    "rs",
    "go",
  ])
  assert.deepEqual(preparations[2]?.selectedRelativePaths, ["main.ts"])
  assert.ok(window.document.querySelector("[data-session-input-frozen]"))
  await React.act(async () => {
    releasePreparation.resolve()
  })
  await settle()
  assert.match(container.textContent, /main\.py/)
  assert.equal(
    window.document.querySelector("[data-session-input-frozen]"),
    null,
  )
  await React.act(async () => {
    render("returned")
  })
  await settle()
  assert.equal(listings.length, 2)
  assert.match(container.textContent, /main\.py/)
})
