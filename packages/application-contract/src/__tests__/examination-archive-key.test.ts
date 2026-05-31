import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildExaminationGenerationContextFingerprint,
  buildSubmissionContentScopeId,
  buildSubmissionFolderContentScopeId,
  EXAMINATION_REDACTION_POLICY_VERSION,
  isExaminationContentScopeIdShape,
  parseExaminationArchiveStorageKey,
  serializeExaminationArchiveStorageKey,
  validateExaminationArchiveKey,
} from "../index.js"

const sha1 = "a".repeat(40)

describe("examination archive key helpers", () => {
  it("accepts only full lowercase content scope identifiers", () => {
    assert.equal(isExaminationContentScopeIdShape(sha1), true)
    assert.equal(isExaminationContentScopeIdShape("b".repeat(64)), true)
    assert.equal(
      isExaminationContentScopeIdShape("ABCDEF".padEnd(40, "a")),
      false,
    )
    assert.equal(isExaminationContentScopeIdShape("main"), false)
    assert.equal(isExaminationContentScopeIdShape("abc123"), false)
  })

  it("validates pathless archive keys", () => {
    const key = {
      personId: "p1",
      contentScopeId: sha1,
      questionCount: 4,
      providerPayloadFingerprint: "abcd1234",
      generationContextFingerprint: "efgh5678",
    }

    assert.deepEqual(validateExaminationArchiveKey(key), key)
    assert.equal(
      validateExaminationArchiveKey({ ...key, repositoryKey: "/repo" }),
      null,
    )
    assert.equal(
      validateExaminationArchiveKey({ ...key, contentScopeId: "fixture-1" }),
      null,
    )
    const storageKey = serializeExaminationArchiveStorageKey(key)
    assert.match(storageKey, /archive-key-v2/)
    assert.deepEqual(parseExaminationArchiveStorageKey(storageKey), key)
    assert.equal(parseExaminationArchiveStorageKey("not json"), null)
  })

  it("folds redaction policy version into generation context fingerprints", () => {
    const current = buildExaminationGenerationContextFingerprint({
      model: "22",
      effort: "medium",
    })
    const different = buildExaminationGenerationContextFingerprint({
      model: "22",
      effort: "medium",
      redactionPolicyVersion: EXAMINATION_REDACTION_POLICY_VERSION + 1,
    })

    assert.notEqual(current, different)
  })

  it("builds byte-identity submission content scopes", () => {
    const encoder = new TextEncoder()
    const lf = buildSubmissionContentScopeId(encoder.encode("line\n"))
    const crlf = buildSubmissionContentScopeId(encoder.encode("line\r\n"))
    const repeated = buildSubmissionContentScopeId(encoder.encode("line\n"))

    assert.equal(lf, repeated)
    assert.notEqual(lf, crlf)
    assert.equal(isExaminationContentScopeIdShape(lf), true)
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
    const renamed = buildSubmissionFolderContentScopeId([
      { relativePath: "src/a.ts", bytes: encoder.encode("a") },
      { relativePath: "src/c.ts", bytes: encoder.encode("b") },
    ])

    assert.equal(first, reordered)
    assert.notEqual(first, renamed)
    assert.equal(isExaminationContentScopeIdShape(first), true)
  })
})
