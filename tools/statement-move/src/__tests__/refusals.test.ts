import assert from "node:assert/strict"
import * as path from "node:path"
import { test } from "node:test"
import { withProject } from "./fixture-project.js"

// A move that adds a TypeScript 6 diagnostic is refused, and the package keeps
// every file byte for byte. A name the target already declares adds diagnostic
// 2451 with the published engine and with the patched one alike.

test("refuses the move of a name that the target already declares", () => {
  withProject(
    {
      "src/limits.ts": `export const LIMIT = 1

export const DOUBLE = LIMIT * 2
`,
      "src/fixture.ts": `export const LIMIT = 2
`,
    },
    (project) => {
      const before = project.snapshot()
      const result = project.move("src/limits.ts", 1, 1, "src/fixture.ts")

      assert.equal(result.kind, "refused")
      assert.ok(
        result.kind === "refused" &&
          result.diagnostics.length > 0 &&
          result.diagnostics.every(
            (diagnostic) =>
              diagnostic.code === 2451 &&
              diagnostic.path === path.join("pkg", "src", "fixture.ts"),
          ),
      )
      assert.deepEqual(project.snapshot(), before)
    },
  )
})
