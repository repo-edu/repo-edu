import assert from "node:assert/strict"
import * as path from "node:path"
import { test } from "node:test"
import { withProject } from "./fixture-project.js"

// The engine defects that no language-service fix corrects. Each move is
// refused, and the package keeps every file byte for byte.

test("refuses the duplicate import the engine adds to an existing target", () => {
  withProject(
    {
      "src/modules.d.ts": `declare module "checks" {
  export function equal(actual: unknown, expected: unknown): void
}

declare module "assertion" {
  import * as checks from "checks"
  export = checks
}
`,
      "src/cases.ts": `import assertion from "assertion"

export function check(value: unknown): void {
  assertion.equal(value, 1)
}

export function other(): void {
  assertion.equal(1, 1)
}
`,
      "src/fixture.ts": `import assertion from "assertion"

export function base(): void {
  assertion.equal(0, 0)
}
`,
    },
    (project) => {
      const before = project.snapshot()
      const result = project.move("src/cases.ts", 3, 5, "src/fixture.ts")

      assert.equal(result.kind, "refused")
      assert.ok(
        result.kind === "refused" &&
          result.diagnostics.length > 0 &&
          result.diagnostics.every(
            (diagnostic) =>
              diagnostic.code === 2300 &&
              diagnostic.path === path.join("pkg", "src", "fixture.ts"),
          ),
      )
      assert.deepEqual(project.snapshot(), before)
    },
  )
})

test("refuses the missing import of a moved declaration the source still uses", () => {
  withProject(
    {
      "src/round.ts": `export const cacheRoot = "/tmp/cache"

export function options() {
  return { cacheRoot }
}
`,
    },
    (project) => {
      const before = project.snapshot()
      const result = project.move("src/round.ts", 1, 1, "src/fixture.ts")

      assert.equal(result.kind, "refused")
      assert.ok(
        result.kind === "refused" &&
          result.diagnostics.some(
            (diagnostic) =>
              diagnostic.code === 18004 &&
              diagnostic.path === path.join("pkg", "src", "round.ts"),
          ),
      )
      assert.deepEqual(project.snapshot(), before)
    },
  )
})
