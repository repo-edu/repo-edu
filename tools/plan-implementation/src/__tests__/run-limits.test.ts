import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  CommittedImplementationPlan,
  PlanImplementationRunRequest,
  PlanProof,
  PlanSourceSpan,
} from "../contracts.js"
import type { ResolvedPlanCursor } from "../git-cursor.js"
import {
  RunLimitError,
  resolveRunAuthorization,
  UserActionProofError,
} from "../run-limits.js"

const sourceSpan: PlanSourceSpan = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 2, offset: 1 },
}

function planWithProofs(
  proofsByStep: ReadonlyMap<number, readonly PlanProof[]> = new Map(),
): CommittedImplementationPlan {
  return {
    source: {
      planName: "example",
      planPath: "/plans/example.md",
      commitOid: "1".repeat(40),
      blobOid: "2".repeat(40),
    },
    markdown: "# Example",
    implementationListSpan: sourceSpan,
    steps: Array.from({ length: 5 }, (_, index) => ({
      number: index + 1,
      title: `Step ${index + 1}`,
      sourceSpan,
      proofs: {
        items: proofsByStep.get(index + 1) ?? [],
        sourceSpan: null,
      },
    })),
  }
}

function cursor(nextStep: number): ResolvedPlanCursor {
  return {
    nextStep,
    resetCommitOid: null,
    stepCommitOids: [],
    implementedCommitOid: null,
  }
}

function resolve(
  request: PlanImplementationRunRequest,
  nextStep = 2,
  plan = planWithProofs(),
) {
  return resolveRunAuthorization(plan, cursor(nextStep), request)
}

describe("resolveRunAuthorization", () => {
  it("freezes completion, count and through-step ceilings", () => {
    const completion = resolve({ mode: "complete" })
    const count = resolve({ mode: "count", count: 2 })
    const through = resolve({ mode: "through-step", throughStep: 4 })

    assert.deepEqual(completion, {
      request: { mode: "complete" },
      resumeStep: 2,
      resolvedCeiling: 5,
      totalSteps: 5,
    })
    assert.equal(count.resolvedCeiling, 3)
    assert.equal(through.resolvedCeiling, 4)
    assert.ok(Object.isFrozen(completion))
    assert.ok(Object.isFrozen(completion.request))
  })

  it("caps a count at completion and handles an already complete cursor", () => {
    assert.equal(
      resolve({ mode: "count", count: Number.MAX_SAFE_INTEGER })
        .resolvedCeiling,
      5,
    )

    const complete = resolve({ mode: "complete" }, 6)
    const counted = resolve({ mode: "count", count: 1 }, 6)
    assert.equal(complete.resolvedCeiling, 5)
    assert.equal(counted.resolvedCeiling, 5)
  })

  it("rejects invalid numeric modes and cursors", () => {
    assert.throws(
      () => resolve({ mode: "count", count: 0 }),
      /step count must be a positive safe integer/,
    )
    assert.throws(
      () => resolve({ mode: "through-step", throughStep: 6 }),
      /exceeds the final plan step 5/,
    )
    assert.throws(
      () => resolve({ mode: "through-step", throughStep: 1 }),
      /before the resume step 2/,
    )
    assert.throws(
      () => resolve({ mode: "complete" }, 7),
      /cursor must point from step 1 through 6/,
    )
    assert.throws(
      () =>
        resolveRunAuthorization({ ...planWithProofs(), steps: [] }, cursor(1), {
          mode: "complete",
        }),
      RunLimitError,
    )
  })

  it("names the first authorised user action and ignores later actions", () => {
    const plan = planWithProofs(
      new Map([
        [3, [{ "user-action": "Inspect step 3." }]],
        [5, [{ "user-action": "Inspect step 5." }]],
      ]),
    )

    let error: unknown
    try {
      resolve({ mode: "through-step", throughStep: 4 }, 2, plan)
      assert.fail("Expected the authorised user action to stop preflight.")
    } catch (caught) {
      error = caught
    }
    assert.ok(error instanceof UserActionProofError)
    assert.equal(error.step, 3)
    assert.equal(error.action, "Inspect step 3.")
    assert.match(error.message, /step 3 requires user action: Inspect step 3/)

    const allowed = resolve({ mode: "through-step", throughStep: 4 }, 4, plan)
    assert.equal(allowed.resolvedCeiling, 4)
  })
})
