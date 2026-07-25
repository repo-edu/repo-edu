import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildSubmissionContentScopeId,
  buildSubmissionFolderContentScopeId,
  isExaminationContentScopeIdShape,
} from "../index.js"

describe("examination content scopes", () => {
  it("accepts only full lowercase content identifiers", () => {
    assert.equal(isExaminationContentScopeIdShape("a".repeat(40)), true)
    assert.equal(isExaminationContentScopeIdShape("b".repeat(64)), true)
    assert.equal(
      isExaminationContentScopeIdShape("ABCDEF".padEnd(40, "a")),
      false,
    )
    assert.equal(isExaminationContentScopeIdShape("main"), false)
  })

  it("builds byte-identity submission content scopes", () => {
    const encoder = new TextEncoder()
    const lf = buildSubmissionContentScopeId(encoder.encode("line\n"))
    const crlf = buildSubmissionContentScopeId(encoder.encode("line\r\n"))

    assert.notEqual(lf, crlf)
    assert.match(lf, /^[0-9a-f]{64}$/)
  })

  it("builds order-independent folder submission content scopes", () => {
    const encoder = new TextEncoder()
    const first = buildSubmissionFolderContentScopeId([
      { relativePath: "src/a.ts", bytes: encoder.encode("a") },
      { relativePath: "src/b.ts", bytes: encoder.encode("b") },
    ])
    const reordered = buildSubmissionFolderContentScopeId([
      { relativePath: "src/b.ts", bytes: encoder.encode("b") },
      { relativePath: "src/a.ts", bytes: encoder.encode("a") },
    ])

    assert.equal(first, reordered)
  })
})
