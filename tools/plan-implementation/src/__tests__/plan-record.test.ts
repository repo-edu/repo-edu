import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { validateStepCommitProposal } from "../commit-proposal.js"
import type { PlanSourceIdentity } from "../contracts.js"
import { parseZeroSeparatedGitLog } from "../git-log.js"
import {
  createCursorResetCommitMessage,
  createPlanStepCommitMessage,
  PlanRecordError,
  parsePlanCommitRecord,
} from "../plan-record.js"

const source: PlanSourceIdentity = {
  planName: "example",
  planPath: "/plans/plan-example.md",
  commitOid: "a".repeat(40),
  blobOid: "b".repeat(40),
}

const proposal = {
  subject: "A1C2 redesign(plan-implementation): own exact plan records",
  decisionBullets: [
    "One helper writes and reads each exact record so the two paths cannot drift.",
    "Git fields use zero separators so multiline bodies keep their boundaries.",
  ],
} as const

describe("plan commit records", () => {
  it("writes and reads the exact step body", () => {
    const message = createPlanStepCommitMessage(source, 4, proposal)

    assert.equal(message.subject, proposal.subject)
    assert.equal(
      message.body,
      `Plan: example

Plan-Step: 4
Plan-Source-Commit: ${source.commitOid}
Plan-Source-Blob: ${source.blobOid}

- ${proposal.decisionBullets[0]}
- ${proposal.decisionBullets[1]}`,
    )
    assert.deepEqual(
      parsePlanCommitRecord(message.subject, `${message.body}\n`),
      {
        kind: "step",
        planName: "example",
        step: 4,
        sourceCommitOid: source.commitOid,
        sourceBlobOid: source.blobOid,
        subject: proposal.subject,
        decisionBullets: proposal.decisionBullets,
      },
    )
  })

  it("writes and reads the severity-free cursor-reset body", () => {
    const message = createCursorResetCommitMessage(source, 5)

    assert.equal(
      message.subject,
      "chore(plan-implementation): reset example cursor to step 5",
    )
    assert.equal(
      message.body,
      `Plan: example

Plan-Cursor-Reset: 5
Plan-Source-Commit: ${source.commitOid}
Plan-Source-Blob: ${source.blobOid}`,
    )
    assert.deepEqual(parsePlanCommitRecord(message.subject, message.body), {
      kind: "cursor-reset",
      planName: "example",
      nextStep: 5,
      sourceCommitOid: source.commitOid,
      sourceBlobOid: source.blobOid,
    })
  })

  it("ignores older Plan bodies that carry no ledger record", () => {
    assert.equal(
      parsePlanCommitRecord(
        "B1 fix(repo): retain an older plan body",
        "Plan: older-plan\n\n- The older commit predates step records.\n",
      ),
      null,
    )
  })

  it("rejects non-canonical subjects and bullets", () => {
    const invalidSubjects = [
      "B1A1 redesign(plan-implementation): wrong order",
      "A01 redesign(plan-implementation): leading zero",
      "A1 redesign: missing scope",
      "A1 unknown(plan-implementation): unknown kind",
      "redesign(plan-implementation): missing severity",
    ]
    for (const subject of invalidSubjects) {
      assert.throws(
        () => validateStepCommitProposal({ ...proposal, subject }),
        PlanRecordError,
      )
    }

    const invalidBullets = [
      "lowercase start is invalid.",
      "This sentence has no final full stop",
      "This bullet\nwraps.",
      "Co-Authored-By: Another Person <person@example.invalid>.",
    ]
    for (const bullet of invalidBullets) {
      assert.throws(
        () =>
          validateStepCommitProposal({
            ...proposal,
            decisionBullets: [bullet],
          }),
        PlanRecordError,
      )
    }
  })

  it("rejects duplicate, mixed, missing and extra record fields", () => {
    const valid = createPlanStepCommitMessage(source, 1, proposal)
    const malformedBodies = [
      valid.body.replace("Plan-Step: 1", "Plan-Step: 1\nPlan-Step: 1"),
      valid.body.replace("Plan-Step: 1", "Plan-Step: 1\nPlan-Cursor-Reset: 1"),
      valid.body.replace(`Plan-Source-Blob: ${source.blobOid}\n`, ""),
      `${valid.body}\nPlan-Source-Blob: ${source.blobOid}`,
    ]
    for (const body of malformedBodies) {
      assert.throws(
        () => parsePlanCommitRecord(proposal.subject, body),
        PlanRecordError,
      )
    }
  })

  it("parses the exact zero-separated Git history framing", () => {
    const newest = createPlanStepCommitMessage(source, 2, proposal)
    const older = createCursorResetCommitMessage(source, 2)
    const newestOid = "c".repeat(40)
    const olderOid = "d".repeat(40)
    const output = Buffer.from(
      `${newestOid}\0${newest.subject}\0${newest.body}\n\0\n${olderOid}\0${older.subject}\0${older.body}\n\0`,
    )

    assert.deepEqual(parseZeroSeparatedGitLog(output), [
      {
        commitOid: newestOid,
        subject: newest.subject,
        body: `${newest.body}\n`,
      },
      {
        commitOid: olderOid,
        subject: older.subject,
        body: `${older.body}\n`,
      },
    ])
    assert.throws(
      () => parseZeroSeparatedGitLog(Buffer.from(`${newestOid}\0subject\0`)),
      PlanRecordError,
    )
    assert.equal(
      parseZeroSeparatedGitLog(
        Buffer.from(
          `${newestOid}\0 refactor: retain a historical subject\0Older body.\n\0`,
        ),
      )[0].subject,
      " refactor: retain a historical subject",
    )
  })
})
