import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { TokenizerPort } from "@repo-edu/host-runtime-contract"
import {
  assertNoRequiredRedactionLeaks,
  buildRedactionPlaceholderPlan,
  type ClassifiedSourceSpan,
  redactExaminationSource,
  scanExaminationOutputForLeaks,
} from "../examination-workflows/redaction.js"
import { stripCommentsForExcerpt } from "../examination-workflows/strip-comments.js"

const redactionPolicyVersion = 1

const identityContext = {
  names: ["Ada Lovelace", "Will"],
  emails: [],
  opaqueIdentifiers: [],
  gitUsernames: [],
}

function allCode(lines: readonly string[]): ClassifiedSourceSpan[] {
  const text = lines.join("\n")
  return text.length === 0 ? [] : [{ start: 0, end: text.length, kind: "code" }]
}

describe("examination redaction", () => {
  it("keeps placeholders stable across excerpts in one generation", () => {
    const firstLines = ['const owner = "Ada Lovelace"']
    const secondLines = ['throw new Error("Ada Lovelace")']
    const firstSpans = allCode(firstLines)
    const secondSpans = allCode(secondLines)
    const placeholderPlan = buildRedactionPlaceholderPlan({
      sources: [
        { lines: firstLines, spans: firstSpans },
        { lines: secondLines, spans: secondSpans },
      ],
      localIdentityContext: identityContext,
    })

    const first = redactExaminationSource({
      lines: firstLines,
      spans: firstSpans,
      localIdentityContext: identityContext,
      redactionPolicyVersion,
      placeholderPlan,
    })
    const second = redactExaminationSource({
      lines: secondLines,
      spans: secondSpans,
      localIdentityContext: identityContext,
      redactionPolicyVersion,
      placeholderPlan,
    })

    assert.match(first.lines.join("\n"), /<redacted-name-1>/)
    assert.match(second.lines.join("\n"), /<redacted-name-1>/)
  })

  it("does not fail the prompt assertion for allowed stoplisted code names", () => {
    const lines = ["const Will = 1", 'const label = "Made by Will"']
    const text = lines.join("\n")
    const stringStart = text.indexOf('"Made by Will"')
    const stringEnd = stringStart + '"Made by Will"'.length
    const spans: ClassifiedSourceSpan[] = [
      { start: 0, end: stringStart, kind: "code" },
      { start: stringStart, end: stringEnd, kind: "string-literal" },
      { start: stringEnd, end: text.length, kind: "code" },
    ]

    const redacted = redactExaminationSource({
      lines,
      spans,
      localIdentityContext: identityContext,
      redactionPolicyVersion,
    })
    const renderedPrompt = redacted.lines.join("\n")

    assert.match(renderedPrompt, /const Will = 1/)
    assert.doesNotMatch(renderedPrompt, /Made by Will/)
    assert.doesNotThrow(() =>
      assertNoRequiredRedactionLeaks({
        renderedPrompt,
        requiredChecks: redacted.report.requiredChecks,
      }),
    )
  })

  it("redacts known local email literals even when they are not email-shaped", () => {
    const context = {
      ...identityContext,
      emails: ["ADA@LOCALHOST"],
    }
    const lines = ['const owner = "ada@localhost"']
    const redacted = redactExaminationSource({
      lines,
      spans: allCode(lines),
      localIdentityContext: context,
      redactionPolicyVersion,
    })
    const renderedPrompt = redacted.lines.join("\n")

    assert.match(renderedPrompt, /<redacted-email-1>/)
    assert.doesNotMatch(renderedPrompt, /ada@localhost/i)
    assert.doesNotThrow(() =>
      assertNoRequiredRedactionLeaks({
        renderedPrompt,
        requiredChecks: redacted.report.requiredChecks,
      }),
    )
  })

  it("blocks provider output that echoes a known local email literal", () => {
    const result = scanExaminationOutputForLeaks({
      questions: [
        {
          question: "Why?",
          answer: "Ask ada@localhost about the invariant.",
          anchor: { sourceId: null, lineRange: null },
        },
      ],
      localIdentityContext: {
        ...identityContext,
        emails: ["ADA@LOCALHOST"],
      },
    })

    assert.deepEqual(result, { ok: false, reason: "email" })
  })

  it("propagates tokenizer runtime failures for supported sources", async () => {
    const tokenizer: TokenizerPort = {
      async loadTokenizerLanguage() {
        throw new Error("tokenizer unavailable")
      },
    }

    await assert.rejects(
      () =>
        stripCommentsForExcerpt({
          excerpt: {
            filePath: "src/example.ts",
            startLine: 1,
            lines: ["// comment"],
          },
          fileSource: "// comment",
          tokenizer,
        }),
      /tokenizer unavailable/,
    )
  })
})
