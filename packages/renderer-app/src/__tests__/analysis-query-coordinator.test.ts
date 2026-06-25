import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  selectCurrentAnalysisResult,
  selectCurrentBlameResult,
  selectEffectiveDiscoveryOutcome,
} from "../analysis/analysis-query-coordinator.js"
import { makeBaseResult, makeBlameResult } from "./analysis.test-support.js"

describe("analysis query value projection", () => {
  it("derives discovery completion unless cancellation masks query success", () => {
    assert.equal(
      selectEffectiveDiscoveryOutcome({
        commandOutcome: "none",
        discoveryIsSuccess: false,
      }),
      "none",
    )
    assert.equal(
      selectEffectiveDiscoveryOutcome({
        commandOutcome: "none",
        discoveryIsSuccess: true,
      }),
      "completed",
    )
    assert.equal(
      selectEffectiveDiscoveryOutcome({
        commandOutcome: "cancelled",
        discoveryIsSuccess: true,
      }),
      "cancelled",
    )
  })

  it("hides previous analysis data while the current query is errored", () => {
    const result = makeBaseResult()

    assert.equal(
      selectCurrentAnalysisResult({
        snapshotCommitOid: "a".repeat(40),
        analysisIsFetching: false,
        analysisIsError: true,
        data: result,
      }),
      null,
    )
  })

  it("hides previous blame data while the current query is errored", () => {
    const blameResult = makeBlameResult()

    assert.equal(
      selectCurrentBlameResult({
        blameIsFetching: false,
        blameIsError: true,
        data: blameResult,
      }),
      null,
    )
  })
})
