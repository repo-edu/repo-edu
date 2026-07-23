import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { compileGroupNamePattern } from "@repo-edu/domain/pattern-matching"
import type { ValidationResult } from "@repo-edu/domain/types"
import {
  matchGroupIndexes,
  scheduleGroupIndexMatch,
} from "../components/dialogs/NewLocalGroupSetDialog.js"

describe("new local group-set pattern selection", () => {
  it("exposes and selects every source group for blank input without compiling", () => {
    let compilationCount = 0
    const compile: typeof compileGroupNamePattern = () => {
      compilationCount += 1
      return { ok: true, value: () => false }
    }
    const groups = [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }]

    const result = matchGroupIndexes("", groups, compile)

    assert.deepEqual(result, { ok: true, value: [0, 1, 2] })
    assert.equal(compilationCount, 0)
  })

  it("compiles a nonblank pattern once and reuses its predicate", () => {
    let compilationCount = 0
    const compile: typeof compileGroupNamePattern = () => {
      compilationCount += 1
      return { ok: true, value: (value) => value.startsWith("Team-") }
    }
    const groups = [
      { name: "Team-One" },
      { name: "Staff" },
      { name: "Team-Two" },
    ]

    const result = matchGroupIndexes("Team-*", groups, compile)

    assert.deepEqual(result, { ok: true, value: [0, 2] })
    assert.equal(compilationCount, 1)
  })

  it("cancels a pending match before a reset can be overwritten", (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] })
    const results: ValidationResult<number[]>[] = []

    const cancel = scheduleGroupIndexMatch(
      "Team-*",
      [{ name: "Team-One" }, { name: "Staff" }],
      (result) => results.push(result),
    )
    cancel()
    context.mock.timers.tick(400)

    assert.deepEqual(results, [])
  })
})
