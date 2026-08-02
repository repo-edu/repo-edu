import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { readSourceInventory } from "../inventory.js"

describe("source inventory", () => {
  it("uses worktree source paths and excludes build or vendored output", () => {
    const inventory = readSourceInventory("/repo", () => [
      "apps/docs/src/fixtures/projects/calculator/generated/team-01.fixture.ts",
      "apps/docs/src/fixtures/projects/calculator/index.ts",
      "packages/application/src/adapters/tabular/index.d.ts",
      "packages/application/src/index.ts",
      "packages/domain/src/generated/output.ts",
      "packages/domain/src/settings.ts",
      "packages/domain/src/settings.test.ts",
      "packages/domain/src/view.tsx",
      "packages/domain/src/view.tsx.snap",
      "packages/domain/untracked.ts",
      "tools/release/src/license-gate/runtime-notices/package.ts",
    ])

    assert.deepEqual(inventory.files, [
      "apps/docs/src/fixtures/projects/calculator/generated/team-01.fixture.ts",
      "apps/docs/src/fixtures/projects/calculator/index.ts",
      "packages/application/src/adapters/tabular/index.d.ts",
      "packages/application/src/index.ts",
      "packages/domain/src/generated/output.ts",
      "packages/domain/src/settings.test.ts",
      "packages/domain/src/settings.ts",
      "packages/domain/src/view.tsx",
    ])
  })

  it("includes non-ignored untracked source files from the worktree", () => {
    const worktreeInventory = readSourceInventory("/repo", () => [
      "packages/domain/src/local-only.ts",
      "packages/domain/src/settings.ts",
    ])

    assert.equal(
      worktreeInventory.fileSet.has("packages/domain/src/local-only.ts"),
      true,
    )
  })
})
