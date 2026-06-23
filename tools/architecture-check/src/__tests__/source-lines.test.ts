import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { countLinesInBuffer, isProbablyBinary } from "../source-lines.js"

describe("source line counts", () => {
  it("counts newline bytes plus a trailing partial line", () => {
    assert.equal(countLinesInBuffer(Buffer.from("")), 0)
    assert.equal(countLinesInBuffer(Buffer.from("one")), 1)
    assert.equal(countLinesInBuffer(Buffer.from("one\n")), 1)
    assert.equal(countLinesInBuffer(Buffer.from("one\ntwo")), 2)
    assert.equal(countLinesInBuffer(Buffer.from("one\ntwo\n")), 2)
  })

  it("counts binary-looking files as zero lines", () => {
    const binary = Buffer.from([65, 0, 66, 10])

    assert.equal(isProbablyBinary(binary), true)
    assert.equal(countLinesInBuffer(binary), 0)
  })
})
