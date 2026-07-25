import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  buildExaminationLocalIdentityContextFingerprint,
  canonicalizeExaminationLocalIdentityContext,
} from "../index.js"

describe("examination local identity", () => {
  it("canonicalizes case-insensitive identities before hashing", () => {
    const first = {
      names: ["Ada", "ada"],
      emails: ["ADA@example.test", "ada@example.test"],
      opaqueIdentifiers: ["Student-A", "student-a"],
      gitUsernames: ["AdaL", "adal"],
    }
    const reordered = {
      names: ["ada", "ADA"],
      emails: ["ada@example.test", "ADA@EXAMPLE.TEST"],
      opaqueIdentifiers: ["student-a", "Student-A"],
      gitUsernames: ["adal", "ADAL"],
    }

    assert.deepEqual(canonicalizeExaminationLocalIdentityContext(first), {
      names: ["ada"],
      emails: ["ada@example.test"],
      opaqueIdentifiers: ["Student-A", "student-a"],
      gitUsernames: ["adal"],
    })
    const fingerprint = buildExaminationLocalIdentityContextFingerprint(first)
    assert.match(fingerprint, /^[0-9a-f]{64}$/)
    assert.equal(
      fingerprint,
      buildExaminationLocalIdentityContextFingerprint(reordered),
    )
  })
})
