import assert from "node:assert/strict"
import test from "node:test"
import { createPnpmTestArguments } from "./run-tests.mjs"

test("runs every workspace test when no package is given", () => {
  assert.deepEqual(createPnpmTestArguments([]), [
    "-r",
    "--stream",
    "--if-present",
    "run",
    "test",
  ])
})

test("filters tests by workspace package path", () => {
  assert.deepEqual(createPnpmTestArguments(["tools/audit-round"]), [
    "--filter",
    "./tools/audit-round",
    "--fail-if-no-match",
    "run",
    "test",
  ])
})

test("normalises explicit and Windows-style relative paths", () => {
  assert.deepEqual(
    createPnpmTestArguments(["./packages/domain/"]),
    createPnpmTestArguments(["packages\\domain"]),
  )
})

test("rejects selectors that do not name one workspace package", () => {
  for (const argv of [
    ["domain"],
    ["packages/*"],
    ["../repo-edu"],
    ["packages/domain", "packages/application"],
  ]) {
    assert.throws(
      () => createPnpmTestArguments(argv),
      /Usage: pnpm test/,
    )
  }
})
