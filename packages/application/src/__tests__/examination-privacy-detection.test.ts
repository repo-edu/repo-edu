import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  admitExaminationQuestions,
  type ClassifiedSourceSpan,
  prepareExaminationPrivacy,
} from "../examination-workflows/privacy-policy.js"

const emptyIdentityContext = {
  names: [],
  emails: [],
  opaqueIdentifiers: [],
  gitUsernames: [],
}

function allCode(lines: readonly string[]): ClassifiedSourceSpan[] {
  const text = lines.join("\n")
  return text.length === 0 ? [] : [{ start: 0, end: text.length, kind: "code" }]
}

function prepare(lines: readonly string[]) {
  return prepareExaminationPrivacy({
    sources: [
      {
        lines,
        spans: allCode(lines),
        sourceDescriptor: "TypeScript",
      },
    ],
    localIdentityContext: emptyIdentityContext,
  })
}

describe("examination privacy detection", () => {
  it("uses Linkify-it for Unicode domains and URL authentication", () => {
    const prepared = prepare([
      'const first = "student@bücher.example"',
      'const second = "https://student@example.com@host.test/path"',
    ])
    const text = prepared.sources[0]?.lines.join("\n") ?? ""

    assert.doesNotMatch(text, /student@bücher\.example/)
    assert.doesNotMatch(text, /student@example\.com/)
    assert.equal(prepared.sources[0]?.report.residualScan.emails, 0)
  })

  it("honours the email local-part length boundary", () => {
    const accepted = `${"a".repeat(64)}@example.com`
    const rejected = `${"a".repeat(65)}@example.com`
    const prepared = prepare([accepted, rejected])

    assert.match(prepared.sources[0]?.lines[0] ?? "", /<redacted-email-1>/)
    assert.equal(prepared.sources[0]?.lines[1], rejected)
  })

  it("does not classify an adversarial near miss as an email", () => {
    const nearMiss = `${"a".repeat(20_000)}@-invalid-.example`
    const prepared = prepare([nearMiss])

    assert.equal(prepared.sources[0]?.lines[0], nearMiss)
  })

  it("redacts every supported GitHub token family", () => {
    const suffix = "a".repeat(36)
    const fineGrained = `github_pat_${"b".repeat(82)}`
    const tokens = ["ghp", "gho", "ghu", "ghs", "ghr"].map(
      (prefix) => `${prefix}_${suffix}`,
    )
    const prepared = prepare([...tokens, fineGrained])
    const text = prepared.sources[0]?.lines.join("\n") ?? ""

    for (const token of [...tokens, fineGrained]) {
      assert.doesNotMatch(text, new RegExp(token))
    }
    assert.deepEqual(prepared.sources[0]?.report.replacementClasses, ["secret"])
  })

  it("gives secret detection precedence over an overlapping identifier", () => {
    const token = `ghp_${"a".repeat(36)}`
    const prepared = prepareExaminationPrivacy({
      sources: [
        {
          lines: [token],
          spans: allCode([token]),
          sourceDescriptor: "TypeScript",
        },
      ],
      localIdentityContext: {
        ...emptyIdentityContext,
        opaqueIdentifiers: [token],
      },
    })

    assert.deepEqual(prepared.sources[0]?.report.replacementClasses, ["secret"])
  })

  it("reports secrets in provider output separately from identifiers", () => {
    const prepared = prepare(["const value = 1"])
    const result = admitExaminationQuestions({
      questions: [
        {
          question: "Why?",
          answer: `Use gho_${"a".repeat(36)} here.`,
          anchor: { sourceId: null, lineRange: null },
        },
      ],
      context: prepared.context,
    })

    assert.deepEqual(result, { ok: false, reason: "secret" })
  })
})
