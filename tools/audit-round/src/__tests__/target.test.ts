import assert from "node:assert/strict"
import { test } from "node:test"
import { auditTarget } from "../target.js"

test("plan targets retain their filename and optional step scope", () => {
  assert.deepEqual(auditTarget("../plan/example.md", []), {
    plan: "../plan/example.md",
    scope: undefined,
  })
  for (const scope of ["1", "2-4"])
    assert.deepEqual(auditTarget("example.md", [scope]), {
      plan: "example.md",
      scope,
    })
})

test("a plan named without its extension gets .md in either round kind", () => {
  assert.deepEqual(auditTarget("phase-arguments", []), {
    plan: "phase-arguments.md",
    scope: undefined,
  })
  assert.deepEqual(auditTarget("../plan/phase-arguments", ["2"]), {
    plan: "../plan/phase-arguments.md",
    scope: "2",
  })
  assert.deepEqual(auditTarget("phase-arguments", [], "planning"), {
    plan: "phase-arguments.md",
  })
  assert.deepEqual(auditTarget("example.md", [], "planning"), {
    plan: "example.md",
  })
})

test("commit-shaped names stay commits and are refused from the plan root", () => {
  for (const first of ["HEAD", "HEAD-1", "abcdef", "HEAD-2..HEAD"])
    assert.throws(() => auditTarget(first, [], "planning"))
  assert.throws(() => auditTarget("phase-arguments", ["1"], "planning"))
})

test("commit targets preserve references for the workflow to resolve", () => {
  for (const commits of [
    ["HEAD"],
    ["HEAD-0"],
    ["HEAD-1"],
    ["23674f"],
    ["a".repeat(40)],
    ["HEAD-2..HEAD"],
    ["HEAD..HEAD-2"],
    ["23674f..HEAD"],
    ["HEAD-2..abcdef"],
    ["abcdef..23674f"],
    ["HEAD-2", "23674f", "HEAD"],
  ])
    assert.deepEqual(auditTarget(commits[0], commits.slice(1)), { commits })
})

test("invalid targets and mixed plan/commit scopes are refused", () => {
  for (const args of [
    ["HEAD--1"],
    ["HEAD-1.5"],
    ["HEAD-9007199254740992"],
    ["HEAD-01"],
    ["HEAD-"],
    ["HEAD...HEAD-2"],
    ["HEAD.."],
    ["..HEAD"],
    ["HEAD-2..HEAD", "HEAD-3"],
    ["HEAD", "example.md"],
    ["HEAD", "3"],
    ["example.md", "HEAD"],
    ["example.md", "0"],
    ["example.md", "3-1"],
    ["example.md", "9007199254740992"],
    ["example.md", "1", "2"],
    ["phase-arguments", "1", "2"],
    ["phase-arguments", "HEAD"],
  ])
    assert.throws(() => auditTarget(args[0], args.slice(1)))
})
