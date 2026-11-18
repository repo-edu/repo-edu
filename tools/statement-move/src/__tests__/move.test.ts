import assert from "node:assert/strict"
import { test } from "node:test"
import { MoveInputError } from "../input-error.js"
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

test("moves statements to a new target and imports them back into the source", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const result = project.move("src/shapes.ts", 11, 13, "src/describe.ts")

    assert.equal(result.kind, "accepted")
    assert.deepEqual(
      result.statements.map(({ startLine, endLine }) => [startLine, endLine]),
      [[11, 13]],
    )
    assert.ok(
      result.kind === "accepted" &&
        result.files.some(
          (file) => file.path.endsWith("src/describe.ts") && file.isNew,
        ),
    )
    const target = project.read("src/describe.ts")
    assert.match(target, /export function describe\(shape: Shape\): string \{/)
    assert.match(target, /from "\.\/shapes\.js"/)
    assert.doesNotMatch(project.read("src/shapes.ts"), /function describe/)
  })
})

test("moves statements into an existing target", () => {
  withProject(
    {
      "src/shapes.ts": SHAPES,
      "src/report.ts": `export const REPORT_TITLE = "Shapes"\n`,
    },
    (project) => {
      const result = project.move("src/shapes.ts", 11, 13, "src/report.ts")

      assert.equal(result.kind, "accepted")
      const target = project.read("src/report.ts")
      assert.match(target, /export const REPORT_TITLE = "Shapes"/)
      assert.match(target, /export function describe\(shape: Shape\)/)
      assert.ok(
        result.kind === "accepted" && result.files.every((file) => !file.isNew),
      )
    },
  )
})

test("removes type from a value the engine imports with import type", () => {
  withProject(
    {
      "src/modules.d.ts": `declare module "assertion" {
  function assertion(value: unknown): void
  namespace assertion {
    function equal(actual: unknown, expected: unknown): void
  }
  export = assertion
}

declare module "runner" {
  export function test(name: string, body: () => void): void
}
`,
      "src/cases.test.ts": `import assertion from "assertion"
import { test } from "runner"

test("first", () => {
  assertion.equal(1, 1)
})

test("second", () => {
  assertion.equal(2, 2)
})
`,
    },
    (project) => {
      const result = project.move(
        "src/cases.test.ts",
        8,
        10,
        "src/second.test.ts",
      )

      assert.equal(result.kind, "accepted")
      assert.equal(result.fixes.length, 1)
      assert.match(result.fixes[0], /Remove 'type' from import declaration/)
      const target = project.read("src/second.test.ts")
      assert.match(target, /^import assertion from "assertion"$/m)
      assert.doesNotMatch(target, /import type/)
    },
  )
})

test("marks a type with type when the engine imports it as a value", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const result = project.move("src/shapes.ts", 7, 9, "src/area.ts")

    assert.equal(result.kind, "accepted")
    assert.equal(result.fixes.length, 1)
    assert.match(result.fixes[0], /type Shape/)
    assert.match(
      project.read("src/area.ts"),
      /import \{ type Shape, SCALE \} from "\.\/shapes\.js"/,
    )
  })
})

test("rejects a range that cuts a top-level statement", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const before = project.snapshot()

    assert.throws(
      () => project.move("src/shapes.ts", 8, 9, "src/area.ts"),
      (error: unknown) =>
        error instanceof MoveInputError &&
        /cut the top-level statement at lines 7-9/.test(error.message),
    )
    assert.deepEqual(project.snapshot(), before)
  })
})

test("rejects a package whose typecheck script names no configuration", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    project.write(
      "package.json",
      JSON.stringify({
        name: "fixture",
        scripts: { typecheck: "astro check" },
      }),
    )

    assert.throws(
      () => project.move("src/shapes.ts", 11, 13, "src/describe.ts"),
      (error: unknown) =>
        error instanceof MoveInputError &&
        /pkg: its typecheck script "astro check" names no tsc -p configuration/.test(
          error.message,
        ),
    )
    assert.equal(project.exists("src/describe.ts"), false)
  })
})
