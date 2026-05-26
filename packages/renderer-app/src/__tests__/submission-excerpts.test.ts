import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { SUBMISSION_FILE_MAX_LINES } from "@repo-edu/application-contract"
import {
  buildSubmissionExcerpts,
  decodeSubmissionFileBytes,
} from "../components/tabs/examination/build-excerpts.js"

function toBase64(text: string): string {
  return btoa(text)
}

describe("submission excerpt helpers", () => {
  it("builds one whole-file excerpt and preserves trailing newlines", () => {
    const excerpts = buildSubmissionExcerpts("src/main.ts", "a\nb\n")

    assert.deepStrictEqual(excerpts, [
      {
        filePath: "src/main.ts",
        startLine: 1,
        lines: ["a", "b", ""],
      },
    ])
  })

  it("decodes base64 bytes with fatal UTF-8 validation", () => {
    const decoded = decodeSubmissionFileBytes({
      base64: toBase64("a\r\nb"),
      byteLength: 4,
    })

    assert.equal(decoded.decodedText, "a\r\nb")
    assert.equal(decoded.bytes.byteLength, 4)
    assert.throws(() =>
      decodeSubmissionFileBytes({
        base64: toBase64("abc"),
        byteLength: 99,
      }),
    )
    assert.throws(() =>
      decodeSubmissionFileBytes({
        base64: btoa(String.fromCharCode(0xff)),
        byteLength: 1,
      }),
    )
  })

  it("rejects files over the line budget", () => {
    const text = Array.from(
      { length: SUBMISSION_FILE_MAX_LINES + 1 },
      (_, index) => String(index),
    ).join("\n")

    assert.throws(() =>
      decodeSubmissionFileBytes({
        base64: toBase64(text),
        byteLength: text.length,
      }),
    )
  })
})
