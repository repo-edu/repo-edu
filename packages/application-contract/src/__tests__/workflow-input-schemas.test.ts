import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  fileFormats,
  groupSetImportFormats,
  repositoryCloneDirectoryLayouts,
} from "@repo-edu/domain/types"
import type { z } from "zod"
import type {
  WorkflowId,
  WorkflowInputSchemaMap,
  WorkflowPayloads,
} from "../index.js"
import { workflowCatalog, workflowInputSchemas } from "../index.js"
import {
  course,
  questionInput,
  workflowInputs,
} from "./workflow-input-fixtures.js"

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

// Every key the payload declares, at any depth, must exist in the schema's
// input. Assignability cannot prove this: an object with an extra optional
// field still assigns to the narrower type, while a strict schema refuses it.
// A payload union member passes when one input union member holds all its
// keys; an `unknown` input position accepts any payload shape.
type MissingIn<P, I> = {
  [K in keyof P]-?: K extends keyof I ? MissingKeys<NonNullable<P[K]>, I[K]> : K
}[keyof P]
type MatchesOneMember<P, I> = I extends unknown
  ? [MissingIn<P, I>] extends [never]
    ? true
    : never
  : never
type MissingInEachMember<P, I> = I extends unknown ? MissingIn<P, I> : never
type Present<T> = T extends null | undefined ? never : T
type MissingKeys<Payload, Input> = unknown extends Input
  ? never
  : MissingKeysIn<Payload, Present<Input>>
type MissingKeysIn<Payload, Input> = Payload extends readonly (infer P)[]
  ? [Input] extends [readonly (infer I)[]]
    ? MissingKeys<P, I>
    : "array"
  : Payload extends object
    ? [Input] extends [object]
      ? true extends MatchesOneMember<Payload, Input>
        ? never
        : MissingInEachMember<Payload, Input>
      : keyof Payload
    : never

type MissingWorkflowInputKeys = {
  [K in WorkflowId]: MissingKeys<
    WorkflowPayloads[K]["input"],
    z.input<(typeof workflowInputSchemas)[K]>
  >
}[WorkflowId]

type _EveryPayloadFieldHasASchema = Assert<
  Equal<MissingWorkflowInputKeys, never>
>
// The check must catch the gap assignability misses.
type _CatchesAnOmittedOptionalField = Assert<
  Equal<MissingKeys<{ a: string; b?: number }, { a: string }>, "b">
>
type _CatchesANestedOmission = Assert<
  Equal<
    MissingKeys<{ a: { b: string; c?: string }[] }, { a: { b: string }[] }>,
    "c"
  >
>
type _AcceptsAMatchingUnionMember = Assert<
  Equal<
    MissingKeys<
      { k: "x"; x: string } | { k: "y"; y: string },
      { k: "x"; x: string } | { k: "y"; y: string }
    >,
    never
  >
>
type _CatchesAnOmissionInsideAUnionMember = Assert<
  Equal<
    [
      MissingKeys<
        { k: "x"; x: string; z?: string } | { k: "y"; y: string },
        { k: "x"; x: string } | { k: "y"; y: string }
      >,
    ] extends [never]
      ? false
      : true,
    true
  >
>

describe("runtime workflow inputs", () => {
  it("accepts every owned save-target format while keeping export choices narrow", () => {
    for (const suggestedFormat of fileFormats) {
      const target = {
        ...workflowInputs["userFile.exportPreview"],
        suggestedFormat,
      }
      assert.deepEqual(
        workflowInputSchemas["userFile.exportPreview"].parse(target),
        target,
      )
    }
    for (const [workflow, formats] of [
      ["roster.exportMembers", ["csv", "xlsx"]],
      ["groupSet.export", ["csv", "txt"]],
    ] as const) {
      for (const format of fileFormats) {
        assert.equal(
          workflowInputSchemas[workflow].safeParse({
            ...workflowInputs[workflow],
            format,
          }).success,
          (formats as readonly string[]).includes(format),
        )
      }
    }
  })

  it("accepts every owned layout in both saved courses and repository requests", () => {
    for (const directoryLayout of repositoryCloneDirectoryLayouts) {
      const saved = {
        ...course,
        repositoryCloneDirectoryLayout: directoryLayout,
      }
      assert.deepEqual(workflowInputSchemas["course.save"].parse(saved), saved)
      const input = {
        ...workflowInputs["repo.clone"],
        course: saved,
        directoryLayout,
      }
      assert.deepEqual(workflowInputSchemas["repo.clone"].parse(input), input)
      assert.deepEqual(workflowInputSchemas["repo.create"].parse(input), input)
    }
    assert.equal(
      workflowInputSchemas["repo.clone"].safeParse({
        ...workflowInputs["repo.clone"],
        directoryLayout: "unknown",
      }).success,
      false,
    )
  })

  it("accepts every owned group-set format for preview and import", () => {
    for (const workflow of [
      "groupSet.previewImportFromFile",
      "groupSet.importFromFile",
    ] as const) {
      for (const format of groupSetImportFormats) {
        const input = { ...workflowInputs[workflow], format }
        assert.deepEqual(workflowInputSchemas[workflow].parse(input), input)
      }
      assert.equal(
        workflowInputSchemas[workflow].safeParse({
          ...workflowInputs[workflow],
          format: "unknown",
        }).success,
        false,
      )
    }
  })

  it("has exactly the catalogue's 42 workflow keys", () => {
    assert.equal(Object.keys(workflowInputSchemas).length, 42)
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
