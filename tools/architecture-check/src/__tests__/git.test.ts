import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseGitStatusOutput } from "../git.js"

describe("git worktree status parsing", () => {
  it("reports clean status from empty porcelain output", () => {
    assert.deepEqual(parseGitStatusOutput(""), {
      dirtyPaths: [],
      untrackedPaths: [],
    })
  })

  it("separates dirty tracked paths from untracked paths", () => {
    assert.deepEqual(
      parseGitStatusOutput(
        " M packages/domain/src/index.ts\0M  tools/architecture-check/src/main.ts\0?? packages/domain/src/new.ts\0",
      ),
      {
        dirtyPaths: [
          "packages/domain/src/index.ts",
          "tools/architecture-check/src/main.ts",
        ],
        untrackedPaths: ["packages/domain/src/new.ts"],
      },
    )
  })

  it("keeps rename records to one dirty path", () => {
    assert.deepEqual(
      parseGitStatusOutput(
        "R  packages/domain/src/new.ts\0packages/domain/src/old.ts\0",
      ),
      {
        dirtyPaths: ["packages/domain/src/new.ts"],
        untrackedPaths: [],
      },
    )
  })
})
