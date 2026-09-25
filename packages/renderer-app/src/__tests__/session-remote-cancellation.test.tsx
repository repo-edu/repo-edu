import assert from "node:assert/strict"
import { it } from "node:test"
import type {
  GroupSetLmsApplyResult,
  GroupSetLmsSummary,
  WorkflowClient,
  WorkflowId,
  WorkflowInput,
} from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { QueryClientProvider } from "@tanstack/react-query"
import { Window } from "happy-dom"
import React from "react"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import type { RepoOperations } from "../components/tabs/groups-assignments/GroupSetGroupsTable/repository-operation-fields.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import {
  SessionControllerProvider,
  sessionCancellationControl,
} from "../session/session-controller-context.js"
import { useCourseStore } from "../stores/course-store.js"
import { useUiStore } from "../stores/ui-store.js"
import {
  deferred,
  makeCourse,
  makeSettings,
  resetStores,
  startController,
  testSessionStart,
  workflowClient,
} from "./session-controller.test-support.js"

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

it("remote requests start explicitly and retain window-gate cancellation", {
  timeout: 10000,
}, async (t) => {
  const window = new Window()
  window.document.documentElement.style.setProperty("--foreground", "#1f1f1f")
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLFormElement: window.HTMLFormElement,
    DocumentFragment: window.DocumentFragment,
    Event: window.Event,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
    MutationObserver: window.MutationObserver,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const descriptors = Object.getOwnPropertyDescriptors(globalThis)
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  t.after(async () => {
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  // Radix checks DOM availability at import time.
  const { createRoot } = await import("react-dom/client")
  const { Dialog, DialogContent, DialogTitle } = await import("@repo-edu/ui")
  const { StudentSyncDialog } = await import(
    "../components/dialogs/StudentSyncDialog.js"
  )
  const { ConnectLmsGroupSetDialog } = await import(
    "../components/dialogs/ConnectLmsGroupSetDialog.js"
  )
  const { CloneAllRepositoriesPanel } = await import(
    "../components/tabs/groups-assignments/GroupSetGroupsTable/CloneAllRepositoriesPanel.js"
  )
  await t.test(
    "Escape cannot dismiss a dialog while a command is admitted",
    async (t) => {
      resetStores()
      const controller = startController({
        workflowClient: workflowClient(async (id) => {
          if (id === "course.list") return [makeCourse("course")]
          if (id === "settings.loadApp") return makeSettings()
          assert.fail(id)
        }),
      })
      await controller.waitForIdle()
      const container = window.document.createElement("div")
      window.document.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)
      const release = deferred<void>()
      t.after(async () => {
        await React.act(async () => {
          release.resolve()
          await controller.waitForIdle()
          root.unmount()
        })
        controller.dispose()
        container.remove()
      })
      let dismissals = 0
      await React.act(async () => {
        root.render(
          <SessionControllerProvider controller={controller}>
            <Dialog defaultOpen onOpenChange={() => dismissals++}>
              <DialogContent aria-describedby={undefined}>
                <DialogTitle>Import Git Usernames</DialogTitle>
                <button type="button">Import</button>
              </DialogContent>
            </Dialog>
          </SessionControllerProvider>,
        )
        await flush()
      })
      const dialog = window.document.querySelector('[role="dialog"]')
      assert.ok(dialog)
      const input = dialog.querySelector("button")
      assert.ok(input)
      const pressEscape = () => {
        const event = new window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
        input.dispatchEvent(event)
        return event
      }
      let running: Promise<unknown> | undefined
      await React.act(async () => {
        running = controller.operations.execute(
          testSessionStart("analysisRun"),
          "gitUsernames.import",
          async () => {
            await release.promise
          },
        )
        // Admission must take effect before React has rendered the freeze.
        assert.equal(pressEscape().defaultPrevented, true)
        assert.equal(dismissals, 0)
      })
      assert.ok(window.document.querySelector("[data-session-input-frozen]"))
      assert.equal(pressEscape().defaultPrevented, true)
      assert.equal(dismissals, 0)
      assert.equal(window.document.querySelector('[role="dialog"]'), dialog)
      await React.act(async () => {
        release.resolve()
        await running
        await controller.waitForIdle()
      })
      await React.act(async () => {
        pressEscape()
        await flush()
      })
      assert.equal(dismissals, 1)
      assert.equal(window.document.querySelector('[role="dialog"]'), null)
    },
  )
  await t.test(
    "group sets load only on request and discard unmatched previews",
    async (t) => {
      resetStores()
      const course = makeCourse("course")
      course.lmsConnectionId = "lms"
      course.lmsCourseId = "remote-course"
      let listing: GroupSetLmsSummary[] | Error = []
      const calls: WorkflowId[] = []
      const controller = startController({
        workflowClient: workflowClient(async (id, input) => {
          if (id === "settings.loadApp")
            return makeSettings({
              activeSurface: { kind: "course", courseId: course.id },
            })
          if (id === "course.list") return [course]
          if (id === "course.load") return course
          if (id === "course.save")
            return {
              revision: (input as WorkflowInput<"course.save">).revision + 1,
              updatedAt: "2026-09-25T00:00:00Z",
            }
          calls.push(id)
          if (id === "groupSet.fetchAvailableFromLms") {
            if (listing instanceof Error) throw listing
            return listing
          }
          if (id === "groupSet.connectFromLms") {
            const { remoteGroupSetId, course: previewCourse } =
              input as WorkflowInput<"groupSet.connectFromLms">
            const groupSet = {
              id: "new-group-set",
              name: remoteGroupSetId,
              nameMode: "named" as const,
              groupIds: [],
              connection: {
                kind: "canvas" as const,
                courseId: "remote-course",
                groupSetId: remoteGroupSetId,
                lastUpdated: "2026-09-25T00:00:00Z",
              },
              repoNameTemplate: null,
              columnVisibility: {},
              columnSizing: {},
            }
            return {
              ...groupSet,
              roster: {
                ...previewCourse.roster,
                groupSets: [...previewCourse.roster.groupSets, groupSet],
              },
              idSequences: previewCourse.idSequences,
            } satisfies GroupSetLmsApplyResult
          }
          assert.fail(id)
        }),
      })
      await controller.waitForIdle()
      const originalGroupSets =
        useCourseStore.getState().course?.roster.groupSets
      const container = window.document.createElement("div")
      window.document.body.appendChild(container)
      const root = createRoot(container as unknown as HTMLElement)
      t.after(async () => {
        await React.act(async () => root.unmount())
        controller.dispose()
        container.remove()
      })
      const button = (label: string) => {
        const result = [...window.document.querySelectorAll("button")].find(
          (candidate) => candidate.textContent?.trim() === label,
        )
        assert.ok(result, `Missing ${label} button`)
        return result
      }
      const click = async (label: string) => {
        const control = button(label)
        assert.equal(control.disabled, false, `${label} should be enabled`)
        await React.act(async () => {
          control.click()
          await controller.waitForIdle()
          await flush()
        })
      }
      await React.act(async () => {
        useUiStore.getState().setConnectLmsGroupSetDialogOpen(true)
        root.render(
          <SessionControllerProvider controller={controller}>
            <ConnectLmsGroupSetDialog />
          </SessionControllerProvider>,
        )
        await flush()
      })
      assert.deepEqual(calls, [])
      assert.equal(button("Preview").disabled, true)
      assert.equal(button("Apply").disabled, true)
      await click("Cancel")
      await React.act(async () => {
        useUiStore.getState().setConnectLmsGroupSetDialogOpen(true)
        await flush()
      })
      assert.deepEqual(calls, [])
      await click("Load group sets")
      assert.deepEqual(calls, ["groupSet.fetchAvailableFromLms"])
      assert.match(
        window.document.body.textContent,
        /No unconnected LMS group sets/,
      )
      assert.equal(button("Preview").disabled, true)
      listing = new Error("LMS unavailable")
      await click("Load group sets")
      assert.match(window.document.body.textContent, /LMS unavailable/)
      assert.equal(button("Preview").disabled, true)
      listing = [{ id: "first-set", name: "First set", groupCount: 0 }]
      await click("Load group sets")
      await click("Preview")
      assert.match(window.document.body.textContent, /Preview: first-set/)
      assert.equal(button("Apply").disabled, false)
      listing = [{ id: "second-set", name: "Second set", groupCount: 0 }]
      await click("Load group sets")
      assert.equal(button("Apply").disabled, true)
      assert.doesNotMatch(
        window.document.body.textContent,
        /Preview: first-set/,
      )
      assert.deepEqual(
        useCourseStore.getState().course?.roster.groupSets,
        originalGroupSets,
      )
      await click("Preview")
      assert.match(window.document.body.textContent, /Preview: second-set/)
      await React.act(async () => {
        controller.setDisplayName(course.id, "Edited course")
      })
      await click("Apply")
      assert.match(window.document.body.textContent, /The course changed/)
      assert.deepEqual(
        useCourseStore.getState().course?.roster.groupSets,
        originalGroupSets,
      )
      assert.equal(button("Apply").disabled, true)
      await click("Refresh Preview")
      await click("Apply")
      assert.equal(
        useCourseStore
          .getState()
          .course?.roster.groupSets.find(({ id }) => id === "new-group-set")
          ?.name,
        "second-set",
      )
      assert.equal(window.document.querySelector('[role="dialog"]'), null)
      assert.equal(
        calls.filter((id) => id === "groupSet.fetchAvailableFromLms").length,
        4,
      )
      await React.act(async () => {
        useUiStore.getState().setConnectLmsGroupSetDialogOpen(true)
        await flush()
      })
      assert.equal(
        calls.filter((id) => id === "groupSet.fetchAvailableFromLms").length,
        4,
      )
      assert.equal(button("Preview").disabled, true)
    },
  )
  const operations = [
    "roster.importFromLms",
    "groupSet.fetchAvailableFromLms",
    "groupSet.connectFromLms",
    "groupSet.syncFromLms",
    "repo.listNamespace",
  ] as const

  for (const operation of operations) {
    for (const closeControl of operation === "repo.listNamespace"
      ? ["Cancel"]
      : ["Cancel", "Close"]) {
      await t.test(`${operation} through ${closeControl}`, async (t) => {
        resetStores()
        const course = makeCourse("course")
        course.lmsConnectionId = "lms"
        course.lmsCourseId = "remote-course"
        course.roster.groupSets = [
          {
            id: "connected",
            name: "Connected group set",
            nameMode: "named",
            groupIds: [],
            connection: {
              kind: "canvas",
              courseId: "remote-course",
              groupSetId: "connected-remote",
              lastUpdated: "2026-09-23T00:00:00Z",
            },
            repoNameTemplate: null,
            columnVisibility: {},
            columnSizing: {},
          },
        ]
        const git = {
          id: "git",
          provider: "github" as const,
          baseUrl: "https://github.com",
          token: "example",
        }
        const entered = deferred<AbortSignal>()
        const release = deferred<unknown>()
        const calls: WorkflowId[] = []
        const controller = startController({
          workflowClient: {
            async run(
              id: WorkflowId,
              _input: unknown,
              options?: { signal?: AbortSignal },
            ) {
              if (id === "settings.loadApp")
                return makeSettings({
                  activeSurface: { kind: "course", courseId: course.id },
                  lmsConnections: [
                    {
                      id: "lms",
                      name: "School",
                      provider: "canvas",
                      baseUrl: "https://canvas.example.edu",
                      token: "example",
                    },
                  ],
                  activeGitConnectionId: git.id,
                  gitConnections: [git],
                })
              if (id === "course.load") return course
              calls.push(id)
              if (id === operation) {
                assert.ok(options?.signal)
                entered.resolve(options.signal)
                return release.promise
              }
              if (id === "groupSet.fetchAvailableFromLms")
                return [{ id: "remote-set", name: "New group set" }]
              assert.fail(id)
            },
          } as WorkflowClient,
        })
        await controller.waitForIdle()
        const originalCourse = useCourseStore.getState().course
        if (operation === "roster.importFromLms")
          useUiStore.getState().setRosterSyncDialogOpen(true)
        else if (operation === "groupSet.syncFromLms")
          useUiStore.getState().setSyncGroupSetTriggerId("connected")
        else if (operation !== "repo.listNamespace")
          useUiStore.getState().setConnectLmsGroupSetDialogOpen(true)
        const client = createRendererQueryClient()
        const container = window.document.createElement("div")
        window.document.body.appendChild(container)
        const root = createRoot(container as unknown as HTMLElement)
        t.after(async () => {
          await React.act(async () => {
            release.resolve(undefined)
            await controller.waitForIdle()
            root.unmount()
          })
          controller.dispose()
          client.clear()
          container.remove()
        })
        let navigations = 0
        await React.act(async () => {
          root.render(
            <SessionControllerProvider controller={controller}>
              <WorkflowClientProvider value={controller.operations}>
                <RendererHostProvider value={{} as RendererHost}>
                  <QueryClientProvider client={client}>
                    <nav>
                      <button type="button" onClick={() => navigations++}>
                        Home
                      </button>
                    </nav>
                    {operation === "repo.listNamespace" ? (
                      <CloneAllRepositoriesPanel
                        groupSetId="test"
                        operations={
                          {
                            activeGitConnection: git,
                            gitConnections: [git],
                            organization: "org",
                            cloneTargetDirectory: "/repos",
                          } as RepoOperations
                        }
                      />
                    ) : operation === "roster.importFromLms" ? (
                      <StudentSyncDialog />
                    ) : (
                      <ConnectLmsGroupSetDialog />
                    )}
                  </QueryClientProvider>
                </RendererHostProvider>
              </WorkflowClientProvider>
            </SessionControllerProvider>,
          )
          await flush()
        })
        if (operation === "repo.listNamespace") {
          const search = [...window.document.querySelectorAll("button")].find(
            (button) => button.textContent === "Search",
          )
          assert.ok(search)
          await React.act(async () => {
            search.click()
            await flush()
          })
        }
        if (
          operation === "groupSet.fetchAvailableFromLms" ||
          operation === "groupSet.connectFromLms"
        ) {
          assert.equal(calls.includes("groupSet.fetchAvailableFromLms"), false)
          const load = [...window.document.querySelectorAll("button")].find(
            (button) => button.textContent === "Load group sets",
          )
          assert.ok(load)
          await React.act(async () => {
            load.click()
            await flush()
          })
        }
        if (
          operation !== "groupSet.fetchAvailableFromLms" &&
          operation !== "repo.listNamespace"
        ) {
          await React.act(async () => {
            await controller.waitForIdle()
            await flush()
          })
          const preview = [...window.document.querySelectorAll("button")].find(
            (button) => button.textContent === "Preview",
          )
          assert.ok(preview)
          assert.equal(preview.disabled, false)
          await React.act(async () => {
            preview.click()
            await flush()
          })
        }
        const signal = await entered.promise
        assert.equal(signal.aborted, false)
        const freeze = window.document.querySelector(
          "[data-session-input-frozen]",
        )
        assert.ok(freeze)
        if (operation !== "repo.listNamespace")
          assert.ok(window.document.querySelector('[role="dialog"]'))
        container
          .querySelector("nav button")
          ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
        assert.equal(navigations, 0)
        const cancel = [...window.document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === closeControl,
        )
        assert.ok(cancel)
        assert.equal(cancel.getAttribute(sessionCancellationControl), operation)
        assert.equal(cancel.disabled, false)
        assert.equal(cancel.closest("fieldset[disabled]"), null)
        assert.equal(window.getComputedStyle(cancel).outlineWidth, "3px")
        for (const type of ["keydown", "keyup"]) {
          const event = new window.KeyboardEvent(type, {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          })
          cancel.dispatchEvent(event)
          assert.equal(event.defaultPrevented, false)
        }
        await React.act(async () => {
          cancel.click()
          await flush()
        })
        assert.equal(signal.aborted, true)
        assert.ok(window.document.querySelector("[data-session-input-frozen]"))
        assert.equal(window.document.querySelector('[role="dialog"]'), null)
        await React.act(async () => {
          release.reject(new Error("Request cancelled"))
          await controller.waitForIdle()
          await flush()
        })
        assert.equal(
          window.document.querySelector("[data-session-input-frozen]"),
          null,
        )
        assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
        assert.equal(useCourseStore.getState().course, originalCourse)
        assert.equal(calls.filter((id) => id === operation).length, 1)
        if (operation === "repo.listNamespace") {
          assert.doesNotMatch(
            container.textContent,
            /Listing repositories|Request cancelled/,
          )
          assert.equal(
            container
              .querySelector("#clone-all-filter")
              ?.hasAttribute("disabled"),
            false,
          )
        } else {
          assert.equal(useUiStore.getState().rosterSyncDialogOpen, false)
          assert.equal(
            useUiStore.getState().connectLmsGroupSetDialogOpen,
            false,
          )
          assert.equal(useUiStore.getState().syncGroupSetTriggerId, null)
        }
        container
          .querySelector("nav button")
          ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
        assert.equal(navigations, 1)
      })
    }
  }
})
