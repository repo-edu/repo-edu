import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveRunCompletionAction } from "../components/tabs/analysis/run-analysis-state.js"

describe("resolveRunCompletionAction", () => {
  it("ignores stale runs", () => {
    assert.equal(resolveRunCompletionAction(false, false), "ignore")
    assert.equal(resolveRunCompletionAction(false, true), "ignore")
  })

  it("sets idle for current aborted runs", () => {
    assert.equal(resolveRunCompletionAction(true, true), "set-idle")
  })

  it("commits current successful runs", () => {
    assert.equal(resolveRunCompletionAction(true, false), "commit-result")
  })
})
