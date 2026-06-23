import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ReconciliationResult } from "../area-model.js"
import {
  createLocalGitStamp,
  createReconciliationFreshnessClaim,
} from "../overview-freshness.js"

describe("overview freshness claims", () => {
  it("keeps reconciliation freshness independent from local git state", () => {
    assert.deepEqual(
      createReconciliationFreshnessClaim(reconciliationWithViolations(0)),
      {
        status: "fresh",
        violationCount: 0,
        text: "Area model matches the tracked source inventory.",
      },
    )

    assert.deepEqual(
      createReconciliationFreshnessClaim(reconciliationWithViolations(2)),
      {
        status: "stale",
        violationCount: 2,
        text: "Area model is out of date for the tracked source inventory: 2 reconciliation violation(s).",
      },
    )
  })

  it("reports clean, dirty and untracked local worktree stamps", () => {
    assert.equal(
      createLocalGitStamp({ dirtyPaths: [], untrackedPaths: [] }).status,
      "clean",
    )
    assert.deepEqual(
      createLocalGitStamp({
        dirtyPaths: ["packages/domain/src/index.ts"],
        untrackedPaths: ["packages/domain/src/new.ts"],
      }),
      {
        status: "dirty",
        dirtyPathCount: 1,
        untrackedPathCount: 1,
        text: "Rendered report may not match the local worktree: 1 dirty tracked path(s), 1 untracked path(s).",
      },
    )
  })
})

function reconciliationWithViolations(count: number): ReconciliationResult {
  return {
    primaryByFile: new Map(),
    coversByFile: new Map(),
    violations: Array.from({ length: count }, (_value, index) => ({
      file: `file-${index}.ts`,
      message: "is stale",
    })),
  }
}
