import assert from "node:assert/strict"
import { test } from "node:test"
import { readPlanSteps } from "../plan-steps.js"

test("reads the three implementation-step host forms in list order", () => {
  assert.deepEqual(
    readPlanSteps(`# Plan

## Implementation plan

The steps follow after this paragraph.

1. **Repo Edu step.** Hosted in Repo Edu.
2. **Plan step.** Hosted in the plan repo.
3. **Both-repo step.**
   Hosted in both repos. More implementation detail follows.

## Baseline
`),
    [
      { number: 1, repositories: ["repo-edu"] },
      { number: 2, repositories: ["plan"] },
      { number: 3, repositories: ["plan", "repo-edu"] },
    ],
  )
})

test("requires the depth-2 Implementation plan heading", () => {
  assert.throws(
    () =>
      readPlanSteps(`# Plan

### Implementation plan

1. **Step.** Hosted in Repo Edu.
`),
    /exactly one depth-2 Implementation plan heading/,
  )
})

test("names the first item without a host sentence", () => {
  assert.throws(
    () =>
      readPlanSteps(`# Plan

## Implementation plan

1. **Valid step.** Hosted in Repo Edu.
2. **Invalid step.** Runs in the plan checkout.
3. **Later invalid step.** Has no host either.
`),
    /Implementation plan item 2/,
  )
})

test("does not treat a nested ordered list as implementation steps", () => {
  assert.deepEqual(
    readPlanSteps(`# Plan

## Implementation plan

1. **First step.** Hosted in Repo Edu.
   1. **Nested detail.** Hosted in the plan repo.
2. **Second step.** Hosted in both repos.
`),
    [
      { number: 1, repositories: ["repo-edu"] },
      { number: 2, repositories: ["plan", "repo-edu"] },
    ],
  )
})
