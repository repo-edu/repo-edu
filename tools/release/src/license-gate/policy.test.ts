import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { classifyLicenseExpression } from "./policy.js"

describe("license policy", () => {
  it("allows explicit permissive and weak-copyleft SPDX expressions", () => {
    assert.equal(classifyLicenseExpression("MIT").ok, true)
    assert.equal(classifyLicenseExpression("LGPL-2.1-only").ok, true)
    assert.equal(classifyLicenseExpression("MIT OR GPL-3.0-only").ok, true)
    assert.equal(
      classifyLicenseExpression("BSD-3-Clause WITH PCRE2-exception").ok,
      true,
    )

    const strongCopyleft = classifyLicenseExpression("MIT AND GPL-3.0-only")
    assert.equal(strongCopyleft.ok, false)
    assert.match(strongCopyleft.reason, /GPL-3\.0-only/)

    const unconfiguredException = classifyLicenseExpression(
      "MIT WITH LLVM-exception",
    )
    assert.equal(unconfiguredException.ok, false)
    assert.match(unconfiguredException.reason, /does not satisfy/)

    const invalid = classifyLicenseExpression("MIT OR Not-A-License")
    assert.equal(invalid.ok, false)
    assert.match(invalid.reason, /invalid SPDX/)

    const unknown = classifyLicenseExpression("SEE LICENSE IN LICENSE.md")
    assert.equal(unknown.ok, false)
    assert.match(unknown.reason, /unknown|non-redistributable/)
  })
})
