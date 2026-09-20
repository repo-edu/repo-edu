import assert from "node:assert/strict"
import { test } from "node:test"
import { stampCommitMessage } from "../commit-msg.js"
import { correctionAreas } from "../corrections.js"
import { parseSubject } from "../subject.js"

const primaryAreas = new Set(["area-a", "area-b"])

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
          primaryAreas,
        ),
      /finding|location/,
    )
  }
  const valid =
    subject +
    "\n\ngpt-6-astra high\n\n- [C] [area:area-a] Correct the behaviour.\n- [D] [area:area-b] Correct the words."
  assert.equal(
    stampCommitMessage(
      valid,
      "repo-edu",
      { auditor: null, phases: null },
      primaryAreas,
    ),
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

test("planning findings use sections and deferred Repo Edu findings add no local correction", () => {
  const subject = parseSubject("example/audit oth C1: correct the plan", "plan")
  assert.deepEqual(
    [
      ...correctionAreas(
        subject,
        "- C [area:area-a] Defer the code fix.",
        "plan",
      ),
    ],
    [],
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
  const mixed = parseSubject("example/audit oth C2: correct and defer", "plan")
  const message =
    "example/audit oth C2: correct and defer\n\ngpt-6-astra high\n\n- C [section:decisions] Correct the decision.\n- C [area:area-a] Defer the code fix."
  assert.equal(
    stampCommitMessage(
      message,
      "plan",
      { auditor: null, phases: null },
      primaryAreas,
    ),
    message,
  )
  assert.deepEqual(
    [
      ...correctionAreas(
        mixed,
        "- C [section:decisions] Correct the decision.\n- C [area:area-a] Defer the code fix.",
        "plan",
      ),
    ],
    ["section:decisions"],
  )
  assert.throws(
    () =>
      correctionAreas(
        subject,
        "- C [area:area-a] [section:decisions] Ambiguous location.",
        "plan",
      ),
    /location/,
  )
})

test("new local findings require current primary areas while historical areas still count", () => {
  const subject = parseSubject("oth c1 fix(x): correct the code", "repo-edu")
  const body = "- [C] [area:retired-area] Correct the detail."
  assert.throws(
    () =>
      stampCommitMessage(
        `oth c1 fix(x): correct the code\n\ngpt-6-astra high\n\n${body}`,
        "repo-edu",
        { auditor: null, phases: null },
        primaryAreas,
      ),
    /unknown primary area: retired-area/,
  )
  assert.deepEqual(
    [...correctionAreas(subject, body, "repo-edu")],
    ["area:retired-area"],
  )
})
