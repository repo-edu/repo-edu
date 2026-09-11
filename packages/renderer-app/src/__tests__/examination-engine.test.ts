import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import {
  type ExaminationGenerateQuestionsInput,
  type ExaminationGenerateQuestionsResult,
  type ExaminationLookupQuestionsResult,
  serializeExaminationArchiveStorageKey,
} from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { jsx } from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { toAvailableArchiveEntry } from "../components/tabs/examination/archive-entries.js"
import {
  buildArchiveKeyIdentityKey,
  buildSourceSessionKey,
  buildSourceSummaryKey,
  buildSubmissionSourceIdentity,
  type SubmissionExaminationSource,
} from "../components/tabs/examination/source.js"
import {
  type ExaminationEngineViewModel,
  useExaminationEngine,
} from "../components/tabs/examination/use-examination-engine.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { SessionControllerProvider } from "../session/session-controller-context.js"
import { useExaminationStore } from "../stores/examination-store.js"
import { useToastStore } from "../stores/toast-store.js"
import {
  deferred,
  makeSettings,
  resetStores,
  startController,
  workflowClient,
} from "./session-controller.test-support.js"

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
const identity = buildSubmissionSourceIdentity({
  source,
  questionCount: 4,
  model: "22",
  effort: "medium",
})
const sourceSessionKey = buildSourceSessionKey(identity, null)
const sourceSummaryKey = buildSourceSummaryKey(source, null)

function questionSet(count: number): ExaminationGenerateQuestionsResult {
  return {
    key: {
      personId: source.subject.id,
      contentScopeId: source.contentScopeId,
      questionCount: count,
      providerPayloadFingerprint: "b".repeat(64),
      generationContextFingerprint: "c".repeat(64),
    },
    questions: Array.from({ length: count }, (_, index) => ({
      question: `Question ${index + 1}?`,
      answer: `Answer ${index + 1}.`,
      anchor: { sourceId: "E1", lineRange: { start: 1, end: 1 } },
    })),
    usage: null,
    fromArchive: true,
    requestedQuestionCount: count,
    archivedProvenance: {
      model: identity.model,
      effort: identity.effort,
      questionCount: count,
      usage: null,
      createdAtMs: 0,
      redactionPolicyVersion: 1,
      promptTemplateVersion: 1,
    },
    sourceReferences: [
      {
        sourceId: "E1",
        occurrences: [{ filePath: "main.ts", lineRange: { start: 1, end: 1 } }],
      },
    ],
  }
}

async function harness(
  run: Parameters<typeof workflowClient>[0],
  host: Pick<RendererHost, "pickUserFile" | "pickSaveTarget"> = {
    pickUserFile: async () => null,
    pickSaveTarget: async () => null,
  },
) {
  const controller = startController({
    workflowClient: workflowClient(async (id, input) => {
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
      return run(id, input)
    }),
  })
  await controller.waitForIdle()
  useExaminationStore.getState().activateSource({
    sourceSessionKey,
    sourceSummaryKey,
    sourceIdentity: identity,
    subjectIds: [source.subject.id],
    selectedSubjectId: source.subject.id,
    defaultPreferences: {
      questionCount: 4,
      activeConnectionId: "claude",
      modelCode: "22",
      effort: "medium",
    },
  })
  let view: ExaminationEngineViewModel | undefined
  function Probe() {
    view = useExaminationEngine({ source, emptyBlocker: null })
    return null
  }
  // Keep the commands from this render while a lookup publishes later.
  renderToStaticMarkup(
    jsx(SessionControllerProvider, {
      controller,
      children: jsx(WorkflowClientProvider, {
        value: controller.operations,
        children: jsx(RendererHostProvider, {
          value: host as RendererHost,
          children: jsx(Probe, {}),
        }),
      }),
    }),
  )
  assert.ok(view)
  return { controller, commands: view.commands }
}

beforeEach(() => {
  resetStores()
  useExaminationStore.getState().reset()
})

