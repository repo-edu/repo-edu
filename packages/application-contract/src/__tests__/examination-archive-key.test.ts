import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildExaminationGenerationContextFingerprint,
  buildSubmissionContentScopeId,
  EXAMINATION_REDACTION_POLICY_VERSION,
  isExaminationContentScopeIdShape,
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
    assert.match(serializeExaminationArchiveStorageKey(key), /archive-key-v2/)
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
})
