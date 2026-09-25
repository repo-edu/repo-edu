import assert from "node:assert/strict"
import { it } from "node:test"
import type { WorkflowClient, WorkflowId } from "@repo-edu/application-contract"
import type { PersistedAppCredentials } from "@repo-edu/domain/settings"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { QueryClientProvider } from "@tanstack/react-query"
import { Window } from "happy-dom"
import React from "react"
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
  testSessionStart,
} from "./session-controller.test-support.js"

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const typingPause = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 400))

it("lists only on Search and clones only matching results", {
  timeout: 5000,
}, async (t) => {
  resetStores()
  const window = new Window()
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
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
  const { createRoot } = await import("react-dom/client")
  const release = deferred<void>()
  const exportRelease = deferred<void>()
  const cloneRelease = deferred<void>()
  const pending = deferred<void>()
  const filters: unknown[] = []
  const namespaces: string[] = []
  const archived: boolean[] = []
  const cloneInputs: unknown[] = []
  const listingCredentials: PersistedAppCredentials[] = []
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
          listingCredentials.push(
            (input as { credentials: PersistedAppCredentials }).credentials,
          )
          namespaces.push((input as { namespace: string }).namespace)
          filters.push((input as { filter?: string }).filter)
          archived.push((input as { includeArchived: boolean }).includeArchived)
          if (filters.length === 2) {
            pending.resolve()
            await release.promise
          }
          return filters.length === 1 ? first : second
        }
        if (id === "repo.bulkClone") {
          cloneInputs.push(input)
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
  function Controls({ initialNamespace }: { initialNamespace: string }) {
    const [organization, setOrganization] = React.useState<string | null>(
      initialNamespace,
    )
    const gitConnections = selectCredentials(
      controller.getSnapshot(),
    ).gitConnections
    return (
      <CloneAllRepositoriesPanel
        groupSetId="test"
        operations={
          {
            activeGitConnection: gitConnections[0],
            activeGitConnectionId: "git",
            gitConnections: [gitConnections[0]],
            organization,
            setOrganization: (next) => {
              controller.operations.change(() => setOrganization(next))
            },
            cloneTargetDirectory: "/repos",
          } as RepoOperations
        }
      />
    )
  }
  // Happy DOM implements the DOM the renderer expects, so the container is
  // typed as the DOM element it stands in for.
  const container = window.document.createElement(
    "div",
  ) as unknown as HTMLElement
  window.document.body.appendChild(container as never)
  const root = createRoot(container)
  const render = (
    open: boolean,
    showControls = false,
    initialNamespace = "org",
  ) =>
    root.render(
      <SessionControllerProvider controller={controller}>
        <WorkflowClientProvider value={controller.operations}>
          <RendererHostProvider value={{} as RendererHost}>
            <QueryClientProvider client={client}>
              {open ? (
                showControls ? (
                  <Controls initialNamespace={initialNamespace} />
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
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.deepEqual(filters, [])
  assert.ok(value)
  assert.equal(value.listResult, null)
  assert.equal(value.canClone, false)
  await React.act(async () => {
    value?.setFilter("draft")
    await flush()
  })
  await React.act(async () => {
    value?.setFilter("")
    value?.setIncludeArchived(true)
    await flush()
  })
  await React.act(async () => {
    value?.setIncludeArchived(false)
    await flush()
  })
  assert.deepEqual(filters, [])
  await React.act(async () => {
    value?.search()
    await flush()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.deepEqual(filters, [undefined])
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
  await React.act(flush)
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
  assert.equal(value.listResult, null)
  value.handleBulkClone()
  assert.deepEqual(cloneInputs, [])
  await React.act(async () => {
    value?.setFilter("")
    await flush()
  })
  assert.equal(value.canClone, true)
  assert.equal(filters.length, listingCalls)
  await React.act(async () => {
    value?.setFilter("new")
    await flush()
  })
  await React.act(async () => {
    await typingPause()
  })
  assert.equal(filters.length, listingCalls)
  await React.act(async () => {
    value?.search()
    await flush()
  })
  await pending.promise
  assert.equal(value.canStartQueries, false)
  assert.equal(value.canClone, false)
  assert.equal(value.listResult, null)
  value.handleBulkClone()
  assert.deepEqual(cloneInputs, [])
  assert.equal(client.isFetching(), 1)
  await React.act(async () => {
    release.resolve()
    await controller.waitForIdle()
    await flush()
  })
  assert.deepEqual(filters, [undefined, "new"])
  assert.equal(value.canStartQueries, true)
  await React.act(flush)
  assert.deepEqual(filters, [undefined, "new"])
  await React.act(async () => {
    render(false)
    await flush()
  })
  await React.act(async () => {
    render(true)
    await flush()
  })
  await React.act(async () => {
    await flush()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.deepEqual(filters, [undefined, "new"])
  assert.equal(value.listResult, null)
  assert.equal(value.canClone, false)
  await React.act(async () => {
    value?.search()
    await flush()
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
      testSessionStart("groupSetExport"),
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
  assert.equal(filters.length, 3, "export completion must not list again")

  await t.test(
    "saving the active connection with the panel mounted waits for search",
    async () => {
      const callsBeforeCredentialChange = filters.length
      await React.act(async () => {
        controller.updateGitConnection("git", {
          id: "git",
          provider: "github",
          baseUrl: "https://github.com",
          token: "updated-example-token",
        })
        await flush()
      })
      await React.act(async () => {
        await controller.waitForIdle()
        await flush()
      })
      assert.ok(value)
      assert.equal(filters.length, callsBeforeCredentialChange)
      assert.equal(value.canStartQueries, true)
      assert.equal(value.canClone, false)
      assert.equal(value.listResult, null)
      value.handleBulkClone()
      assert.deepEqual(cloneInputs, [])
      assert.equal(
        window.document.querySelector("[data-session-input-frozen]"),
        null,
      )
      await React.act(async () => {
        value?.search()
        await flush()
      })
      await React.act(async () => {
        await controller.waitForIdle()
        await flush()
      })
      assert.equal(filters.length, callsBeforeCredentialChange + 1)
      assert.equal(
        listingCredentials.at(-1)?.gitConnections[0].token,
        "updated-example-token",
      )
      assert.equal(value.canClone, true)
    },
  )

  await React.act(async () => {
    render(true, true)
    await flush()
  })
  await React.act(flush)
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  const pressSearch = async () => {
    const search = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Search",
    )
    assert.ok(search)
    assert.equal(search.disabled, false)
    await React.act(async () => {
      search.click()
      await flush()
    })
    await React.act(async () => {
      await controller.waitForIdle()
      await flush()
    })
  }
  assert.match(container.textContent, /Press Search to list repositories/)
  const beforeOpeningControls = filters.length
  await pressSearch()
  assert.equal(filters.length, beforeOpeningControls + 1)
  let controls = Array.from(container.querySelectorAll("input, button")).filter(
    (control) => control.id !== "group-set-test-namespace",
  )
  let cloneButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.startsWith("Clone 1 Repository"),
  )
  assert.ok(cloneButton)
  assert.ok(container.querySelector("#clone-all-filter"))
  assert.ok(container.querySelector("#clone-all-include-archived"))
  assert.ok(container.querySelector("#clone-all-target"))
  assert.match(container.textContent, /Press Enter to search/)
  const filterInput =
    container.querySelector<HTMLInputElement>("#clone-all-filter")
  const archivedControl = container.querySelector<HTMLButtonElement>(
    "#clone-all-include-archived",
  )
  assert.ok(filterInput)
  assert.ok(archivedControl)
  const beforeInputEvents = filters.length
  await React.act(async () => {
    filterInput.focus()
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set
    assert.ok(setValue)
    setValue.call(filterInput, "typed-*")
    filterInput.dispatchEvent(
      new window.Event("input", { bubbles: true }) as unknown as Event,
    )
    await flush()
  })
  assert.equal(filterInput.value, "typed-*")
  assert.match(container.textContent, /Press Search to list repositories/)
  assert.doesNotMatch(container.textContent, /1 repository match/)
  await React.act(async () => {
    filterInput.dispatchEvent(
      new window.FocusEvent("focusout", { bubbles: true }) as unknown as Event,
    )
    await typingPause()
  })
  assert.equal(filters.length, beforeInputEvents)
  await React.act(async () => {
    filterInput.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      }) as unknown as Event,
    )
    await flush()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.equal(filters.length, beforeInputEvents + 1)
  assert.equal(filters.at(-1), "typed-*")
  await React.act(async () => {
    archivedControl.click()
    await flush()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.equal(filters.length, beforeInputEvents + 1)
  assert.match(container.textContent, /Press Search to list repositories/)
  await pressSearch()
  assert.equal(filters.length, beforeInputEvents + 2)
  assert.equal(archived.at(-1), true)

  const namespaceInput = container.querySelector<HTMLInputElement>(
    "#group-set-test-namespace",
  )
  assert.ok(namespaceInput)
  const typeNamespace = async (next: string) => {
    await React.act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set
      assert.ok(setValue)
      setValue.call(namespaceInput, next)
      namespaceInput.dispatchEvent(
        new window.Event("input", { bubbles: true }) as unknown as Event,
      )
      await flush()
    })
  }
  const beforeNamespaceEdit = filters.length
  for (const draft of ["", "o", "or", "org"]) await typeNamespace(draft)
  assert.equal(filters.length, beforeNamespaceEdit)
  cloneButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.startsWith("Clone 1 Repository"),
  )
  assert.ok(cloneButton)
  assert.equal(cloneButton.disabled, false)
  for (const draft of ["", "n", "ne", "new-org"]) await typeNamespace(draft)
  await React.act(async () => {
    namespaceInput.dispatchEvent(
      new window.FocusEvent("focusout", { bubbles: true }) as unknown as Event,
    )
    await typingPause()
  })
  assert.equal(filters.length, beforeNamespaceEdit)
  cloneButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.startsWith("Clone 1 Repository"),
  )
  assert.equal(cloneButton, undefined)
  await React.act(async () => {
    namespaceInput.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      }) as unknown as Event,
    )
    await flush()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.equal(filters.length, beforeNamespaceEdit + 1)
  assert.equal(namespaces.at(-1), "new-org")
  assert.equal(filters.at(-1), "typed-*")
  cloneButton = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.startsWith("Clone 1 Repository"),
  )
  assert.ok(cloneButton)
  assert.equal(cloneButton.disabled, false)
  controls = Array.from(container.querySelectorAll("input, button")).filter(
    (control) => control.id !== "group-set-test-namespace",
  )
  // Happy DOM does not include a parent fieldset in its :disabled check.
  const isDisabled = (control: Element) =>
    control.matches(":disabled") ||
    control.closest("fieldset[disabled]") !== null
  assert.ok(controls.every((control) => !isDisabled(control)))
  const beforeClone = filters.length
  await React.act(async () => {
    cloneButton?.click()
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
  assert.equal(
    filters.length,
    beforeClone,
    "clone completion must not list again",
  )

  await React.act(async () => {
    render(false)
    await flush()
  })
  await React.act(async () => {
    render(true, true, "")
    await flush()
  })
  const emptyNamespace = container.querySelector<HTMLInputElement>(
    "#group-set-test-namespace",
  )
  assert.ok(emptyNamespace)
  await React.act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set
    assert.ok(setValue)
    setValue.call(emptyNamespace, "first-org")
    emptyNamespace.dispatchEvent(
      new window.Event("input", { bubbles: true }) as unknown as Event,
    )
    await flush()
  })
  assert.equal(filters.length, beforeClone)
  await React.act(async () => {
    emptyNamespace.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      }) as unknown as Event,
    )
    await flush()
  })
  await React.act(async () => {
    await controller.waitForIdle()
    await flush()
  })
  assert.equal(filters.length, beforeClone + 1)
  assert.equal(namespaces.at(-1), "first-org")
})
