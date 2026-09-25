import assert from "node:assert/strict"
import { it } from "node:test"
import { Window } from "happy-dom"
import React from "react"
import { createPortal } from "react-dom"
import { createRoot } from "react-dom/client"
import {
  SessionControllerProvider,
  sessionCancellationControl,
} from "../session/session-controller-context.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
  testSessionStart,
  workflowClient,
} from "./session-controller.test-support.js"

it("shows the window freeze and refuses input while scrolling and portal Cancel remain usable", async (t) => {
  resetStores()
  const window = new Window()
  window.document.documentElement.style.setProperty("--foreground", "#1f1f1f")
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
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
  const controller = startController({
    workflowClient: workflowClient(async (id) => {
      if (id === "course.list") return []
      if (id === "settings.loadApp") return makeSettings()
      assert.fail(id)
    }),
  })
  await controller.waitForIdle()
  const container = window.document.createElement(
    "div",
  ) as unknown as HTMLElement
  const portal = window.document.createElement("div") as unknown as HTMLElement
  window.document.body.appendChild(portal as never)
  const root = createRoot(container)
  const release = deferred<void>()
  t.after(async () => {
    release.resolve()
    await controller.waitForIdle()
    await React.act(async () => root.unmount())
    controller.dispose()
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  let starts = 0
  let wheels = 0
  let scrolls = 0
  let focuses = 0
  let blurs = 0
  const entered = deferred<AbortSignal>()
  await React.act(async () => {
    root.render(
      <SessionControllerProvider controller={controller}>
        <nav>
          <button type="button" onClick={() => starts++}>
            Home
          </button>
        </nav>
        {createPortal(
          <section
            aria-label="Operation controls"
            onWheel={() => wheels++}
            onScroll={() => scrolls++}
            onFocus={() => focuses++}
            onBlur={() => blurs++}
          >
            <button
              type="button"
              onClick={() => {
                starts++
                void controller.operations.execute(
                  testSessionStart("courseOpen"),
                  "course.list",
                  async () => {},
                )
              }}
            >
              Start
            </button>
            <button
              type="button"
              {...{ [sessionCancellationControl]: "analysis.discoverRepos" }}
              onClick={() =>
                controller.operations.stop("analysis.discoverRepos")
              }
            >
              <span>Cancel</span>
            </button>
          </section>,
          portal,
        )}
      </SessionControllerProvider>,
    )
  })
  assert.equal(
    window.document.querySelector("[data-session-input-frozen]"),
    null,
  )
  let running: Promise<unknown> | undefined
  await React.act(async () => {
    running = controller.operations.execute(
      testSessionStart("analysisSearch"),
      "analysis.discoverRepos",
      async (scope) => {
        entered.resolve(scope.signal)
        await release.promise
      },
    )
    // Admission closes input synchronously, before the body or a React update.
    const start = portal.querySelector("button")
    const cancel = portal.querySelector("span")
    assert.ok(start)
    assert.ok(cancel)
    start.click()
    assert.equal(starts, 0)
    assert.equal(controller.getSnapshot().transactions.admitted.size, 1)
    assert.equal(
      controller.operations.change(() => assert.fail("An edit was admitted")),
      false,
    )
  })
  const freeze = window.document.querySelector("[data-session-input-frozen]")
  assert.ok(freeze)
  assert.equal(freeze.parentElement, window.document.body)
  assert.match(freeze.className, /fixed inset-0 z-\[100\] bg-background\/40/)
  assert.match(freeze.className, /pointer-events-none/)
  assert.equal(container.firstElementChild?.getAttribute("aria-busy"), "true")
  container
    .querySelector("nav button")
    ?.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
    )
  assert.equal(starts, 0)
  const start = portal.querySelector("button")
  const cancel = portal.querySelector("span")
  assert.ok(start)
  assert.ok(cancel)
  for (const type of ["keydown", "keyup"]) {
    for (const shiftKey of [false, true]) {
      const event = new window.KeyboardEvent(type, {
        key: "Tab",
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
      start.dispatchEvent(event as unknown as Event)
      assert.equal(event.defaultPrevented, false)
    }
    for (const key of ["ArrowDown", "ArrowRight", " ", "Enter", "Escape"]) {
      const event = new window.KeyboardEvent(type, {
        key,
        bubbles: true,
        cancelable: true,
      })
      start.dispatchEvent(event as unknown as Event)
      assert.equal(event.defaultPrevented, true)
    }
  }
  for (const type of ["wheel", "scroll", "focusin", "focusout"]) {
    const event = new window.Event(type, { bubbles: true, cancelable: true })
    const target = type === "scroll" ? portal.firstElementChild : start
    target?.dispatchEvent(event as unknown as Event)
    assert.equal(event.defaultPrevented, false)
  }
  assert.deepEqual([wheels, scrolls, focuses, blurs], [1, 1, 1, 1])
  const signal = await entered.promise
  assert.equal(
    window.getComputedStyle(cancel.parentElement as never).outlineWidth,
    "3px",
  )
  assert.notEqual(window.getComputedStyle(start as never).outlineWidth, "3px")
  cancel.parentElement?.setAttribute(
    sessionCancellationControl,
    "analysis.blame",
  )
  cancel.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
  )
  assert.equal(signal.aborted, false)
  assert.notEqual(
    window.getComputedStyle(cancel.parentElement as never).outlineWidth,
    "3px",
  )
  cancel.parentElement?.setAttribute(
    sessionCancellationControl,
    "analysis.discoverRepos",
  )
  cancel.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
  )
  assert.equal(signal.aborted, true)
  await React.act(async () => {
    release.resolve()
    await running
    await controller.waitForIdle()
  })
  assert.equal(
    window.document.querySelector("[data-session-input-frozen]"),
    null,
  )
  assert.equal(container.firstElementChild?.getAttribute("aria-busy"), "false")
  assert.equal(starts, 0)
  assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
  await React.act(async () => {
    start.click()
    await controller.waitForIdle()
  })
  assert.equal(starts, 1)
})
