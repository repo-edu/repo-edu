import assert from "node:assert/strict"
import { it } from "node:test"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { Window } from "happy-dom"
import React from "react"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { SessionControllerProvider } from "../session/session-controller-context.js"
import {
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

it("starts course and recent navigation only when its bound control runs", async (t) => {
  resetStores()
  const window = new Window()
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    DocumentFragment: window.DocumentFragment,
    Node: window.Node,
    MutationObserver: window.MutationObserver,
    CustomEvent: window.CustomEvent,
    NodeFilter: window.NodeFilter,
    HTMLInputElement: window.HTMLInputElement,
    getComputedStyle: window.getComputedStyle.bind(window),
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
  const { createRoot } = await import("react-dom/client")
  const { CourseSwitcher } = await import("../components/CourseSwitcher.js")
  const calls: string[] = []
  const controller = startController({
    workflowClient: workflowClient(async (id) => {
      calls.push(id)
      if (id === "settings.loadApp")
        return makeSettings({
          recentAnalysisFolders: ["/repositories"],
          recentSubmissionFolders: [{ path: "/submission" }],
        })
      if (id === "course.list") return [makeCourse("course")]
      if (id === "course.load") return makeCourse("course")
      if (id === "analysis.listFolderFiles") return { files: [] }
      if (id === "settings.savePreferences") return
      assert.fail(id)
    }),
  })
  await controller.waitForIdle()
  assert.equal(controller.getSnapshot().bootstrap.status, "ready")
  const bootstrapCalls = [...calls]
  let admitted = 0
  const starts = new Set<string>()
  const unsubscribe = controller.subscribe(() => {
    if (controller.getSnapshot().transactions.admitted.size > 0) admitted++
    for (const descriptor of controller
      .getSnapshot()
      .transactions.admitted.values()) {
      if ("start" in descriptor) starts.add(descriptor.start.id)
    }
  })
  const container = window.document.createElement("div")
  window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  t.after(async () => {
    await React.act(async () => root.unmount())
    unsubscribe()
    controller.dispose()
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  for (const key of ["first", "remounted"]) {
    await React.act(async () => {
      root.render(
        <RendererHostProvider value={{} as RendererHost}>
          <WorkflowClientProvider value={controller.operations}>
            <SessionControllerProvider controller={controller}>
              <CourseSwitcher key={key} />
            </SessionControllerProvider>
          </WorkflowClientProvider>
        </RendererHostProvider>,
      )
    })
    await controller.waitForIdle()
    assert.match(container.textContent, /Home/)
    assert.deepEqual(calls, bootstrapCalls)
    assert.equal(admitted, 0)
  }
  for (const [label, start] of [
    ["course", "courseOpen"],
    ["Home", "home"],
    ["repositories", "recentRepositories"],
    ["submission", "recentSubmission"],
  ]) {
    await React.act(async () => {
      const trigger = container.querySelector("button")
      assert.ok(trigger)
      trigger.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      )
    })
    const row = [...window.document.querySelectorAll('[role="option"]')].find(
      (element) => element.textContent.includes(label),
    )
    assert.ok(row, `Missing ${label} row`)
    await React.act(async () => {
      row.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
      await controller.waitForIdle()
    })
    assert.ok(starts.has(start), `Missing ${start} admission`)
  }
  assert.deepEqual(
    [...starts],
    ["courseOpen", "home", "recentRepositories", "recentSubmission"],
  )
  assert.equal(
    calls.filter((id) => id === "analysis.listFolderFiles").length,
    1,
  )
})
