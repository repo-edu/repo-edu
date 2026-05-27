import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type AppError,
  buildExaminationGenerationContextFingerprint,
  EXAMINATION_PROMPT_TEMPLATE_VERSION,
  EXAMINATION_REDACTION_POLICY_VERSION,
  type ExaminationArchiveRecord,
  type ExaminationLookupQuestionsInput,
  SUBMISSION_SELECTION_MAX_FILES,
} from "@repo-edu/application-contract"
import type {
  FileSystemPort,
  LlmPort,
  LlmRunRequest,
  LlmRunResult,
  LlmStreamEvent,
  TokenizerPort,
} from "@repo-edu/host-runtime-contract"
import { createInMemoryExaminationArchive } from "../examination-workflows/archive-port.js"
import { createExaminationWorkflowHandlers } from "../examination-workflows/examination-workflows.js"

const tokenizer: TokenizerPort = {
  async loadTokenizerLanguage() {
    throw new Error("Tokenizer not available in this test.")
  },
}

const llm: LlmPort = {
  async run(_request: LlmRunRequest): Promise<LlmRunResult> {
    throw new Error("LLM is not used in this test.")
  },
  stream(_request: LlmRunRequest): AsyncIterable<LlmStreamEvent> {
    throw new Error("LLM is not used in this test.")
  },
}

function fileSystem(files: Record<string, Uint8Array>): FileSystemPort {
  return {
    userHomeSystemDirectories: [],
    inspect: async () => [],
    stat: async () => ({ kind: "directory", size: null }),
    applyBatch: async () => ({ completed: [] }),
    createTempDirectory: async () => "/tmp/repo-edu-test",
    listDirectory: async () => [],
    listFiles: async (request) =>
      Object.entries(files)
        .filter(([relativePath]) => {
          const extension = relativePath.split(".").pop() ?? ""
          return request.extensions.includes(extension)
        })
        .map(([relativePath, bytes]) => ({
          relativePath,
          size: bytes.byteLength,
        })),
    readFileInsideRoot: async (request) => {
      const bytes = files[request.relativePath]
      if (bytes === undefined) throw new Error("Missing test file.")
      return { relativePath: request.relativePath, bytes }
    },
  }
}

function handlers(files: Record<string, Uint8Array>) {
  const archive = createInMemoryExaminationArchive()
  return {
    archive,
    handlers: createExaminationWorkflowHandlers({
      llm,
      archive,
      tokenizer,
      fileSystem: fileSystem(files),
    }),
  }
}

