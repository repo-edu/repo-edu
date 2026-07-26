import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { TokenizerPort } from "@repo-edu/host-runtime-contract"
import { stripCommentsForExcerpt } from "../examination-workflows/strip-comments.js"

describe("examination comment stripping", () => {
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

  it("falls back when excerpt text does not match the full source window", async () => {
    let loadCount = 0
    const tokenizer: TokenizerPort = {
      async loadTokenizerLanguage() {
        loadCount += 1
        throw new Error("tokenizer should not load")
      },
    }

    const result = await stripCommentsForExcerpt({
      excerpt: {
        filePath: "src/example.ts",
        startLine: 2,
        lines: ["const value = 1"],
      },
      fileSource: "const other = 0\n// stale comment line",
      tokenizer,
    })

    assert.equal(loadCount, 0)
    assert.deepEqual(result, {
      lines: ["const value = 1"],
      spans: [{ start: 0, end: "const value = 1".length, kind: "code" }],
      tokenizerTreatment: "fallback",
    })
  })
})
