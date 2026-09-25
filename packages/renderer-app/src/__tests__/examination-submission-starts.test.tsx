import assert from "node:assert/strict"
import { it } from "node:test"
import type {
  ExaminationGenerateQuestionsInput,
  ExaminationGenerateQuestionsResult,
  ExaminationLookupQuestionsInput,
  ExaminationPrepareSubmissionSourceInput,
  WorkflowClient,
} from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { Window } from "happy-dom"
import React from "react"
import type { ExaminationEngineViewModel } from "../components/tabs/examination/use-examination-engine.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
  testSessionStart,
} from "./session-controller.test-support.js"

it("Load and Generate own submission preparation, cached returns and cancellation", {
  timeout: 15000,
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
  const { submissionPreparationKey } = await import(
    "../components/tabs/examination/submission-source-preparation.js"
  )
  const { listSubmissionFiles, openSubmissionFolder } = await import(
    "../components/tabs/examination/submission-file-listing.js"
  )
  const {
    SessionControllerProvider,
    setSessionController,
    clearSessionController,
    sessionCancellationControl,
  } = await import("../session/session-controller-context.js")
  const { WorkflowClientProvider } = await import(
    "../contexts/workflow-client.js"
  )
  const { RendererHostProvider } = await import("../contexts/renderer-host.js")
  const { useExaminationStore } = await import("../stores/examination-store.js")
  const { useToastStore } = await import("../stores/toast-store.js")
  resetStores()
  useExaminationStore.getState().reset()
  const calls: string[] = []
  const preparations: ExaminationPrepareSubmissionSourceInput[] = []
  const lookups: ExaminationLookupQuestionsInput[] = []
  const generations: ExaminationGenerateQuestionsInput[] = []
  let contents = "return 1"
  let pausePreparation = false
  const enteredPreparation = deferred<void>()
  let preparationSignal: AbortSignal | undefined
  let input: ExaminationPrepareSubmissionSourceInput = {
    folderPath: "/submission",
    selectedRelativePaths: ["main.ts"],
    configuredExtensions: ["ts"],
    attachedRosterIdentities: [],
  }
  const keyFor = (questionCount: number, contentScopeId: string) => ({
    personId: "student",
    contentScopeId,
    questionCount,
    providerPayloadFingerprint: "b".repeat(64),
    generationContextFingerprint: "c".repeat(64),
  })
  const resultFor = (
    questionCount: number,
    contentScopeId: string,
  ): ExaminationGenerateQuestionsResult => ({
    key: keyFor(questionCount, contentScopeId),
    questions: Array.from({ length: questionCount }, (_, index) => ({
      question: `Question ${index + 1}?`,
      answer: `Answer ${index + 1}.`,
      anchor: { sourceId: "E1", lineRange: { start: 1, end: 1 } },
    })),
    usage: null,
    fromArchive: true,
    requestedQuestionCount: questionCount,
    archivedProvenance: {
      model: "22",
      effort: "medium",
      questionCount,
      usage: null,
      createdAtMs: 0,
      redactionPolicyVersion: 1,
      promptTemplateVersion: 1,
    },
    sourceReferences: [],
  })
  const client: WorkflowClient = {
    run: async (id, value, options) => {
      if (id === "settings.loadApp")
        return makeSettings({
          activeSurface: { kind: "submission", path: "/submission" },
          defaultExtensions: ["ts"],
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
        }) as never
      if (id === "course.list") return [] as never
      if (
        id === "settings.savePreferences" ||
        id === "settings.saveCredentials"
      )
        return undefined as never
      calls.push(id)
      if (id === "analysis.listFolderFiles")
        return { files: [{ relativePath: "main.ts", size: 8 }] } as never
      if (id === "examination.prepareSubmissionSource") {
        const preparation = value as ExaminationPrepareSubmissionSourceInput
        preparations.push(preparation)
        if (pausePreparation) {
          preparationSignal = options?.signal
          enteredPreparation.resolve()
          await new Promise<void>((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new Error("Preparation cancelled")),
              { once: true },
            )
          })
        }
        return {
          folderPath: preparation.folderPath,
          personId: "student",
          displayTitle: "Student",
          displaySubtitle: "",
          contentScopeId: contents,
          localIdentityContext: {
            names: [],
            emails: [],
            opaqueIdentifiers: [],
            gitUsernames: [],
          },
          excerpts: [{ filePath: "main.ts", startLine: 1, lines: [contents] }],
          excerptFileSources: { "main.ts": contents },
        } as never
      }
      if (id === "examination.lookupQuestions") {
        const lookup = value as ExaminationLookupQuestionsInput
        lookups.push(lookup)
        const result = resultFor(lookup.questionCount, lookup.contentScopeId)
        return {
          requestedKey: result.key,
          exact: result,
          availableSets: [result],
          sourceReferences: [],
        } as never
      }
      if (id === "examination.lookupQuestionSummaries")
        return { summaries: [] } as never
      assert.equal(id, "examination.generateQuestions")
      const generation = value as ExaminationGenerateQuestionsInput
      generations.push(generation)
      return resultFor(
        generation.questionCount,
        generation.contentScopeId,
      ) as never
    },
  }
  const controller = startController({ workflowClient: client })
  await controller.waitForIdle()
  setSessionController(controller)
  const container = window.document.createElement("div")
  window.document.body.append(container)
  const root = createRoot(container as unknown as HTMLElement)
  t.after(async () => {
    controller.operations.stop("examination.generateQuestions")
    await React.act(async () => {
      await controller.waitForIdle()
      root.unmount()
    })
    controller.dispose()
    clearSessionController(controller)
    useExaminationStore.getState().reset()
    await window.happyDOM.close()
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  let view: ExaminationEngineViewModel | undefined
  function Probe() {
    const source = useExaminationStore(
      (state) =>
        state.preparedSubmissionSources.get(submissionPreparationKey(input)) ??
        null,
    )
    view = useExaminationEngine({
      source,
      submissionInput: input,
      emptyBlocker: null,
    })
    return (
      <button
        type="button"
        {...(view.isGenerating
          ? { [sessionCancellationControl]: "examination.generateQuestions" }
          : {})}
        onClick={
          view.isGenerating
            ? view.commands.stopGeneration
            : view.commands.generate
        }
      >
        {view.isGenerating ? "Stop" : "Generate"}
      </button>
    )
  }
  function current() {
    assert.ok(view)
    return view
  }
  async function render(key = "first", visible = true) {
    await React.act(async () =>
      root.render(
        <SessionControllerProvider controller={controller}>
          <WorkflowClientProvider value={controller.operations}>
            <RendererHostProvider value={{} as RendererHost}>
              {visible ? <Probe key={key} /> : null}
            </RendererHostProvider>
          </WorkflowClientProvider>
        </SessionControllerProvider>,
      ),
    )
  }
  async function act(action: () => unknown) {
    await React.act(async () => {
      await action()
    })
    await React.act(async () => {
      await controller.waitForIdle()
    })
  }
  const refresh = () =>
    controller.operations.execute(
      testSessionStart("submissionRefresh"),
      "analysis.listFolderFiles",
      (scope) =>
        listSubmissionFiles(
          scope,
          input.folderPath,
          input.configuredExtensions,
        ),
    )
  await render()
  assert.deepEqual(calls, [])
  assert.equal(current().activeConnection?.id, "claude")
  await act(() => current().commands.changeQuestionCount(5))
  assert.equal(current().questionCount, 5)
  await act(() => current().commands.selectModelCode("23"))
  assert.equal(current().selectedModelCode, "23")
  await act(() => current().commands.selectModelCode("22"))
  assert.deepEqual(calls, [])

  await act(() => current().commands.loadQuestions())
  assert.deepEqual(calls, [
    "examination.prepareSubmissionSource",
    "examination.lookupQuestions",
    "examination.lookupQuestionSummaries",
  ])
  assert.equal(generations.length, 0)
  assert.equal(current().display.displayEntry?.questions.length, 5)
  await act(() => current().commands.changeQuestionCount(6))
  assert.equal(calls.length, 3)
  assert.equal(current().display.hasDisplayResults, false)
  await act(() => current().commands.changeQuestionCount(5))
  assert.equal(current().display.displayEntry?.questions.length, 5)
  await render("away", false)
  await render("returned")
  assert.equal(calls.length, 3)
  assert.equal(current().display.displayEntry?.questions.length, 5)
  await act(() => current().commands.loadQuestions())
  assert.equal(preparations.length, 1)
  assert.equal(lookups.length, 2)
  await act(() => current().commands.generate())
  assert.equal(preparations.length, 1)
  assert.equal(lookups.length, 2)
  assert.equal(generations.length, 1)
  assert.equal(generations[0]?.seedQuestions?.length, 5)

  contents = "return 2"
  await act(refresh)
  assert.equal(preparations.length, 1)
  assert.equal(current().display.hasDisplayResults, false)
  await act(() => current().commands.loadQuestions())
  assert.equal(preparations.length, 2)
  assert.equal(lookups.at(-1)?.excerptFileSources["main.ts"], "return 2")
  contents = "return 3"
  await act(() =>
    controller.operations.execute(
      testSessionStart("submissionRefresh"),
      "analysis.listFolderFiles",
      (scope) =>
        openSubmissionFolder(scope, { path: input.folderPath }, "picker"),
    ),
  )
  assert.equal(preparations.length, 2)
  await act(() => current().commands.generate())
  assert.equal(preparations.length, 3)
  assert.equal(generations.at(-1)?.excerptFileSources["main.ts"], "return 3")
  const beforeReturn = calls.length
  await render("away-again", false)
  await act(() =>
    controller.activateSurface(testSessionStart("home"), { kind: "home" }),
  )
  await act(() =>
    controller.operations.execute(
      testSessionStart("submissionRefresh"),
      "analysis.listFolderFiles",
      (scope) =>
        openSubmissionFolder(scope, { path: input.folderPath }, "recent"),
    ),
  )
  await render("recent-return")
  assert.equal(calls.length, beforeReturn)
  assert.equal(current().display.hasDisplayResults, true)

  // A changed selection has no source until an explicit control prepares it.
  input = { ...input, selectedRelativePaths: ["other.ts"] }
  await render("recent-return")
  assert.equal(calls.length, beforeReturn)
  assert.equal(current().display.hasDisplayResults, false)
  await act(() => current().commands.generate())
  assert.equal(preparations.length, 4)
  assert.equal(generations.length, 3)

  await act(refresh)
  await act(() => current().commands.changeQuestionCount(6))
  assert.equal(current().questionCount, 6)
  await act(() => current().commands.loadQuestions())
  assert.equal(lookups.at(-1)?.questionCount, 6)
  assert.equal(current().questionCount, 6)

  await act(refresh)
  pausePreparation = true
  const beforeStop = calls.length
  await React.act(async () => {
    container.querySelector("button")?.click()
    await enteredPreparation.promise
  })
  assert.equal(current().isGenerating, true)
  const stop = container.querySelector("button")
  assert.equal(stop?.textContent, "Stop")
  await act(() => stop?.click())
  assert.equal(preparationSignal?.aborted, true)
  assert.deepEqual(calls.slice(beforeStop), [
    "examination.prepareSubmissionSource",
  ])
  assert.equal(current().isGenerating, false)
  assert.equal(useExaminationStore.getState().preparedSubmissionSources.size, 0)
  assert.deepEqual(useToastStore.getState().toasts, [])
})
