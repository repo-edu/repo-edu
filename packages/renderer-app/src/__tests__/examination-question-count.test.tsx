import assert from "node:assert/strict"
import { it } from "node:test"
import type {
  ExaminationLookupQuestionsInput,
  ExaminationLookupQuestionsResult,
} from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { Window } from "happy-dom"
import React from "react"
import type { SubmissionExaminationSource } from "../components/tabs/examination/source.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

it("selects a complete question count before lookup freezes further choices", {
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
  const { ExaminationControlsCard } = await import(
    "../components/tabs/examination/ExaminationControlsCard.js"
  )
  const { useExaminationEngine } = await import(
    "../components/tabs/examination/use-examination-engine.js"
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
  useExaminationStore.getState().setQuestionCount(4)
  const source: SubmissionExaminationSource = {
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
  const release = deferred<void>()
  const counts: number[] = []
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
      if (id === "course.list") return []
      if (id === "settings.loadApp") {
        return makeSettings({
          activeSurface: { kind: "home" },
          llmConnections: [
            {
              id: "claude",
              name: "Claude",
              provider: "claude",
              authMode: "subscription",
              apiKey: "",
            },
          ],
          activeLlmConnectionId: "claude",
          examinationModelsByProvider: { claude: "22" },
        })
      }
      assert.equal(id, "examination.lookupQuestions")
      const lookup = input as ExaminationLookupQuestionsInput
      counts.push(lookup.questionCount)
      if (lookup.questionCount === 10) await release.promise
      return {
        requestedKey: {
          personId: source.subject.id,
          contentScopeId: source.contentScopeId,
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
  const container = window.document.createElement("div")
  window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  t.after(async () => {
    await React.act(async () => {
      release.resolve()
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
  function Controls() {
    const view = useExaminationEngine({ source, emptyBlocker: null })
    return (
      <ExaminationControlsCard
        questionCount={view.questionCount}
        showAnswers={view.showAnswers}
        blocker={view.blocker}
        isGenerating={false}
        canRegenerate={false}
        canToggleAnswers={false}
        canCopyMarkdown={false}
        onQuestionCountChange={view.commands.changeQuestionCount}
        onShowAnswersChange={view.commands.changeShowAnswers}
        onGenerate={view.commands.generate}
        onStopGeneration={view.commands.stopGeneration}
        onRegenerate={view.commands.regenerate}
        onCopyMarkdown={view.commands.copyMarkdown}
      />
    )
  }
  await React.act(async () => {
    root.render(
      <SessionControllerProvider controller={controller}>
        <WorkflowClientProvider value={controller.operations}>
          <RendererHostProvider value={{} as RendererHost}>
            <Controls />
          </RendererHostProvider>
        </WorkflowClientProvider>
      </SessionControllerProvider>,
    )
  })
  await React.act(async () => {
    await controller.waitForIdle()
  })
  assert.deepEqual(counts, [4])
  const trigger = container.querySelector("#examination-question-count")
  assert.ok(trigger)
  const press = (target: typeof trigger, key: string) => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(event)
    return event
  }
  await React.act(async () => {
    press(trigger, "Enter")
  })
  const options = [...window.document.querySelectorAll('[role="option"]')]
  assert.deepEqual(
    options.map((option) => option.textContent),
    Array.from({ length: 20 }, (_, index) => String(index + 1)),
  )
  const ten = options.find((option) => option.textContent === "10")
  assert.ok(ten)
  await React.act(async () => {
    press(ten, "Enter")
  })
  assert.deepEqual(counts, [4, 10])
  assert.equal(trigger.textContent, "10")
  assert.equal(useExaminationStore.getState().questionCount, 10)
  assert.equal(window.document.querySelector('[role="listbox"]'), null)
  assert.ok(window.document.querySelector("[data-session-input-frozen]"))
  await React.act(async () => {
    assert.equal(press(trigger, "Enter").defaultPrevented, true)
    assert.equal(press(trigger, "2").defaultPrevented, true)
  })
  assert.equal(window.document.querySelector('[role="listbox"]'), null)
  assert.deepEqual(counts, [4, 10])
  assert.equal(trigger.textContent, "10")
  await React.act(async () => {
    release.resolve()
    await controller.waitForIdle()
  })
  assert.equal(
    window.document.querySelector("[data-session-input-frozen]"),
    null,
  )
  await React.act(async () => {
    press(trigger, "Enter")
  })
  const twenty = [...window.document.querySelectorAll('[role="option"]')].find(
    (option) => option.textContent === "20",
  )
  assert.ok(twenty)
  await React.act(async () => {
    press(twenty, "Enter")
  })
  await React.act(async () => {
    await controller.waitForIdle()
  })
  assert.deepEqual(counts, [4, 10, 20])
  assert.equal(trigger.textContent, "20")
})
