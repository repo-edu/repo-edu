import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseGitLog } from "../git.js"

describe("git history parsing", () => {
  it("uses rename destinations from NUL-framed name-status output", () => {
    const commits = parseGitLog(
      [
        "\x1eabc123",
        "parent",
        "A1 redesign(tool): split area",
        "M",
        "packages/a/src/file with spaces.ts",
        "R100",
        "packages/old/src/license-gate.ts",
        "tools/release/src/license-gate.ts",
        "",
      ].join("\0"),
    )

    assert.deepEqual(commits[0]?.changedPaths, [
      "packages/a/src/file with spaces.ts",
      "tools/release/src/license-gate.ts",
    ])
  })

  it("normalizes the leading newline before the first name-status token", () => {
    const commits = parseGitLog(
      [
        "\x1eabc123",
        "parent",
        "A1 redesign(tool): split area",
        "\nR100",
        "packages/old/src/license-gate.ts",
        "tools/release/src/license-gate.ts",
        "",
      ].join("\0"),
    )

    assert.deepEqual(commits[0]?.changedPaths, [
      "tools/release/src/license-gate.ts",
    ])
  })
})
