import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildExaminationGenerationContextFingerprint,
  EXAMINATION_QUESTION_COUNT_MAX,
  EXAMINATION_QUESTION_COUNT_MIN,
  parseExaminationArchiveStorageKey,
  serializeExaminationArchiveStorageKey,
  validateExaminationArchiveKey,
} from "../index.js"

const contentScopeId = "a".repeat(40)
const providerPayloadFingerprint = "b".repeat(64)
const generationContext = {
  model: "22",
  effort: "medium" as const,
  promptTemplateVersion: 2,
  redactionPolicyVersion: 1,
}

describe("examination archive key helpers", () => {
  it("validates and round-trips pathless SHA-256 archive keys", () => {
    const key = {
      personId: "p1",
      contentScopeId,
      questionCount: 4,
      providerPayloadFingerprint,
      generationContextFingerprint:
        buildExaminationGenerationContextFingerprint(generationContext),
    }

    assert.deepEqual(validateExaminationArchiveKey(key), key)
    assert.equal(
      validateExaminationArchiveKey({ ...key, repositoryKey: "/repo" }),
      null,
    )
    assert.equal(
      validateExaminationArchiveKey({
        ...key,
        providerPayloadFingerprint: "short",
      }),
      null,
    )
    assert.equal(
      validateExaminationArchiveKey({
        ...key,
        questionCount: EXAMINATION_QUESTION_COUNT_MIN - 1,
      }),
      null,
    )
    assert.equal(
      validateExaminationArchiveKey({
        ...key,
        questionCount: EXAMINATION_QUESTION_COUNT_MAX + 1,
      }),
      null,
    )
    const storageKey = serializeExaminationArchiveStorageKey(key)
    assert.match(storageKey, /archive-key-v3/)
    assert.deepEqual(parseExaminationArchiveStorageKey(storageKey), key)
    assert.equal(parseExaminationArchiveStorageKey("not json"), null)
  })

  it("requires both rule versions in generation context fingerprints", () => {
    const current =
      buildExaminationGenerationContextFingerprint(generationContext)
    const different = buildExaminationGenerationContextFingerprint({
      ...generationContext,
      redactionPolicyVersion: generationContext.redactionPolicyVersion + 1,
    })

    assert.match(current, /^[0-9a-f]{64}$/)
    assert.notEqual(current, different)
  })
})
