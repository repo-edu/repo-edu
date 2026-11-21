import assert from "node:assert/strict"
import { it } from "node:test"
import { normalizeRoster } from "@repo-edu/domain/roster"
import { Window } from "happy-dom"
import { act } from "react"
import {
  makeSettings,
  startController,
  workflowClient,
} from "../../../__tests__/session-controller.test-support.js"
import { SessionControllerProvider } from "../../../session/session-controller-context.js"

it("sorts roster members and searches hidden email addresses", async (t) => {
  const window = new Window()
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
    ResizeObserver: window.ResizeObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
  const { createRoot } = await import("react-dom/client")
  const { MemberListPane } = await import("./MemberListPane.js")
  const controller = startController({
    workflowClient: workflowClient(async (id) => {
      if (id === "settings.loadApp") {
        return makeSettings({ rosterColumnVisibility: { email: false } })
      }
      if (id === "course.list") return []
      assert.fail(id)
    }),
  })
  await controller.waitForIdle()
  const roster = normalizeRoster([
    { id: "Zoe", emailCandidates: ["one@example.org"] },
    { id: "Ada", emailCandidates: ["two@example.org"] },
  ])
  const container = window.document.createElement("div")
  window.document.body.append(container)
  const root = createRoot(container as unknown as HTMLElement)
  try {
    await act(() => {
      root.render(
        <SessionControllerProvider controller={controller}>
          <MemberListPane
            courseId="course"
            roster={roster}
            importing={false}
            canImportFromLms={false}
            lmsImportTooltip=""
            hasLmsConnection={false}
            onImportFromLms={assert.fail}
            onImportFromFile={assert.fail}
            onImportGitUsernames={assert.fail}
            onVerifyGitUsernames={assert.fail}
            onClear={assert.fail}
            onExport={assert.fail}
          />
        </SessionControllerProvider>,
      )
    })
    const names = () =>
      [...container.querySelectorAll("tbody tr td:first-child")].map(
        (cell) => cell.textContent,
      )
    assert.deepEqual(names(), ["Zoe", "Ada"])
    const headers = [...container.querySelectorAll("th button")]
    assert.ok(!headers.some((header) => header.textContent === "Email"))
    const name = headers.find((header) => header.textContent === "Name")
    assert.ok(name instanceof window.HTMLButtonElement)
    await act(() => name.click())
    assert.deepEqual(names(), ["Ada", "Zoe"])
    await act(() => name.click())
    assert.deepEqual(names(), ["Zoe", "Ada"])

    const search = container.querySelector("input")
    assert.ok(search)
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set
    assert.ok(setValue)
    await act(() => {
      setValue.call(search, "TWO@")
      search.dispatchEvent(new window.Event("input", { bubbles: true }))
    })
    assert.deepEqual(names(), ["Ada"])
  } finally {
    await act(() => root.unmount())
    controller.dispose()
    await window.happyDOM.close()
  }
})
