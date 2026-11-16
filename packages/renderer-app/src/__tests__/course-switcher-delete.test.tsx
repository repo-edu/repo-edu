import assert from "node:assert/strict"
import { it } from "node:test"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { Window } from "happy-dom"
import React from "react"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import {
  clearSessionController,
  SessionControllerProvider,
  setSessionController,
} from "../session/session-controller-context.js"
import {
  activeCourseId,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

it("opens the delete dialog from the switcher and names the course the delete opens", async (t) => {
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
  const { DeleteCourseDialog } = await import(
    "../components/dialogs/DeleteCourseDialog.js"
  )
  // `course.list` returns the most recently updated course first, so the
  // session opens Zeta although Alpha sorts first by name.
  const courses = [
    makeCourse("zeta", "Zeta"),
    makeCourse("active", "Active"),
    makeCourse("alpha", "Alpha"),
  ]
  const deleted = new Set<string>()
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "settings.loadApp")
        return makeSettings({
          activeSurface: { kind: "course", courseId: "active" },
        })
      if (id === "course.list")
        return courses.filter((course) => !deleted.has(course.id))
      if (id === "course.load")
        return courses.find(
          (course) => course.id === (input as { courseId: string }).courseId,
        )
      if (id === "course.delete") {
        deleted.add((input as { courseId: string }).courseId)
        return
      }
      if (id === "settings.savePreferences") return
      assert.fail(id)
    }),
  })
  await controller.waitForIdle()
  setSessionController(controller)
  const container = window.document.createElement("div")
  window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  t.after(async () => {
    await React.act(async () => root.unmount())
    controller.dispose()
    clearSessionController(controller)
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  await React.act(async () => {
    root.render(
      <RendererHostProvider value={{} as RendererHost}>
        <WorkflowClientProvider value={controller.operations}>
          <SessionControllerProvider controller={controller}>
            <CourseSwitcher />
            <DeleteCourseDialog />
          </SessionControllerProvider>
        </WorkflowClientProvider>
      </RendererHostProvider>,
    )
  })
  await React.act(async () => {
    const trigger = container.querySelector("button")
    assert.ok(trigger)
    trigger.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    )
  })
  const deleteRow = window.document.querySelector(
    '[aria-label="Delete Active"]',
  )
  assert.ok(deleteRow)
  await React.act(async () => {
    deleteRow.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
  })
  const dialog = window.document.querySelector('[role="alertdialog"]')
  assert.ok(dialog)
  assert.match(dialog.textContent, /You will be switched to "Zeta"\./)
  const confirm = [...dialog.querySelectorAll("button")].find(
    (button) => button.textContent === "Delete",
  )
  assert.ok(confirm)
  await React.act(async () => {
    confirm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
    await controller.waitForIdle()
  })
  assert.deepEqual([...deleted], ["active"])
  assert.equal(activeCourseId(controller.getSnapshot()), "zeta")
})
