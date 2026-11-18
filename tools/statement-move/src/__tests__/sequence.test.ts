import assert from "node:assert/strict"
import { test } from "node:test"
import { withProject } from "./fixture-project.js"

const SHAPES = `export interface Shape {
  size: number
}

export const SCALE = 2

export function area(shape: Shape): number {
  return shape.size * SCALE
}

export function describe(shape: Shape): string {
  return \`area \${area(shape)}\`
}
`

function lineOf(text: string, line: string): number {
  const index = text.split("\n").indexOf(line)
  assert.notEqual(index, -1, `missing line: ${line}`)
  return index + 1
}

test("a later move reads the project the earlier move saved", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const first = project.move("src/shapes.ts", 11, 13, "src/describe.ts")
    assert.equal(first.kind, "accepted")
    assert.match(
      project.read("src/describe.ts"),
      /^import \{ type Shape, area \} from "\.\/shapes\.js"$/m,
    )

    // The second range refers to the source as the first move left it.
    const source = project.read("src/shapes.ts")
    const start = lineOf(source, "export function area(shape: Shape): number {")
    const second = project.move(
      "src/shapes.ts",
      start,
      start + 2,
      "src/area.ts",
    )

    assert.equal(second.kind, "accepted")
    assert.deepEqual(
      second.statements.map(({ firstLine }) => firstLine),
      ["export function area(shape: Shape): number {"],
    )
    // The first target follows area to the second target.
    const described = project.read("src/describe.ts")
    assert.match(described, /^import \{ area \} from "\.\/area\.js"$/m)
    assert.match(described, /^import \{ type Shape \} from "\.\/shapes\.js"$/m)
    assert.doesNotMatch(project.read("src/shapes.ts"), /function area/)
  })
})
