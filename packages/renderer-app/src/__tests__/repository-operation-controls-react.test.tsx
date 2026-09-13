import assert from "node:assert/strict"
import { it } from "node:test"
import type { WorkflowClient, WorkflowId } from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { QueryClientProvider } from "@tanstack/react-query"
import { Window } from "happy-dom"
import React from "react"
import { createRoot } from "react-dom/client"
import { createRendererQueryClient } from "../analysis/analysis-query-client.js"
import { CloneAllRepositoriesPanel } from "../components/tabs/groups-assignments/GroupSetGroupsTable/CloneAllRepositoriesPanel.js"
import type { RepoOperations } from "../components/tabs/groups-assignments/GroupSetGroupsTable/repository-operation-fields.js"
import { useCloneAllRepositories } from "../components/tabs/groups-assignments/GroupSetGroupsTable/use-clone-all-repositories.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { selectCredentials } from "../session/selectors.js"
import { SessionControllerProvider } from "../session/session-controller-context.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
} from "./session-controller.test-support.js"

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const debounce = () => new Promise<void>((resolve) => setTimeout(resolve, 400))

it("retains listing rows and disables all clone-all controls during commands", {
  timeout: 5000,
}, async (t) => {
  resetStores()
  const window = new Window()
  const globals = {
    window,
    document: window.document,
    getComputedStyle: window.getComputedStyle.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const descriptors = Object.getOwnPropertyDescriptors(globalThis)
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    })
  const release = deferred<void>()
  const exportRelease = deferred<void>()
  const queueRelease = deferred<void>()
  const cloneRelease = deferred<void>()
  const pending = deferred<void>()
  const filters: unknown[] = []
  const first = {
    repositories: [{ name: "old", identifier: "old", archived: false }],
  }
  const second = {
    repositories: [{ name: "new", identifier: "new", archived: false }],
  }
  const controller = startController({
    workflowClient: {
      async run(id: WorkflowId, input: unknown) {
        if (id === "settings.loadApp")
          return makeSettings({
            activeGitConnectionId: "git",
            gitConnections: [
              {
                id: "git",
                provider: "github",
                baseUrl: "https://github.com",
                token: "example-token",
              },
            ],
          })
        if (id === "settings.saveCredentials") return undefined
        if (id === "repo.listNamespace") {
          filters.push((input as { filter?: string }).filter)
          if (filters.length === 2) {
            pending.resolve()
            await release.promise
          }
          return filters.length === 1 ? first : second
        }
        if (id === "repo.bulkClone") {
          await cloneRelease.promise
          return {
            repositoriesPlanned: 1,
            repositoriesCloned: 1,
            repositoriesFailed: 0,
            recordedRepositories: {},
            completedAt: "2026-09-12T00:00:00Z",
          }
        }
        assert.fail(id)
      },
    } as WorkflowClient,
  })
  await controller.waitForIdle()
  const client = createRendererQueryClient()
  let value: ReturnType<typeof useCloneAllRepositories> | undefined
  function Panel() {
    value = useCloneAllRepositories({
      activeConnectionId: "git",
      organization: "org",
      initialTargetDirectory: "/repos",
    })
    return null
  }
  // Happy DOM implements the DOM the renderer expects, so the container is
  // typed as the DOM element it stands in for.
  const container = window.document.createElement(
    "div",
  ) as unknown as HTMLElement
  const root = createRoot(container)
  const render = (open: boolean, showControls = false) =>
    root.render(
      <SessionControllerProvider controller={controller}>
        <WorkflowClientProvider value={controller.operations}>
          <RendererHostProvider value={{} as RendererHost}>
            <QueryClientProvider client={client}>
              {open ? (
                showControls ? (
                  <CloneAllRepositoriesPanel
                    operations={
                      {
                        activeGitConnection: selectCredentials(
                          controller.getSnapshot(),
                        ).gitConnections[0],
                        organization: "org",
                        cloneTargetDirectory: "/repos",
                      } as RepoOperations
                    }
                  />
                ) : (
                  <Panel />
                )
              ) : null}
            </QueryClientProvider>
          </RendererHostProvider>
        </WorkflowClientProvider>
      </SessionControllerProvider>,
    )
  t.after(async () => {
    release.resolve()
    exportRelease.resolve()
    queueRelease.resolve()
    cloneRelease.resolve()
    await React.act(async () => root.unmount())
    controller.dispose()
    client.clear()
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  await React.act(async () => {
    render(true)
    await flush()
  })
  assert.deepEqual(filters, [])
  await React.act(async () => {
    await debounce()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.deepEqual(filters, [undefined])
  assert.ok(value)
  assert.deepEqual(value.listResult, first)
  assert.equal(value.canClone, true)

  const listingCalls = filters.length
  await React.act(async () => {
    controller.addLmsConnection({
      id: "lms",
      name: "Course LMS",
      provider: "canvas",
      baseUrl: "https://canvas.example.edu",
      token: "example-token",
    })
    controller.addLlmConnection({
      id: "llm",
      name: "Question model",
      provider: "codex",
      authMode: "api",
      apiKey: "example-key",
    })
    controller.addGitConnection({
      id: "other-git",
      provider: "gitlab",
      baseUrl: "https://gitlab.example.edu",
      token: "example-token",
    })
    await flush()
  })
  assert.equal(value.canClone, true)
  await React.act(debounce)
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.equal(filters.length, listingCalls)
  await React.act(async () => {
    value?.setFilter("new")
    await flush()
  })
  assert.equal(value.canClone, false)
  assert.deepEqual(value.listResult, first)
  await React.act(async () => {
    await debounce()
  })
  await pending.promise
  assert.equal(value.canClone, false)
  assert.deepEqual(value.listResult, first)
  await React.act(async () => {
    render(false)
    await flush()
  })
  assert.equal(client.isFetching(), 1)
  await React.act(async () => {
    release.resolve()
    await controller.waitForIdle()
    await flush()
  })
  await React.act(async () => {
    render(true)
    await flush()
  })
  await React.act(async () => {
    await debounce()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.deepEqual(filters, [undefined, "new", undefined])
  assert.deepEqual(value.listResult, second)
  assert.equal(value.canClone, true)
  let exporting: Promise<void> | undefined
  await React.act(async () => {
    exporting = controller.operations.execute(
      "groupSet.export",
      () => exportRelease.promise,
    )
    await flush()
  })
  assert.equal(value.canStartQueries, false)
  assert.deepEqual(value.listResult, second)
  await React.act(async () => {
    exportRelease.resolve()
    await exporting
    await controller.waitForIdle()
    await flush()
  })
  assert.equal(value.canClone, true)
  assert.equal(value.canStartQueries, true)

  const callsBeforeCredentialChange = filters.length
  const preceding = controller.operations.execute(
    "course.list",
    () => queueRelease.promise,
  )
  await React.act(async () => {
    controller.updateGitConnection("git", {
      id: "git",
      provider: "github",
      baseUrl: "https://github.com",
      token: "updated-example-token",
    })
    await flush()
  })
  assert.equal(value.canClone, false)
  await React.act(debounce)
  assert.equal(filters.length, callsBeforeCredentialChange)
  assert.equal(value.canClone, false)
  assert.deepEqual(value.listResult, second)
  await React.act(async () => {
    queueRelease.resolve()
    await preceding
    await controller.waitForIdle()
    await flush()
  })
  assert.equal(filters.length, callsBeforeCredentialChange + 1)
  assert.equal(value.canClone, true)

  await React.act(async () => {
    render(true, true)
    await flush()
  })
  await React.act(debounce)
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  const controls = Array.from(container.querySelectorAll("input, button"))
  const cloneButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.startsWith("Clone 1 Repository"),
  )
  assert.ok(cloneButton)
  assert.ok(container.querySelector("#clone-all-filter"))
  assert.ok(container.querySelector("#clone-all-include-archived"))
  assert.ok(container.querySelector("#clone-all-target"))
  // Happy DOM does not include a parent fieldset in its :disabled check.
  const isDisabled = (control: Element) =>
    control.matches(":disabled") ||
    control.closest("fieldset[disabled]") !== null
  assert.ok(controls.every((control) => !isDisabled(control)))
  await React.act(async () => {
    cloneButton.click()
    await flush()
  })
  assert.match(container.textContent, /Cloning/)
  assert.match(container.textContent, /new/)
  for (const control of controls) {
    assert.equal(isDisabled(control), true, control.outerHTML)
  }
  await React.act(async () => {
    cloneRelease.resolve()
    await controller.waitForIdle()
    await flush()
  })
  assert.match(container.textContent, /1 cloned \/ 0 failed/)
  assert.ok(controls.every((control) => !isDisabled(control)))
})
