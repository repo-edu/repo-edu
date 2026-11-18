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

test("imports in both directions between the source and the target", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const result = project.move("src/shapes.ts", 7, 9, "src/area.ts")

    assert.equal(result.kind, "accepted")
    assert.match(
      project.read("src/area.ts"),
      /^import \{ type Shape, SCALE \} from "\.\/shapes\.js"$/m,
    )
    assert.match(
      project.read("src/shapes.ts"),
      /^import \{ area \} from "\.\/area\.js"$/m,
    )
  })
})

test("imports a name used only as a type with import type and a runtime name as a value", () => {
  withProject({ "src/shapes.ts": SHAPES }, (project) => {
    const typeOnly = project.move("src/shapes.ts", 1, 3, "src/shape.ts")

    assert.equal(typeOnly.kind, "accepted")
    assert.deepEqual(typeOnly.fixes, [])
    const afterTypeMove = project.read("src/shapes.ts")
    assert.match(
      afterTypeMove,
      /^import type \{ Shape \} from "\.\/shape\.js"$/m,
    )

    const scaleLine =
      afterTypeMove.split("\n").indexOf("export const SCALE = 2") + 1
    const runtime = project.move(
      "src/shapes.ts",
      scaleLine,
      scaleLine,
      "src/scale.ts",
    )

    assert.equal(runtime.kind, "accepted")
    assert.match(
      project.read("src/shapes.ts"),
      /^import \{ SCALE \} from "\.\/scale\.js"$/m,
    )
  })
})

test("moves default and named exports and repoints their importer", () => {
  withProject(
    {
      "src/main.ts": `export default function main(): string {
  return NAME
}

export const NAME = "main"

export const VERSION = 1
`,
      "src/use.ts": `import main from "./main.js"
import { NAME, VERSION } from "./main.js"

export const summary = \`\${main()} \${NAME} \${VERSION}\`
`,
    },
    (project) => {
      const result = project.move("src/main.ts", 1, 5, "src/entry.ts")

      assert.equal(result.kind, "accepted")
      const target = project.read("src/entry.ts")
      assert.match(target, /^export default function main\(\): string \{$/m)
      assert.match(target, /^export const NAME = "main"$/m)
      const importer = project.read("src/use.ts")
      assert.match(importer, /^import main from "\.\/entry\.js"$/m)
      assert.match(importer, /^import \{ NAME \} from "\.\/entry\.js"$/m)
      assert.match(importer, /^import \{ VERSION \} from "\.\/main\.js"$/m)
    },
  )
})

test("an importer in the same project follows a moved export to the target", () => {
  withProject(
    {
      "src/shapes.ts": SHAPES,
      "src/__tests__/shapes.test.ts": `import { describe, type Shape } from "../shapes.js"

const shape: Shape = { size: 1 }

export const described = describe(shape)
`,
    },
    (project) => {
      const result = project.move("src/shapes.ts", 11, 13, "src/describe.ts")

      assert.equal(result.kind, "accepted")
      assert.ok(
        result.kind === "accepted" &&
          result.files.some((file) =>
            file.path.endsWith("src/__tests__/shapes.test.ts"),
          ),
      )
      const importer = project.read("src/__tests__/shapes.test.ts")
      assert.match(
        importer,
        /^import \{ describe \} from "\.\.\/describe\.js"$/m,
      )
      assert.match(
        importer,
        /^import \{ type Shape \} from "\.\.\/shapes\.js"$/m,
      )
    },
  )
})

const LIMITED = (specifier: string) => `import { LIMIT } from "${specifier}"

export function grow(size: number): number {
  return Math.min(size + 1, LIMIT)
}

export const START = grow(0)
`

test("writes .js endings when the source's first relative import has one", () => {
  withProject(
    {
      "src/lib.ts": "export const LIMIT = 3\n",
      "src/sizes.ts": LIMITED("./lib.js"),
    },
    (project) => {
      const result = project.move("src/sizes.ts", 3, 5, "src/grow.ts")

      assert.equal(result.kind, "accepted")
      assert.equal(result.importEnding, "js")
      assert.match(
        project.read("src/grow.ts"),
        /^import \{ LIMIT \} from "\.\/lib\.js"$/m,
      )
      assert.match(
        project.read("src/sizes.ts"),
        /^import \{ grow \} from "\.\/grow\.js"$/m,
      )
    },
  )
})

test("writes no extension when the source's first relative import has none", () => {
  withProject(
    {
      "src/lib.ts": "export const LIMIT = 3\n",
      "src/sizes.ts": LIMITED("./lib"),
    },
    (project) => {
      const result = project.move("src/sizes.ts", 3, 5, "src/grow.ts")

      assert.equal(result.kind, "accepted")
      assert.equal(result.importEnding, "minimal")
      assert.match(
        project.read("src/grow.ts"),
        /^import \{ LIMIT \} from "\.\/lib"$/m,
      )
      assert.match(
        project.read("src/sizes.ts"),
        /^import \{ grow \} from "\.\/grow"$/m,
      )
    },
  )
})
