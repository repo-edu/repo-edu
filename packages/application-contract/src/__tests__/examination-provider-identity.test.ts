import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  assignExaminationSourceIds,
  buildExaminationProviderPayloadFingerprint,
  buildExaminationRedactedContentFingerprint,
  buildExaminationRedactionIdentityScopeId,
  compareExaminationSourceIds,
  type ExaminationProviderExcerptIdentity,
  isExaminationSourceId,
} from "../index.js"

const identity: ExaminationProviderExcerptIdentity = {
  sourceDescriptor: "TypeScript",
  tokenizerTreatment: "stripped",
  startLine: 4,
  lineCount: 2,
  redactedContentFingerprint: buildExaminationRedactedContentFingerprint([
    "const value = 1",
    "return value",
  ]),
}

describe("examination provider identity", () => {
  it("uses complete SHA-256 digests and includes the redaction version", () => {
    const first = buildExaminationProviderPayloadFingerprint([identity], {
      redactionPolicyVersion: 1,
      sourceIds: ["E1"],
    })
    const nextVersion = buildExaminationProviderPayloadFingerprint([identity], {
      redactionPolicyVersion: 2,
      sourceIds: ["E1"],
    })
    const scope = buildExaminationRedactionIdentityScopeId(
      { names: ["Ada"], emails: [], opaqueIdentifiers: [], gitUsernames: [] },
      1,
    )

    assert.match(identity.redactedContentFingerprint, /^[0-9a-f]{64}$/)
    assert.match(first, /^[0-9a-f]{64}$/)
    assert.match(scope, /^[0-9a-f]{64}$/)
    assert.notEqual(first, nextVersion)
  })

  it("owns source-id assignment, validation, and ordering", () => {
    const ids = assignExaminationSourceIds([identity, { ...identity }], {
      forbiddenSourceIds: ["E1"],
    })

    assert.deepEqual(ids, ["SRC1", "SRC1"])
    assert.equal(isExaminationSourceId("SRC1_2"), true)
    assert.equal(isExaminationSourceId("E0"), false)
    assert.deepEqual(
      ["SRC2", "E2", "SRC1_1", "E1"].toSorted(compareExaminationSourceIds),
      ["E1", "SRC1_1", "E2", "SRC2"],
    )
  })
})
