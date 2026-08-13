import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  CommittedImplementationPlan,
  PlanSourceIdentity,
} from "../contracts.js"
import { GitCursorError, resolvePlanCursorFromHistory } from "../git-cursor.js"
import type { GitCommitFields } from "../git-log.js"
import {
  createCursorResetCommitMessage,
  createPlanStepCommitMessage,
} from "../plan-record.js"

const currentSource: PlanSourceIdentity = {
  planName: "example",
  planPath: "/plans/plan-example.md",
  commitOid: "a".repeat(40),
  blobOid: "b".repeat(40),
}

const previousSource: PlanSourceIdentity = {
  ...currentSource,
  commitOid: "c".repeat(40),
  blobOid: "d".repeat(40),
}

const point = { line: 1, column: 1, offset: 0 }

function plan(totalSteps = 5): CommittedImplementationPlan {
  return {
    source: currentSource,
    markdown: "",
    implementationListSpan: { start: point, end: point },
    steps: Array.from({ length: totalSteps }, (_, index) => ({
      number: index + 1,
      title: `Step ${index + 1}`,
      sourceSpan: { start: point, end: point },
      proofs: { items: [], sourceSpan: null },
    })),
  }
}

function step(
  source: PlanSourceIdentity,
  number: number,
  oidCharacter: string,
): GitCommitFields {
  const message = createPlanStepCommitMessage(source, number, {
    subject: "A1 redesign(plan-implementation): advance the exact ledger",
    decisionBullets: [
      "The ledger advances through one admitted step so later work resumes once.",
    ],
  })
  return {
    commitOid: oidCharacter.repeat(40),
    subject: message.subject,
    body: `${message.body}\n`,
  }
}

function reset(
  source: PlanSourceIdentity,
  nextStep: number,
  oidCharacter: string,
): GitCommitFields {
  const message = createCursorResetCommitMessage(source, nextStep)
  return {
    commitOid: oidCharacter.repeat(40),
    subject: message.subject,
    body: `${message.body}\n`,
  }
}

describe("resolvePlanCursorFromHistory", () => {
  it("starts a new plan at step 1", () => {
    assert.deepEqual(resolvePlanCursorFromHistory([], plan()), {
      nextStep: 1,
      resetCommitOid: null,
      stepCommitOids: [],
    })
  })

  it("continues one unchanged contiguous ledger", () => {
    const history = [
      step(currentSource, 3, "3"),
      step(currentSource, 2, "2"),
      step(currentSource, 1, "1"),
    ]

    assert.deepEqual(resolvePlanCursorFromHistory(history, plan()), {
      nextStep: 4,
      resetCommitOid: null,
      stepCommitOids: ["1".repeat(40), "2".repeat(40), "3".repeat(40)],
    })
  })

  it("uses only contiguous records later than the newest reset", () => {
    const history = [
      step(currentSource, 4, "4"),
      step(currentSource, 3, "3"),
      reset(currentSource, 3, "9"),
      step(previousSource, 1, "1"),
    ]

    assert.deepEqual(resolvePlanCursorFromHistory(history, plan()), {
      nextStep: 5,
      resetCommitOid: "9".repeat(40),
      stepCommitOids: ["3".repeat(40), "4".repeat(40)],
    })
  })

  it("rejects gaps and duplicates", () => {
    const histories = [
      [step(currentSource, 2, "2")],
      [
        step(currentSource, 2, "3"),
        step(currentSource, 1, "2"),
        step(currentSource, 1, "1"),
      ],
      [step(currentSource, 4, "4"), reset(currentSource, 3, "9")],
    ]
    for (const history of histories) {
      assert.throws(
        () => resolvePlanCursorFromHistory(history, plan()),
        GitCursorError,
      )
    }
  })

  it("requires a matching reset when the plan source changes", () => {
    assert.throws(
      () =>
        resolvePlanCursorFromHistory([step(previousSource, 1, "1")], plan()),
      /changed without a matching cursor reset/,
    )
  })

  it("rejects the newest reset when it names another source", () => {
    assert.throws(
      () =>
        resolvePlanCursorFromHistory(
          [reset(previousSource, 2, "8"), reset(currentSource, 2, "9")],
          plan(),
        ),
      /newest cursor reset names another plan source/,
    )
  })

  it("compares the source blob without comparing its background commit", () => {
    const sameBlobFromAnotherCommit = {
      ...currentSource,
      commitOid: "e".repeat(40),
    }
    assert.equal(
      resolvePlanCursorFromHistory(
        [step(sameBlobFromAnotherCommit, 1, "1")],
        plan(),
      ).nextStep,
      2,
    )
  })
})