describe("examination engine", () => {
  for (const action of ["generate", "regenerate"] as const) {
    it(`builds the ${action} generation command after a paused archive publication`, async (t) => {
      const entered = deferred<void>()
      const lookup = deferred<ExaminationLookupQuestionsResult>()
      const archived = questionSet(4)
      const generated = questionSet(action === "generate" ? 8 : 4)
      const inputs: ExaminationGenerateQuestionsInput[] = []
      const { controller, commands } = await harness(async (id, input) => {
        if (id === "examination.lookupQuestions") {
          entered.resolve()
          return lookup.promise
        }
        assert.equal(id, "examination.generateQuestions")
        inputs.push(input as ExaminationGenerateQuestionsInput)
        return generated
      })
      t.after(() => controller.dispose())
      const publication = controller.operations.execute(
        "examination.lookupQuestions",
        async (scope) => {
          const started = useExaminationStore
            .getState()
            .startLookup(sourceSessionKey)
          assert.ok(started)
          const result = await scope.run("examination.lookupQuestions", {
            personId: source.subject.id,
            contentScopeId: source.contentScopeId,
            localIdentityContext: source.localIdentityContext,
            excerpts: source.subject.excerpts,
            excerptFileSources: source.subject.excerptFileSources,
            questionCount: 4,
            llmSettings: {
              llmConnections: [],
              activeLlmConnectionId: null,
              examinationModelsByProvider: {},
            },
          })
          assert.ok(result.exact)
          const entry = toAvailableArchiveEntry(result.exact)
          scope.publish(() =>
            useExaminationStore.getState().applyLookupResult({
              sourceSessionKey,
              ...started,
              archiveKeyIdentityKey: buildArchiveKeyIdentityKey(identity, null),
              requestedIdentity: identity,
              resolvedIdentity: identity,
              entryKey: entry.key,
              exactEntry: entry.entry,
              archiveEntries: [entry],
            }),
          )
        },
      )
      await entered.promise
      commands[action]()
      assert.equal(inputs.length, 0)
      lookup.resolve({
        requestedKey: archived.key,
        exact: archived,
        availableSets: [archived],
        sourceReferences: archived.sourceReferences,
      })
      await publication
      await controller.waitForIdle()
      assert.equal(inputs.length, 1)
      assert.deepEqual(
        inputs[0]?.seedQuestions ?? [],
        action === "generate" ? archived.questions : [],
      )
      assert.equal(inputs[0]?.questionCount, generated.questions.length)
      assert.equal(
        inputs[0]?.regenerate,
        action === "regenerate" ? true : undefined,
      )
      const state = useExaminationStore.getState()
      assert.deepEqual(
        state.entriesByKey.get(
          serializeExaminationArchiveStorageKey(generated.key),
        )?.questions,
        generated.questions,
      )
      assert.equal(
        state.sourceSessions.get(sourceSessionKey)?.pendingGenerationRequestId,
        null,
      )
    })
  }

  for (const action of ["importArchive", "exportArchive"] as const) {
    for (const outcome of ["failure", "empty-error", "cancel"] as const) {
      it(`handles ${action} picker ${outcome} inside the command`, async (t) => {
        const pick = async () => {
          if (outcome === "failure") throw new Error("Picker unavailable")
          if (outcome === "empty-error") throw new Error("")
          return null
        }
        let calls = 0
        const { controller, commands } = await harness(
          async () => {
            calls++
          },
          { pickUserFile: pick, pickSaveTarget: pick },
        )
        t.after(() => controller.dispose())
        commands[action]()
        await controller.waitForIdle()
        assert.equal(calls, 0)
        const toasts = useToastStore.getState().toasts
        assert.deepEqual(
          toasts.map(({ message, tone }) => ({ message, tone })),
          outcome === "cancel"
            ? []
            : [
                {
                  message: `${action === "importArchive" ? "Import" : "Export"} failed: ${outcome === "empty-error" ? "An unexpected error occurred." : "Picker unavailable"}`,
                  tone: "error",
                },
              ],
        )
        assert.equal(controller.getSnapshot().transactions.admitted.size, 0)
      })
    }
  }

  it("gives generation failures with an empty message a readable reason", async (t) => {
    const { controller, commands } = await harness(async (id) => {
      assert.equal(id, "examination.generateQuestions")
      throw new Error("")
    })
    t.after(() => controller.dispose())

    commands.generate()
    await controller.waitForIdle()

    const state = useExaminationStore.getState()
    const session = state.sourceSessions.get(sourceSessionKey)
    assert.ok(session)
    assert.equal(session.pendingGenerationRequestId, null)
    assert.deepEqual(
      [...state.entriesByKey.values()].map((entry) => entry.errorMessage),
      ["An unexpected error occurred."],
    )
  })
})
