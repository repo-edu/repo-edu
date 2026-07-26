import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ExaminationArchiveRecord } from "@repo-edu/application-contract"
import {
  admitExaminationQuestions,
  admitExaminationRecord,
  admitExaminationRecordWithoutContext,
  assertExaminationPromptPrivacy,
  type ClassifiedSourceSpan,
  prepareExaminationPrivacy,
} from "../examination-workflows/privacy-policy.js"

const identityContext = {
  names: ["Ada Lovelace", "Will"],
  emails: ["ADA@LOCALHOST"],
  opaqueIdentifiers: ["Student-A"],
  gitUsernames: ["AdaGit"],
}

function spansFor(lines: readonly string[]): ClassifiedSourceSpan[] {
  const text = lines.join("\n")
  const stringStart = text.indexOf('"Made by Will"')
  if (stringStart < 0) {
    return text.length === 0
      ? []
      : [{ start: 0, end: text.length, kind: "code" }]
  }
  const stringEnd = stringStart + '"Made by Will"'.length
  return [
    { start: 0, end: stringStart, kind: "code" },
    { start: stringStart, end: stringEnd, kind: "string-literal" },
    { start: stringEnd, end: text.length, kind: "code" },
  ]
}

function prepare(params?: {
  lines?: string[]
  sourceDescriptor?: string
  names?: string[]
}) {
  const lines = params?.lines ?? ['const owner = "Ada Lovelace"']
  return prepareExaminationPrivacy({
    sources: [
      {
        lines,
        spans: spansFor(lines),
        sourceDescriptor: params?.sourceDescriptor ?? "TypeScript",
      },
    ],
    localIdentityContext: {
      ...identityContext,
      names: params?.names ?? identityContext.names,
    },
  })
}

function record(
  version: number,
  answer = "The invariant is explicit.",
): ExaminationArchiveRecord {
  return {
    key: {
      personId: "p_1",
      contentScopeId: "scope",
      questionCount: 1,
      providerPayloadFingerprint: "payload",
      generationContextFingerprint: "generation",
    },
    questions: [
      {
        question: "Why?",
        answer,
        anchor: { sourceId: null, lineRange: null },
      },
    ],
    provenance: {
      model: "model",
      effort: "medium",
      questionCount: 1,
      usage: null,
      createdAtMs: 1,
      redactionPolicyVersion: version,
      promptTemplateVersion: 1,
    },
  }
}

describe("examination privacy policy", () => {
  it("prepares the complete source set with stable placeholders", () => {
    const first = ['const owner = "Ada Lovelace"']
    const second = ['throw new Error("Ada Lovelace")']
    const prepared = prepareExaminationPrivacy({
      sources: [first, second].map((lines) => ({
        lines,
        spans: spansFor(lines),
        sourceDescriptor: "TypeScript",
      })),
      localIdentityContext: identityContext,
    })

    assert.match(
      prepared.sources[0]?.lines.join("\n") ?? "",
      /<redacted-name-1>/,
    )
    assert.match(
      prepared.sources[1]?.lines.join("\n") ?? "",
      /<redacted-name-1>/,
    )
    assert.equal(prepared.context.redactionPolicyVersion, 4)
    assert.ok(Object.isFrozen(prepared.context))
  })

  it("copies caller-owned identity and source collections", () => {
    const names = ["Ada Lovelace"]
    const lines = ['const owner = "Ada Lovelace"']
    const prepared = prepare({ lines, names })
    names[0] = "Grace Hopper"
    lines[0] = 'const owner = "Grace Hopper"'

    assert.deepEqual(
      admitExaminationQuestions({
        questions: [
          {
            question: "Who?",
            answer: "Ada Lovelace",
            anchor: { sourceId: null, lineRange: null },
          },
        ],
        context: prepared.context,
      }),
      { ok: false, reason: "known-identifier" },
    )
  })

  it("allows canonical source descriptors but rejects other identities", () => {
    const prepared = prepare({
      sourceDescriptor: " Ruby ",
      names: ["Ruby", "Ada"],
    })
    assert.deepEqual(
      admitExaminationQuestions({
        questions: [
          {
            question: "Why use Ruby?",
            answer: "Ruby names the source language.",
            anchor: { sourceId: null, lineRange: null },
          },
        ],
        context: prepared.context,
      }),
      { ok: true },
    )
    assert.deepEqual(
      admitExaminationQuestions({
        questions: [
          {
            question: "Who?",
            answer: "Ada owns it.",
            anchor: { sourceId: null, lineRange: null },
          },
        ],
        context: prepared.context,
      }),
      { ok: false, reason: "known-identifier" },
    )
  })

  it("rejects a known local email literal that is not email-shaped", () => {
    const prepared = prepare()
    assert.deepEqual(
      admitExaminationQuestions({
        questions: [
          {
            question: "Who?",
            answer: "Ask ada@localhost.",
            anchor: { sourceId: null, lineRange: null },
          },
        ],
        context: prepared.context,
      }),
      { ok: false, reason: "email" },
    )
  })

  it("uses context required checks for prompt admission", () => {
    const lines = ["const Will = 1", 'const label = "Made by Will"']
    const prepared = prepare({ lines })
    assert.doesNotThrow(() =>
      assertExaminationPromptPrivacy({
        renderedPrompt: prepared.sources[0]?.lines.join("\n") ?? "",
        context: prepared.context,
      }),
    )
    assert.throws(
      () =>
        assertExaminationPromptPrivacy({
          renderedPrompt: lines.join("\n"),
          context: prepared.context,
        }),
      /name remained/,
    )
  })

  it("composes record version and context-aware admission", () => {
    const prepared = prepare()
    assert.deepEqual(
      admitExaminationRecord({
        record: record(prepared.context.redactionPolicyVersion - 1),
        context: prepared.context,
      }),
      { ok: false, reason: "redaction-policy-version" },
    )
    assert.deepEqual(
      admitExaminationRecord({
        record: record(prepared.context.redactionPolicyVersion, "Ada Lovelace"),
        context: prepared.context,
      }),
      { ok: false, reason: "known-identifier" },
    )
  })

  it("uses context-free email, secret, and version admission for imports", () => {
    const prepared = prepare()
    const version = prepared.context.redactionPolicyVersion
    assert.deepEqual(admitExaminationRecordWithoutContext(record(version)), {
      ok: true,
    })
    assert.deepEqual(
      admitExaminationRecordWithoutContext(record(version - 1)),
      { ok: false, reason: "redaction-policy-version" },
    )
    assert.deepEqual(
      admitExaminationRecordWithoutContext(
        record(version, "student@example.com"),
      ),
      { ok: false, reason: "email" },
    )
    assert.deepEqual(
      admitExaminationRecordWithoutContext(
        record(version, `ghs_${"a".repeat(36)}`),
      ),
      { ok: false, reason: "secret" },
    )
  })
})
