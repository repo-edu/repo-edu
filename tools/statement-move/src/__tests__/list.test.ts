import assert from "node:assert/strict"
import * as path from "node:path"
import { test } from "node:test"
import type { ListedFile, MoveListReply } from "../move-list.js"
import { withProject } from "./fixture-project.js"

// Every range names lines of the unchanged source. The first move adds an
// import above every later range, and because SCALE is not exported, it also
// adds `export` before SCALE, which the second move then selects.
const SHAPES = `export interface Shape {
  size: number
}

const SCALE = 2

export function area(shape: Shape): number {
  return shape.size * SCALE
}

export function describe(shape: Shape): string {
  return \`area \${area(shape)}\`
}

export const UNIT = 1
`

const USER = `import { area, type Shape } from "./shapes.js"

export const unitArea = (shape: Shape) => area(shape)
`

function cleanFiles(reply: MoveListReply): Map<string, ListedFile> {
  assert.equal(reply.outcome, "clean", JSON.stringify(reply))
  return new Map(
    reply.outcome === "clean"
      ? reply.files.map((file) => [file.path, file])
      : [],
  )
}

test("a clean list follows its ranges through the moves and writes nothing", () => {
  withProject({ "src/shapes.ts": SHAPES, "src/user.ts": USER }, (project) => {
    const before = project.snapshot()
    const reply = project.attemptList("src/shapes.ts", [
      { target: "src/area.ts", ranges: [{ start: 7, end: 9 }] },
      { target: "src/scale.ts", ranges: [{ start: 5, end: 5 }] },
      {
        target: "src/shape.ts",
        ranges: [
          { start: 11, end: 13 },
          { start: 1, end: 3 },
        ],
      },
    ])

    const files = cleanFiles(reply)
    const file = (name: string) => files.get(path.join("pkg", "src", name))
    assert.deepEqual(
      [...files.keys()].sort(),
      ["area.ts", "scale.ts", "shape.ts", "shapes.ts", "user.ts"]
        .map((name) => path.join("pkg", "src", name))
        .sort(),
    )
    assert.equal(file("area.ts")?.isNew, true)
    assert.equal(file("shapes.ts")?.isNew, false)
    assert.match(file("scale.ts")?.text ?? "", /^export const SCALE = 2$/m)
    const shape = file("shape.ts")?.text ?? ""
    assert.match(shape, /export interface Shape \{/)
    assert.match(shape, /export function describe\(shape: Shape\): string/)
    const area = file("area.ts")?.text ?? ""
    assert.match(area, /^import \{ SCALE \} from "\.\/scale\.js"$/m)
    assert.match(area, /^import \{ type Shape \} from "\.\/shape\.js"$/m)
    const source = file("shapes.ts")?.text ?? ""
    assert.match(source, /export const UNIT = 1/)
    assert.doesNotMatch(source, /SCALE|Shape|function/)
    assert.match(file("user.ts")?.text ?? "", /from "\.\/area\.js"/)
    assert.deepEqual(project.snapshot(), before)
  })
})

test("a refused entry is named with its diagnostics and nothing is written", () => {
  withProject(
    {
      "src/round.ts": `export const cacheRoot = "/tmp/cache"

export function options() {
  return { cacheRoot }
}

export const LABEL = "round"
`,
    },
    (project) => {
      const before = project.snapshot()
      const reply = project.attemptList("src/round.ts", [
        { target: "src/label.ts", ranges: [{ start: 7, end: 7 }] },
        { target: "src/fixture.ts", ranges: [{ start: 1, end: 1 }] },
      ])

      assert.equal(reply.outcome, "refused", JSON.stringify(reply))
      assert.ok(reply.outcome === "refused")
      assert.equal(reply.entry, 2)
      assert.equal(
        reply.message,
        `entry 2 (${path.join("pkg", "src", "fixture.ts")}), lines 1-1: the move adds TypeScript 6 project diagnostics`,
      )
      assert.ok(
        reply.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 18004 &&
            diagnostic.path === path.join("pkg", "src", "round.ts"),
        ),
      )
      assert.deepEqual(project.snapshot(), before)
    },
  )
})

test("an entry whose range cuts a statement is refused before any move", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const reply = project.attemptList("src/shapes.ts", [
      { target: "src/area.ts", ranges: [{ start: 7, end: 9 }] },
      { target: "src/describe.ts", ranges: [{ start: 12, end: 13 }] },
    ])

    assert.deepEqual(reply, {
      outcome: "refused",
      entry: 2,
      message: `entry 2 (${path.join("pkg", "src", "describe.ts")}), lines 12-13: lines 12-13 cut the top-level statement at lines 11-13`,
      diagnostics: [],
    })
  })
})

test("a list whose hash does not match the source is not tried", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const stale = "0".repeat(40)
    const reply = project.attemptList(
      "src/shapes.ts",
      [{ target: "src/area.ts", ranges: [{ start: 7, end: 9 }] }],
      stale,
    )

    assert.equal(reply.outcome, "changed")
    assert.ok(reply.outcome === "changed")
    assert.match(reply.message, new RegExp(`not the content ${stale}`))
  })
})
