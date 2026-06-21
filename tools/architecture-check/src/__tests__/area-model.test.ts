import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  type AreaModel,
  compileAreaModel,
  parseAreaModel,
  reconcileAreaModel,
} from "../area-model.js"

const validModel = {
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
    },
    {
      id: "cover-cross-cutting",
      name: "Cross cutting",
      kind: "cover",
      members: [
        { type: "pattern", path: "^packages/a/src/cross-" },
        { type: "file", path: "packages/b/src/cross.ts" },
      ],
    },
  ],
} satisfies AreaModel

describe("area model schema", () => {
  it("rejects duplicate stable IDs", () => {
    assert.throws(() =>
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-a",
            name: "Area A",
            kind: "partition",
            members: [{ type: "pattern", path: "^a/" }],
          },
          {
            id: "area-a",
            name: "Area A copy",
            kind: "partition",
            members: [{ type: "pattern", path: "^b/" }],
          },
        ],
      }),
    )
  })

  it("rejects literal file members on partition areas", () => {
    assert.throws(() =>
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-a",
            name: "Area A",
            kind: "partition",
            members: [{ type: "file", path: "packages/a/src/index.ts" }],
          },
        ],
      }),
    )
  })

  it("allows splitFrom to reference retired area IDs", () => {
    assert.doesNotThrow(() =>
      parseAreaModel({
        schemaVersion: 1,
        areas: [
          {
            id: "area-a",
            name: "Area A",
            kind: "partition",
            members: [{ type: "pattern", path: "^a/" }],
            splitFrom: "area-retired",
          },
        ],
      }),
    )
  })

  it("rejects invalid splitFrom lineage", () => {
    assert.throws(
      () =>
        parseAreaModel({
          schemaVersion: 1,
          areas: [
            {
              id: "area-a",
              name: "Area A",
              kind: "partition",
              members: [{ type: "pattern", path: "^a/" }],
            },
            {
              id: "cover-a",
              name: "Cover A",
              kind: "cover",
              members: [{ type: "pattern", path: "^a/" }],
              splitFrom: "area-a",
            },
          ],
        }),
      /same kind/,
    )

    assert.throws(
      () =>
        parseAreaModel({
          schemaVersion: 1,
          areas: [
            {
              id: "area-a",
              name: "Area A",
              kind: "partition",
              members: [{ type: "pattern", path: "^a/" }],
              splitFrom: "area-b",
            },
            {
              id: "area-b",
              name: "Area B",
              kind: "partition",
              members: [{ type: "pattern", path: "^b/" }],
              splitFrom: "area-a",
            },
          ],
        }),
      /lineage contains a cycle/,
    )
  })
})

describe("area reconciliation", () => {
  it("assigns every inventory file to exactly one partition", () => {
    const result = reconcileAreaModel(compileAreaModel(validModel), {
      files: [
        "packages/a/src/cross-one.ts",
        "packages/a/src/index.ts",
        "packages/b/src/cross.ts",
      ],
      fileSet: new Set([
        "packages/a/src/cross-one.ts",
        "packages/a/src/index.ts",
        "packages/b/src/cross.ts",
      ]),
    })

    assert.deepEqual([...result.violations], [])
    assert.equal(result.primaryByFile.get("packages/a/src/index.ts"), "area-a")
    assert.deepEqual(result.coversByFile.get("packages/b/src/cross.ts"), [
      "cover-cross-cutting",
    ])
  })

  it("fails orphan files, overlapping partitions, empty partitions, stale cover files and empty cover patterns", () => {
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
            id: "area-overlap",
            name: "Area overlap",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/a/src/overlap" }],
          },
          {
            id: "area-empty",
            name: "Area empty",
            kind: "partition",
            members: [{ type: "pattern", path: "^packages/empty/src/" }],
          },
          {
            id: "cover-broken",
            name: "Broken cover",
            kind: "cover",
            members: [
              { type: "pattern", path: "^packages/a/src/never-" },
              { type: "file", path: "packages/a/src/missing.ts" },
            ],
          },
        ],
      }),
    )

    const result = reconcileAreaModel(model, {
      files: ["packages/a/src/overlap.ts", "packages/orphan/src/index.ts"],
      fileSet: new Set([
        "packages/a/src/overlap.ts",
        "packages/orphan/src/index.ts",
      ]),
    })

    assert.match(
      result.violations.map((violation) => violation.message).join("\n"),
      /multiple partition areas/,
    )
    assert.match(
      result.violations.map((violation) => violation.message).join("\n"),
      /is not assigned to a partition area/,
    )
    assert.match(
      result.violations.map((violation) => violation.message).join("\n"),
      /partition area has no source-inventory files/,
    )
    assert.match(
      result.violations.map((violation) => violation.message).join("\n"),
      /stale literal file member/,
    )
    assert.match(
      result.violations.map((violation) => violation.message).join("\n"),
      /cover pattern matches no source-inventory files/,
    )
  })
})