async function assertValidationError(action: () => Promise<unknown>) {
  await assert.rejects(action, (error) => {
    assert.equal((error as AppError).type, "validation")
    return true
  })
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe("examination.prepareSubmissionSource", () => {
  it("builds a prepared submission source from selected files", async () => {
    const { handlers: workflowHandlers } = handlers({
      "src/main.ts": bytes("const answer = 42\n"),
    })

    const result = await workflowHandlers[
      "examination.prepareSubmissionSource"
    ]({
      folderPath: "/tmp/submission",
      selectedRelativePaths: ["src/main.ts"],
      configuredExtensions: ["ts"],
      attachedRosterIdentities: [
        {
          name: "Ada Lovelace",
          email: "ada@example.test",
          id: "student-abc",
          lmsUserId: null,
          studentNumber: null,
          gitUsername: "adal",
        },
      ],
    })

    assert.equal(result.personId, "submission")
    assert.equal(result.excerpts[0]?.filePath, "src/main.ts")
    assert.deepEqual(result.localIdentityContext.names, ["Ada Lovelace"])
    assert.equal(result.contentScopeId.length, 64)
  })

  it("rejects invalid UTF-8 and files over the line limit", async () => {
    const invalidUtf8 = handlers({ "src/main.ts": new Uint8Array([0xff]) })
    await assertValidationError(() =>
      invalidUtf8.handlers["examination.prepareSubmissionSource"]({
        folderPath: "/tmp/submission",
        selectedRelativePaths: ["src/main.ts"],
        configuredExtensions: ["ts"],
      }),
    )

    const longText = Array.from({ length: 20_001 }, (_, index) =>
      String(index),
    ).join("\n")
    const tooLong = handlers({ "src/main.ts": bytes(longText) })
    await assertValidationError(() =>
      tooLong.handlers["examination.prepareSubmissionSource"]({
        folderPath: "/tmp/submission",
        selectedRelativePaths: ["src/main.ts"],
        configuredExtensions: ["ts"],
      }),
    )
  })

  it("enforces selected-set limits and extension membership", async () => {
    const files = Object.fromEntries(
      Array.from({ length: SUBMISSION_SELECTION_MAX_FILES + 1 }, (_, index) => [
        `src/${index}.ts`,
        bytes("x\n"),
      ]),
    )
    const tooMany = handlers(files)
    await assertValidationError(() =>
      tooMany.handlers["examination.prepareSubmissionSource"]({
        folderPath: "/tmp/submission",
        selectedRelativePaths: Object.keys(files),
        configuredExtensions: ["ts"],
      }),
    )

    const wrongExtension = handlers({ "src/main.py": bytes("print(42)\n") })
    await assertValidationError(() =>
      wrongExtension.handlers["examination.prepareSubmissionSource"]({
        folderPath: "/tmp/submission",
        selectedRelativePaths: ["src/main.py"],
        configuredExtensions: ["ts"],
      }),
    )
  })
})

describe("examination.lookupQuestionSummaries", () => {
  it("returns current-policy summaries across generation contexts", async () => {
    const { archive, handlers: workflowHandlers } = handlers({
      "src/main.ts": bytes("const answer = 42\n"),
    })
    const lookupInput: ExaminationLookupQuestionsInput = {
      personId: "p_1",
      contentScopeId: "a".repeat(40),
      localIdentityContext: {
        names: [],
        emails: [],
        opaqueIdentifiers: [],
        gitUsernames: [],
      },
      excerpts: [
        {
          filePath: "src/main.ts",
          startLine: 1,
          lines: ["const answer = 42"],
        },
      ],
      excerptFileSources: { "src/main.ts": "const answer = 42\n" },
      questionCount: 2,
      llmSettings: {
        llmConnections: [
          {
            id: "llm-1",
            name: "Claude",
            provider: "claude",
            authMode: "subscription",
            apiKey: "",
          },
        ],
        activeLlmConnectionId: "llm-1",
        examinationModelsByProvider: { claude: "22" },
      },
    }
    const lookup =
      await workflowHandlers["examination.lookupQuestions"](lookupInput)
    const baseRecord: ExaminationArchiveRecord = {
      key: lookup.requestedKey,
      questions: [
        {
          question: "Q1?",
          answer: "A1.",
          anchor: { sourceId: "E1", lineRange: { start: 1, end: 1 } },
        },
      ],
      provenance: {
        model: "22",
        effort: "medium",
        questionCount: 2,
        usage: null,
        createdAtMs: 1,
        redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION,
        promptTemplateVersion: EXAMINATION_PROMPT_TEMPLATE_VERSION,
      },
    }
    archive.put(baseRecord)
    archive.put({
      ...baseRecord,
      key: {
        ...baseRecord.key,
        questionCount: 4,
        generationContextFingerprint:
          buildExaminationGenerationContextFingerprint({
            model: "33",
            effort: "high",
          }),
      },
      provenance: {
        ...baseRecord.provenance,
        model: "33",
        effort: "high",
        questionCount: 4,
      },
    })
    archive.put({
      ...baseRecord,
      key: { ...baseRecord.key, questionCount: 8 },
      provenance: {
        ...baseRecord.provenance,
        questionCount: 8,
        redactionPolicyVersion: 0,
      },
    })

    const summaries = await workflowHandlers[
      "examination.lookupQuestionSummaries"
    ]({
      subjects: [
        {
          subjectId: "p_1",
          personId: "p_1",
          contentScopeId: lookupInput.contentScopeId,
          localIdentityContext: lookupInput.localIdentityContext,
          excerpts: lookupInput.excerpts,
          excerptFileSources: lookupInput.excerptFileSources,
        },
      ],
    })

    assert.deepEqual(
      summaries.summaries[0]?.sets
        .map((set) => set.provenance.questionCount)
        .toSorted((left, right) => left - right),
      [2, 4],
    )
  })
})
