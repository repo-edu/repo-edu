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

  it("maps historical splitFrom parents to current descendants", () => {
    const currentModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-new",
            name: "New Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/new/src/" }],
            splitFrom: "area-retired",
          },
        ],
      } satisfies AreaModel),
    )
    const historicalModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-retired",
            name: "Retired Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/old/src/" }],
          },
        ],
      } satisfies AreaModel),
    )
    const report = computeRedesignDensity(
      [
        commit(
          "A1 redesign(area): split area",
          ["packages/old/src/file.ts"],
          "split-commit",
        ),
        ...Array.from({ length: 9 }, (_, index) =>
          commit(`B1 fix(other): ${index}`, ["packages/new/src/other.ts"]),
        ),
        commit("B1 fix(other): parent", ["packages/new/src/parent.ts"]),
      ],
      currentModel,
      new Map([["split-commit", historicalModel]]),
    )

    assert.deepEqual(report.violations, [])
    assert.equal(report.counts.get("area-new"), 1)
  })

  it("prefers a split child over a still-active parent for moved historical paths", () => {
    const currentModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-parent",
            name: "Parent Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/parent/src/" }],
          },
          {
            id: "area-child",
            name: "Child Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/new/src/" }],
            splitFrom: "area-parent",
          },
        ],
      } satisfies AreaModel),
    )
    const historicalModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-parent",
            name: "Parent Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/old/src/" }],
          },
        ],
      } satisfies AreaModel),
    )
    const report = computeRedesignDensity(
      [
        commit(
          "A1 redesign(area): split child",
          ["packages/old/src/file.ts"],
          "split-commit",
        ),
        ...Array.from({ length: 9 }, (_, index) =>
          commit(`B1 fix(other): ${index}`, ["packages/parent/src/other.ts"]),
        ),
        commit("B1 fix(other): parent", ["packages/parent/src/parent.ts"]),
      ],
      currentModel,
      new Map([["split-commit", historicalModel]]),
    )

    assert.deepEqual(report.violations, [])
    assert.equal(report.counts.get("area-child"), 1)
    assert.equal(report.counts.has("area-parent"), false)
  })

  it("localizes pre-split parent churn even when the current parent still matches the old path", () => {
    const currentModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-parent",
            name: "Parent Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/old/src/" }],
          },
          {
            id: "area-child",
            name: "Child Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/new/src/" }],
            splitFrom: "area-parent",
          },
        ],
      } satisfies AreaModel),
    )
    const historicalModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-parent",
            name: "Parent Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/old/src/" }],
          },
        ],
      } satisfies AreaModel),
    )
    const report = computeRedesignDensity(
      [
        commit(
          "A1 redesign(area): split child",
          ["packages/old/src/file.ts"],
          "split-commit",
        ),
        ...Array.from({ length: 9 }, (_, index) =>
          commit(`B1 fix(other): ${index}`, ["packages/new/src/other.ts"]),
        ),
        commit("B1 fix(other): parent", ["packages/new/src/parent.ts"]),
      ],
      currentModel,
      new Map([["split-commit", historicalModel]]),
    )

    assert.deepEqual(report.violations, [])
    assert.equal(report.counts.get("area-child"), 1)
    assert.equal(report.counts.has("area-parent"), false)
  })

  it("keeps post-split parent churn on the parent when the historical snapshot already has the child", () => {
    const currentModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-parent",
            name: "Parent Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/old/src/" }],
          },
          {
            id: "area-child",
            name: "Child Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/new/src/" }],
            splitFrom: "area-parent",
          },
        ],
      } satisfies AreaModel),
    )
    const historicalModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-parent",
            name: "Parent Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/old/src/" }],
          },
          {
            id: "area-child",
            name: "Child Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/new/src/" }],
            splitFrom: "area-parent",
          },
        ],
      } satisfies AreaModel),
    )
    const report = computeRedesignDensity(
      [
        commit(
          "A1 redesign(area): parent after split",
          ["packages/old/src/file.ts"],
          "split-commit",
        ),
        ...Array.from({ length: 9 }, (_, index) =>
          commit(`B1 fix(other): ${index}`, ["packages/new/src/other.ts"]),
        ),
        commit("B1 fix(other): parent", ["packages/new/src/parent.ts"]),
      ],
      currentModel,
      new Map([["split-commit", historicalModel]]),
    )

    assert.deepEqual(report.violations, [])
    assert.equal(report.counts.get("area-parent"), 1)
    assert.equal(report.counts.has("area-child"), false)
  })

  it("follows retired intermediate splitFrom IDs through model snapshots", () => {
    const currentModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-child",
            name: "Child Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/new/src/" }],
            splitFrom: "area-middle",
          },
        ],
      } satisfies AreaModel),
    )
    const historicalModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-parent",
            name: "Parent Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/old/src/" }],
          },
        ],
      } satisfies AreaModel),
    )
    const intermediateModel = compileAreaModel(
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-middle",
            name: "Middle Area",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/middle/src/" }],
            splitFrom: "area-parent",
          },
        ],
      } satisfies AreaModel),
    )
    const report = computeRedesignDensity(
      [
        commit(
          "A1 redesign(area): split child",
          ["packages/old/src/file.ts"],
          "split-commit",
        ),
        ...Array.from({ length: 9 }, (_, index) =>
          commit(`B1 fix(other): ${index}`, ["packages/new/src/other.ts"]),
        ),
        commit("B1 fix(other): parent", ["packages/new/src/parent.ts"]),
      ],
      currentModel,
      new Map([
        ["split-commit", historicalModel],
        ["intermediate", intermediateModel],
      ]),
    )

    assert.deepEqual(report.violations, [])
    assert.equal(report.counts.get("area-child"), 1)
  })
})

function commit(
  subject: string,
  changedPaths: readonly string[],
  hash = subject,
): GitCommit {
  return {
    hash,
    parents: ["parent"],
    subject,
    changedPaths,
  }
}
