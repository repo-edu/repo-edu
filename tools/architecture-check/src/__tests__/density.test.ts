import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  type AreaModel,
  compileAreaModel,
  parseAreaModel,
} from "../area-model.js"
import { computeRedesignDensity, conventionalKind } from "../density.js"
import type { GitCommit } from "../git.js"

const model = compileAreaModel(
  parseAreaModel({
    schemaVersion: 1,
    areas: [
      {
        id: "area-a",
        name: "Area A",
        kind: "partition",
        members: [{ type: "pattern", path: "^packages/a/src/" }],
      },
      {
        id: "area-b",
        name: "Area B",
        kind: "partition",
        members: [{ type: "pattern", path: "^packages/b/src/" }],
        splitFrom: "area-a",
      },
      {
        id: "cover-runtime",
        name: "Runtime",
        kind: "cover",
        members: [{ type: "pattern", path: "^packages/a/src/runtime" }],
      },
    ],
  } satisfies AreaModel),
)

describe("redesign density", () => {
  it("strips implementation severity prefixes before reading commit kinds", () => {
    assert.equal(
      conventionalKind("A1B2 redesign(renderer-app): own state"),
      "redesign",
    )
    assert.equal(conventionalKind("B1 fix(renderer-app): patch state"), "fix")
  })

  it("requires enough history to fail closed", () => {
    const report = computeRedesignDensity([], model)

    assert.equal(report.violations.length, 1)
  })

  it("deduplicates each commit per area and includes cover attribution", () => {
    const report = computeRedesignDensity(
      [
        commit("A1 redesign(area): first", [
          "packages/a/src/runtime-one.ts",
          "packages/a/src/runtime-two.ts",
        ]),
        commit("C1 refactor(area): second", ["packages/b/src/index.ts"]),
        ...Array.from({ length: 9 }, (_, index) =>
          commit(`B1 fix(other): ${index}`, ["packages/a/src/other.ts"]),
        ),
      ],
      model,
    )

    assert.equal(report.counts.get("area-a"), 1)
    assert.equal(report.counts.get("cover-runtime"), 1)
    assert.equal(report.counts.get("area-b"), 1)
  })
})

function commit(subject: string, changedPaths: readonly string[]): GitCommit {
  return {
    hash: subject,
    parents: ["parent"],
    subject,
    changedPaths,
  }
}
