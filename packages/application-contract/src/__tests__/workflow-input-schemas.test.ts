import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { WorkflowId, WorkflowInputSchemaMap } from "../index.js"
import { workflowCatalog, workflowInputSchemas } from "../index.js"
import {
  course,
  questionInput,
  workflowInputs,
} from "./workflow-input-fixtures.js"

describe("runtime workflow inputs", () => {
  it("has exactly the catalogue's 43 workflow keys", () => {
    assert.equal(Object.keys(workflowInputSchemas).length, 43)
    assert.deepEqual(
      Object.keys(workflowInputSchemas).sort(),
      Object.keys(workflowCatalog).sort(),
    )
  })

  for (const id of Object.keys(workflowInputs) as WorkflowId[]) {
    it(`${id} accepts its full input without dropping declared fields`, () => {
      const input = workflowInputs[id]
      assert.deepEqual(workflowInputSchemas[id].parse(input), input)
    })
    it(`${id} rejects a malformed input before dispatch`, () => {
      assert.equal(workflowInputSchemas[id].safeParse(null).success, false)
      assert.equal(
        workflowInputSchemas[id].safeParse({ invalid: true }).success,
        false,
      )
    })
  }

  it("rejects missing and extra map entries at compilation", () => {
    const { "course.list": omitted, ...missing } = workflowInputSchemas
    void omitted
    // @ts-expect-error Every workflow needs a schema.
    const missingMap: WorkflowInputSchemaMap = missing
    const extraMap: WorkflowInputSchemaMap = {
      ...workflowInputSchemas,
      // @ts-expect-error Unknown workflows cannot enter the contract.
      "course.unknown": workflowInputSchemas["course.list"],
    }
    void missingMap
    void extraMap
  })

  it("checks nested course and settings values through their concept owners", () => {
    assert.equal(
      workflowInputSchemas["course.save"].safeParse({ ...course, revision: -1 })
        .success,
      false,
    )
    assert.equal(
      workflowInputSchemas["roster.importFromFile"].safeParse({
        ...workflowInputs["roster.importFromFile"],
        course: { ...course, lmsCourseId: "foreign" },
      }).success,
      false,
    )
    assert.equal(
      workflowInputSchemas["settings.saveCredentials"].safeParse({
        ...workflowInputs["settings.saveCredentials"],
        llmConnections: [{ provider: "unknown" }],
      }).success,
      false,
    )
  })

  it("preserves the analysis repository union and identity Map", () => {
    const schema = workflowInputSchemas["analysis.blame"]
    const input = workflowInputs["analysis.blame"]
    assert.equal(
      schema.safeParse({ ...input, repositoryRelativePath: "lab-1" }).success,
      false,
    )
    assert.equal(schema.safeParse({ ...input, course }).success, false)
    assert.equal(
      schema.safeParse({
        ...input,
        personDbBaseline: { persons: [], identityIndex: {} },
      }).success,
      false,
    )
    assert.equal(
      schema.safeParse({
        ...input,
        personDbBaseline: { persons: [], identityIndex: new Map([[1, "p1"]]) },
      }).success,
      false,
    )
    assert.equal(
      schema.safeParse({ ...input, config: { since: "2026-09-06" } }).success,
      false,
    )
    assert.equal(
      schema.safeParse({ ...input, repositoryAbsolutePath: undefined }).success,
      false,
    )
  })

  it("validates both repository sources and analysis normalisation", () => {
    const parsed = workflowInputSchemas["analysis.run"].parse({
      repositoryRelativePath: "lab-1",
      course: { repositoryCloneTargetDirectory: "/courses" },
      snapshotCommitOid: "head",
      config: { extensions: [".TS", "ts"], maxConcurrency: 2 },
      analysisSource: { kind: "folder" },
    })
    assert.deepEqual(parsed.config.extensions, ["ts"])
    assert.equal(
      workflowInputSchemas["analysis.run"].safeParse({
        ...workflowInputs["analysis.run"],
        config: { since: "2026-09-07", until: "2026-09-06" },
      }).success,
      false,
    )
  })

  it("rejects unsupported file and connection variants", () => {
    assert.equal(
      workflowInputSchemas["examination.archive.import"].safeParse(
        workflowInputs["examination.archive.export"],
      ).success,
      false,
    )
    const schema = workflowInputSchemas["connection.verifyLlmDraft"]
    assert.equal(
      schema.safeParse({
        provider: "unknown",
        authMode: "api",
        apiKey: "draft",
      }).success,
      false,
    )
    assert.equal(
      schema.safeParse({ provider: "claude", authMode: "api", apiKey: "draft" })
        .success,
      false,
    )
    assert.equal(
      schema.safeParse({
        provider: "codex",
        authMode: "subscription",
        apiKey: "",
      }).success,
      true,
    )
    assert.equal(
      schema.safeParse({
        provider: "claude",
        authMode: "subscription",
        apiKey: "",
      }).success,
      true,
    )
    assert.equal(
      schema.safeParse({
        provider: "codex",
        authMode: "api",
        apiKey: "draft",
        unexpected: true,
      }).success,
      false,
    )
  })

  it("validates examination bounds and nested question anchors", () => {
    const lookup = workflowInputSchemas["examination.lookupQuestions"]
    for (const questionCount of [0, 21, 1.5]) {
      assert.equal(
        lookup.safeParse({ ...questionInput, questionCount }).success,
        false,
      )
    }
    assert.equal(
      lookup.safeParse({
        ...questionInput,
        excerpts: [{ filePath: "main.ts", startLine: "one", lines: [] }],
      }).success,
      false,
    )
    assert.equal(
      workflowInputSchemas["examination.generateQuestions"].safeParse({
        ...workflowInputs["examination.generateQuestions"],
        seedQuestions: [
          {
            question: "Why?",
            answer: "Because.",
            anchor: { sourceId: null, lineRange: { start: 2, end: 1 } },
          },
        ],
      }).success,
      false,
    )
  })
})
