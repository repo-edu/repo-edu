import assert from "node:assert/strict"
import { test } from "node:test"
import { stampCommitMessage } from "../commit-msg.js"
import { correctionAreas } from "../corrections.js"
import { parseSubject } from "../subject.js"

test("the hook refuses missing, misplaced and miscounted A-C finding locations", () => {
  const subject = "oth C1d1 fix(x): correct two concerns"
  for (const body of [
    "- Correct the behaviour.",
    "- [C] [cover:cover-x] Correct the behaviour.",
    "- [C] [area:area-a] [area:area-b] Correct the behaviour.",
    "- [C] [area:Area A] Correct the behaviour.",
    "- [C] [area:area-a] First.\n- [C] [area:area-a] Second.",
    "- [B] [area:area-a] Wrong tier.",
  ]) {
    assert.throws(
      () =>
        stampCommitMessage(
          subject + "\n\ngpt-6-astra high\n\n" + body,
          "repo-edu",
          { auditor: null, phases: null },
        ),
      /finding|location/,
    )
  }
  const valid =
    subject +
    "\n\ngpt-6-astra high\n\n- [C] [area:area-a] Correct the behaviour.\n- [D] [area:area-b] Correct the words."
  assert.equal(
    stampCommitMessage(valid, "repo-edu", { auditor: null, phases: null }),
    valid,
  )
})

test("deferred plan findings are recorded but never counted as local corrections", () => {
  const subject = parseSubject(
    "example/impl-audit-all oth B1c1 fix(x): local fix and deferral",
    "repo-edu",
  )
  const body =
    "- [B] [plan:../plan/example.md#decisions] Defer the decision.\n- [C] [area:area-a] Correct the local detail."
  assert.deepEqual(
    [...correctionAreas(subject, body, "repo-edu")],
    ["area:area-a"],
  )
})

test("planning findings use sections and cannot borrow Repo Edu areas", () => {
  const subject = parseSubject("example/audit oth C1: correct the plan", "plan")
  assert.throws(
    () =>
      correctionAreas(subject, "- C [area:area-a] Correct the plan.", "plan"),
    /section/,
  )
  assert.deepEqual(
    [
      ...correctionAreas(
        subject,
        "- C [field:missing] [section:decisions] Correct the plan.",
        "plan",
      ),
    ],
    ["section:decisions"],
  )
})
