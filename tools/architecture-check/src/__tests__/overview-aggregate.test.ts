import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  compileAreaModel,
  loadAreaModel,
  parseAreaModel,
  reconcileAreaModel,
} from "../area-model.js"
import {
  buildAreaStructureAggregate,
  createAreaStructureAggregate,
} from "../overview-aggregate.js"
import { ROOT } from "../repo-paths.js"

describe("overview structure aggregate", () => {
  it("projects the real area model into roots, partitions and covers", () => {
    const model = compileAreaModel(loadAreaModel(ROOT))
    const aggregate = buildAreaStructureAggregate(ROOT, {
      countLines: () => 1,
    })

    assert.deepEqual(aggregate.reconciliation.violations, [])
    assert.equal(aggregate.partitions.length, model.partitions.length)
    assert.equal(aggregate.covers.length, model.covers.length)
    assert.equal(aggregate.totalLines, aggregate.inventoryFileCount)
    assert.equal(aggregate.assignedFileCount, aggregate.inventoryFileCount)
    assert.deepEqual(
      aggregate.roots.map((root) => root.id),
      ["apps", "packages", "tools"],
    )
  })

  it("counts cover membership by owning partition", () => {
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
          },
          {
            id: "cover-shared",
            name: "Shared",
            kind: "cover",
            members: [
              { type: "pattern", path: "^packages/a/src/" },
              { type: "file", path: "packages/b/src/marked.ts" },
            ],
          },
        ],
      }),
    )
    const inventory = {
      files: [
        "packages/a/src/one.ts",
        "packages/a/src/two.ts",
        "packages/b/src/marked.ts",
        "packages/b/src/plain.ts",
      ],
      fileSet: new Set([
        "packages/a/src/one.ts",
        "packages/a/src/two.ts",
        "packages/b/src/marked.ts",
        "packages/b/src/plain.ts",
      ]),
    }
    const aggregate = createAreaStructureAggregate({
      root: "/repo",
      model,
      inventory,
      reconciliation: reconcileAreaModel(model, inventory),
      countLines: () => 10,
    })

    assert.equal(aggregate.totalLines, 40)
    assert.deepEqual(aggregate.covers, [
      {
        id: "cover-shared",
        name: "Shared",
        totalFiles: 3,
        counts: [
          { partitionId: "area-a", count: 2 },
          { partitionId: "area-b", count: 1 },
        ],
      },
    ])
  })
})
