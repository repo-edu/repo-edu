import assert from "node:assert/strict"
import { test } from "node:test"
import { readAuditRanges, readPlanSteps } from "../plan-steps.js"
import { roundGrammarExamples } from "./round-grammar.js"

test("the round grammar's plan-step examples are parser fixtures", () => {
  const repositories: Readonly<
    Record<string, readonly ("plan" | "repo-edu")[]>
  > = {
    "plan-step/repo-edu": ["repo-edu"],
    "plan-step/plan": ["plan"],
    "plan-step/both": ["plan", "repo-edu"],
    "plan-step/preface": ["repo-edu"],
  } as const
  for (const example of roundGrammarExamples("plan-step/")) {
    if (example.outcome === "refused") {
      assert.throws(
        () => readPlanSteps(example.source),
        (error: unknown) =>
          error instanceof Error && error.message === example.refusal,
        example.id,
      )
      continue
    }
    assert.deepEqual(readPlanSteps(example.source), [
      { number: 1, repositories: repositories[example.id] },
    ])
  }
})

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

test("the round grammar's audit-range examples are parser fixtures", () => {
  const parsed: Readonly<Record<string, readonly string[]>> = {
    "audit-ranges/multiple": ["1-2", "3", "4-5"],
    "audit-ranges/full": ["1-3"],
    "audit-ranges/followed-by-prose": ["1-2"],
    "audit-ranges/list-item": ["1-2"],
  }
  for (const example of roundGrammarExamples("audit-ranges/")) {
    const steps = readPlanSteps(example.source)
    if (example.outcome === "refused") {
      assert.throws(
        () => readAuditRanges(example.source, steps.length),
        (error: unknown) =>
          error instanceof Error && error.message === example.refusal,
        example.id,
      )
      continue
    }
    assert.deepEqual(
      readAuditRanges(example.source, steps.length),
      parsed[example.id],
      example.id,
    )
  }
})

test("requires the Execution and audits subsection", () => {
  const source = `# Plan

## Implementation plan

1. **Step.** Hosted in Repo Edu.
`
  assert.throws(
    () => readAuditRanges(source, readPlanSteps(source).length),
    /exactly one depth-3 Execution and audits subsection/,
  )
})

test("rejects audit-range sentences split across nested paragraphs", () => {
  const source = `# Plan

## Implementation plan

1. **Step.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 1.

- Audit ranges: 1.
`
  assert.throws(
    () => readAuditRanges(source, readPlanSteps(source).length),
    /exactly one Audit ranges: sentence/,
  )
})

test("requires every audit range to use the step-scope grammar", () => {
  const source = `# Plan

## Implementation plan

1. **First step.** Hosted in Repo Edu.
2. **Second step.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 1-two.
`
  assert.throws(
    () => readAuditRanges(source, readPlanSteps(source).length),
    /Audit range "1-two" must be a positive step number or an increasing range/,
  )
})

test("requires the audit ranges to end at the last listed step", () => {
  const source = `# Plan

## Implementation plan

1. **First step.** Hosted in Repo Edu.
2. **Second step.** Hosted in Repo Edu.

### Execution and audits

Audit ranges: 1.
`
  assert.throws(
    () => readAuditRanges(source, readPlanSteps(source).length),
    /Audit ranges end at step 1; implementation plan ends at step 2/,
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
