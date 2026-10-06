import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { test } from "node:test"
import { resolvePlan, targetRequest } from "../target.js"
import { fixture } from "./helpers.js"

test("a plan request carries its scope, or none for the plan's history to decide", () => {
  assert.deepEqual(targetRequest("example", []), {
    plan: "example",
    scope: null,
  })
  for (const scope of ["1", "2-4", "all"])
    assert.deepEqual(targetRequest("example.md", [scope]), {
      plan: "example",
      scope,
    })
})

test("plan arguments discard the extension and widening postfix", () => {
  for (const name of [
    "example",
    "example.md",
    "example-widen",
    "example-widen.md",
  ])
    assert.deepEqual(targetRequest(name, []), {
      plan: "example",
      scope: null,
    })
})

test("commit-shaped stems keep .md to name a plan", () => {
  for (const first of ["HEAD", "HEAD-1", "abcdef", "HEAD-2..HEAD"])
    assert.deepEqual(targetRequest(`${first}.md`, []), {
      plan: first,
      scope: null,
    })
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
    assert.deepEqual(targetRequest(commits[0], commits.slice(1)), {
      commits,
      roundKind: "implementation",
    })
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
    ["../plan/example.md"],
    ["/tmp/example.md"],
    ["archive/example/plan.md"],
    ["example", "all", "2"],
  ])
    assert.throws(() => targetRequest(args[0], args.slice(1)))
})

test("stem resolution prefers active plans then resolves closed plans and archived peers", async (t) => {
  const f = await fixture(t)
  const planRoot = join(f.root, "../plan")
  for (const file of [
    "example-widen.md",
    "archive/example/plan.md",
    "archive/closed/plan.md",
    "archive/group/peer.md",
  ]) {
    const path = join(planRoot, file)
    await mkdir(join(path, ".."), { recursive: true })
    await writeFile(path, "# Plan\n")
  }
  assert.equal(
    await resolvePlan(planRoot, "example"),
    join(planRoot, "example-widen.md"),
  )
  await writeFile(join(planRoot, "example.md"), "# Settled plan\n")
  assert.equal(
    await resolvePlan(planRoot, "example"),
    join(planRoot, "example.md"),
  )
  assert.equal(
    await resolvePlan(planRoot, "peer"),
    join(planRoot, "archive/group/peer.md"),
  )
  assert.equal(
    await resolvePlan(planRoot, "closed"),
    join(planRoot, "archive/closed/plan.md"),
  )
  await assert.rejects(
    resolvePlan(planRoot, "missing"),
    /No plan named missing/,
  )
})
