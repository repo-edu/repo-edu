import assert from "node:assert/strict"
import { it } from "node:test"
import type {
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
} from "@repo-edu/application-contract"
import type { PersistedLlmConnection } from "@repo-edu/domain/connection"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { Window } from "happy-dom"
import React from "react"
import type { SubmissionExaminationSource } from "../components/tabs/examination/source.js"
import type { ExaminationEngineViewModel } from "../components/tabs/examination/use-examination-engine.js"
import {
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

it("looks up questions only when result inputs change while Settings is open", {
  timeout: 10000,
}, async (t) => {
  const window = new Window()
  const globals = {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
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
  const { useExaminationEngine } = await import(
    "../components/tabs/examination/use-examination-engine.js"
  )
  const {
    SessionControllerProvider,
    setSessionController,
    clearSessionController,
  } = await import("../session/session-controller-context.js")
  const { WorkflowClientProvider } = await import(
    "../contexts/workflow-client.js"
  )
  const { RendererHostProvider } = await import("../contexts/renderer-host.js")
  const { useExaminationStore } = await import("../stores/examination-store.js")
  const { useUiStore } = await import("../stores/ui-store.js")
  resetStores()
  useExaminationStore.getState().reset()
  useExaminationStore.getState().setQuestionCount(4)
  const connection: PersistedLlmConnection = {
    id: "claude",
    name: "Claude",
    provider: "claude",
    authMode: "api",
    apiKey: "original-key",
  }
  let source: SubmissionExaminationSource = {
    kind: "submission",
    folderPath: "/submission",
    contentScopeId: "submission-scope",
    subject: {
      id: "student",
      name: "Student",
      email: "student@example.test",
      lines: 1,
      linesPercent: 100,
      excerpts: [{ filePath: "main.ts", startLine: 1, lines: ["return 1"] }],
      excerptFileSources: { "main.ts": "return 1" },
      excerptScopeId: "excerpt-scope",
    },
    localIdentityContext: {
      names: [],
      emails: [],
      opaqueIdentifiers: [],
      gitUsernames: [],
    },
  }
  const lookups: ExaminationLookupQuestionsInput[] = []
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "settings.loadApp") {
        return makeSettings({
          activeSurface: { kind: "home" },
          llmConnections: [connection],
          activeLlmConnectionId: connection.id,
          examinationModelsByProvider: { claude: "22" },
        })
      }
      if (
        id === "settings.savePreferences" ||
        id === "settings.saveCredentials"
      )
        return undefined
      assert.equal(id, "examination.lookupQuestions")
      const lookup = input as ExaminationLookupQuestionsInput
      lookups.push(lookup)
      return {
        requestedKey: {
          personId: lookup.personId,
          contentScopeId: lookup.contentScopeId,
          questionCount: lookup.questionCount,
          providerPayloadFingerprint: "b".repeat(64),
          generationContextFingerprint: "c".repeat(64),
        },
        exact: null,
        availableSets: [],
        sourceReferences: [],
      } satisfies ExaminationLookupQuestionsResult
    }),
  })
  await controller.waitForIdle()
  setSessionController(controller)
  const container = window.document.createElement("div")
  window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  t.after(async () => {
    await React.act(async () => {
      await controller.waitForIdle()
      root.unmount()
    })
    controller.dispose()
    clearSessionController(controller)
    useExaminationStore.getState().reset()
    useUiStore.getState().reset()
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  let view: ExaminationEngineViewModel
  function Probe() {
    view = useExaminationEngine({ source, emptyBlocker: null })
    return null
  }
  async function render() {
    await React.act(async () => {
      root.render(
        <SessionControllerProvider controller={controller}>
          <WorkflowClientProvider value={controller.operations}>
            <RendererHostProvider value={{} as RendererHost}>
              <Probe />
            </RendererHostProvider>
          </WorkflowClientProvider>
        </SessionControllerProvider>,
      )
    })
    await React.act(async () => {
      await controller.waitForIdle()
    })
  }
  async function change(action: () => void) {
    await React.act(async () => action())
    await React.act(async () => {
      await controller.waitForIdle()
    })
  }
  await render()
  assert.equal(lookups.length, 1)
  await change(() => view.commands.openLlmSettings())
  assert.equal(useUiStore.getState().settingsDialogOpen, true)
  assert.equal(useUiStore.getState().settingsCategory, "llm-connections")
  const updated = { ...connection, name: "Renamed", apiKey: "current-key" }
  const second = { ...connection, id: "second", name: "Second" }
  for (const edit of [
    () => controller.updateLlmConnection(connection.id, updated),
    () => controller.addLlmConnection(second),
    () => controller.setActiveLlmConnectionId(second.id),
    () => view.commands.selectConnection(second.id),
    () => controller.removeLlmConnection(connection.id),
  ]) {
    await change(edit)
    assert.equal(lookups.length, 1)
    assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
    assert.equal(controller.getSnapshot().lifecycle.kind, "live")
  }
  const latest = { ...second, apiKey: "latest-key" }
  await change(() => controller.updateLlmConnection(second.id, latest))
  assert.equal(lookups.length, 1)
  await change(() => view.commands.changeQuestionCount(5))
  assert.equal(view.questionCount, 5)
  assert.equal(lookups.length, 2)
  assert.deepEqual(lookups.at(-1)?.llmSettings.llmConnections, [latest])
  assert.equal(lookups.at(-1)?.llmSettings.activeLlmConnectionId, second.id)
  await change(() => view.commands.selectModelCode("23"))
  assert.equal(lookups.length, 3)
  assert.equal(
    lookups.at(-1)?.llmSettings.examinationModelsByProvider.claude,
    "23",
  )
  source = {
    ...source,
    localIdentityContext: {
      ...source.localIdentityContext,
      names: ["Student"],
    },
  }
  await render()
  assert.equal(lookups.length, 4)
  assert.deepEqual(lookups.at(-1)?.localIdentityContext.names, ["Student"])
  source = {
    ...source,
    subject: {
      ...source.subject,
      excerpts: [{ filePath: "main.ts", startLine: 1, lines: ["return 2"] }],
      excerptFileSources: { "main.ts": "return 2" },
    },
  }
  await render()
  assert.equal(lookups.length, 5)
  assert.deepEqual(lookups.at(-1)?.excerptFileSources, {
    "main.ts": "return 2",
  })
})
