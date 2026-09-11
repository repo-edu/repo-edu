import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { type AnalysisInputs, admitAnalysisInputs } from "../analysis-inputs.js"

describe("analysis input admission", () => {
  it("admits a valid patch as the normalised next inputs", () => {
    const result = admitAnalysisInputs(
      { since: "2026-01-01", excludeFiles: [" a ", "a"] },
      { until: "2026-02-01", subfolder: "src\\lib/" },
    )
    assert.deepEqual(result, {
      ok: true,
      value: {
        since: "2026-01-01",
        until: "2026-02-01",
        excludeFiles: ["a"],
        subfolder: "src/lib",
      },
    })
  })

  it("removes a field when the patch sets it to undefined", () => {
    const result = admitAnalysisInputs(
      { since: "2026-01-01", until: "2026-02-01" },
      { since: undefined },
    )
    assert.deepEqual(result, { ok: true, value: { until: "2026-02-01" } })
  })

  const refusals: [string, AnalysisInputs, Partial<AnalysisInputs>][] = [
    ["an invalid date", {}, { until: "2026-13-45" }],
    ["a since after until", { since: "2026-02-01" }, { until: "2026-01-01" }],
    ["a parent subfolder", {}, { subfolder: "../secrets" }],
    ["an empty pattern entry", {}, { excludeAuthors: ["bot", " "] }],
  ]
  for (const [name, current, patch] of refusals) {
    it(`refuses ${name} and reports the issue`, () => {
      const result = admitAnalysisInputs(current, patch)
      assert.equal(result.ok, false)
      if (result.ok) return
      assert.ok(result.issues.length > 0)
      for (const issue of result.issues) {
        assert.equal(typeof issue.path, "string")
        assert.ok(issue.message.length > 0)
      }
    })
  }
})
