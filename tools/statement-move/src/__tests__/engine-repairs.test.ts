import assert from "node:assert/strict"
import * as path from "node:path"
import { test } from "node:test"
import { withProject } from "./fixture-project.js"

// Moves through the patched TypeScript 6 engine. Seven tests prove a shape
// that the patch repairs, and they fail when the patch is missing. Two prove a
// limit of the repairs: a result of the published engine that the patch keeps.

// The default export of `checks` makes TypeScript give each `import * as` of
// it a symbol of its own, so a repair must compare those imports by module.
// Like `node:path`, `separators` exports one object through `export =`, so a
// default import and an `import * as` of it resolve to the same symbol. Its
// namespace lets the engine write an `import * as` of it.
const MODULES = `declare module "assertion" {
  function assertion(value: unknown): void
  namespace assertion {
    function equal(actual: unknown, expected: unknown): void
  }
  export = assertion
}

declare module "checks" {
  export function equal(actual: unknown, expected: unknown): void
  export default function ok(value: unknown): void
}

declare module "separators" {
  namespace separators {
    type Name = "posix" | "windows"
  }
  const separators: Record<separators.Name, string>
  export = separators
}

declare module "runner" {
  export function test(name: string, body: () => void): void
}
`

function linesMatching(text: string, pattern: RegExp): string[] {
  return text.split("\n").filter((line) => pattern.test(line))
}

test("imports a moved declaration that the source uses only as a short-form property", () => {
  withProject(
    {
      "src/round.ts": `export const cacheRoot = "/tmp/cache"

export function options() {
  return { cacheRoot }
}
`,
    },
    (project) => {
      const result = project.move("src/round.ts", 1, 1, "src/fixture.ts")

      assert.equal(result.kind, "accepted")
      assert.match(
        project.read("src/fixture.ts"),
        /^export const cacheRoot = "\/tmp\/cache"$/m,
      )
      assert.match(
        project.read("src/round.ts"),
        /^import \{ cacheRoot \} from "\.\/fixture\.js"$/m,
      )
    },
  )
})

test("writes no second default import into a target that already has it", () => {
  withProject(
    {
      "src/modules.d.ts": MODULES,
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
      const result = project.move("src/cases.ts", 3, 5, "src/fixture.ts")

      assert.equal(result.kind, "accepted")
      const target = project.read("src/fixture.ts")
      assert.deepEqual(linesMatching(target, /^import /), [
        `import assertion from "assertion"`,
      ])
      assert.match(
        target,
        /^export function check\(value: unknown\): void \{$/m,
      )
    },
  )
})

test("writes no second import * as name into a target that already has it", () => {
  withProject(
    {
      "src/modules.d.ts": MODULES,
      "src/cases.ts": `import * as checks from "checks"

export function check(value: unknown): void {
  checks.equal(value, 1)
}

export function other(): void {
  checks.equal(1, 1)
}
`,
      "src/fixture.ts": `import * as checks from "checks"

export function base(): void {
  checks.equal(0, 0)
}
`,
    },
    (project) => {
      const result = project.move("src/cases.ts", 3, 5, "src/fixture.ts")

      assert.equal(result.kind, "accepted")
      const target = project.read("src/fixture.ts")
      assert.deepEqual(linesMatching(target, /^import /), [
        `import * as checks from "checks"`,
      ])
      assert.match(
        target,
        /^export function check\(value: unknown\): void \{$/m,
      )
    },
  )
})

test("a list adds each name the target lacks for a default or import * as name and then reuses it", () => {
  withProject(
    {
      "src/modules.d.ts": MODULES,
      "src/cases.ts": `import assertion from "assertion"
import verify from "assertion"
import * as checks from "checks"

export function check(value: unknown): void {
  assertion.equal(value, 1)
  verify.equal(value, 1)
  checks.equal(value, 1)
}

export function recheck(value: unknown): void {
  assertion.equal(value, 2)
}
`,
      "src/fixture.ts": `import verify from "assertion"
import * as rules from "checks"

export function base(): void {
  verify.equal(0, 0)
  rules.equal(0, 0)
}
`,
    },
    (project) => {
      const reply = project.attemptList("src/cases.ts", [
        {
          target: "src/fixture.ts",
          ranges: [
            { start: 5, end: 9 },
            { start: 11, end: 13 },
          ],
        },
      ])

      assert.equal(reply.outcome, "clean", JSON.stringify(reply))
      assert.ok(reply.outcome === "clean")
      const target = reply.files.find(
        (file) => file.path === path.join("pkg", "src", "fixture.ts"),
      )
      assert.deepEqual(linesMatching(target?.text ?? "", /^import /).sort(), [
        `import * as checks from "checks"`,
        `import * as rules from "checks"`,
        `import assertion from "assertion"`,
        `import verify from "assertion"`,
      ])
      assert.match(target?.text ?? "", /export function check\(/)
      assert.match(target?.text ?? "", /export function recheck\(/)
    },
  )
})

test("a list sends two ranges that use one default import to one new target", () => {
  withProject(
    {
      "src/modules.d.ts": MODULES,
      "src/cases.ts": `import assertion from "assertion"

export function first(value: unknown): void {
  assertion.equal(value, 1)
}

export function middle(value: unknown): void {
  assertion.equal(value, 2)
}

export function last(value: unknown): void {
  assertion.equal(value, 3)
}
`,
    },
    (project) => {
      const reply = project.attemptList("src/cases.ts", [
        {
          target: "src/checks.ts",
          ranges: [
            { start: 3, end: 5 },
            { start: 11, end: 13 },
          ],
        },
      ])

      assert.equal(reply.outcome, "clean", JSON.stringify(reply))
      assert.ok(reply.outcome === "clean")
      const target = reply.files.find(
        (file) => file.path === path.join("pkg", "src", "checks.ts"),
      )
      assert.deepEqual(linesMatching(target?.text ?? "", /^import /), [
        `import assertion from "assertion"`,
      ])
      assert.match(target?.text ?? "", /export function first\(/)
      assert.match(target?.text ?? "", /export function last\(/)
    },
  )
})

test("refuses to reuse a default import for an import * as name of the same name", () => {
  withProject(
    {
      "src/modules.d.ts": MODULES,
      "src/cases.ts": `import * as separators from "separators"

export function posix(): string {
  return separators.posix
}
`,
      "src/fixture.ts": `import separators from "separators"

export function windows(): string {
  return separators.windows
}
`,
    },
    (project) => {
      const before = project.snapshot()
      const result = project.move("src/cases.ts", 3, 5, "src/fixture.ts")

      assert.equal(result.kind, "refused")
      assert.deepEqual(project.snapshot(), before)
    },
  )
})

test("moves a top-level loop without taking its loop name for a name of the file", () => {
  withProject(
    {
      "src/modules.d.ts": MODULES,
      "src/cases.ts": `import { test } from "runner"

export const CASES = ["first", "second"]

for (const name of CASES) {
  test(name, () => {})
}
`,
    },
    (project) => {
      const result = project.move("src/cases.ts", 5, 7, "src/run.ts")

      assert.equal(result.kind, "accepted")
      const target = project.read("src/run.ts")
      assert.deepEqual(linesMatching(target, /^import /).sort(), [
        `import { CASES } from "./cases.js"`,
        `import { test } from "runner"`,
      ])
      assert.match(target, /^for \(const name of CASES\) \{$/m)
      assert.doesNotMatch(project.read("src/cases.ts"), /^for /m)
    },
  )
})

test("moves a top-level try statement without taking its catch name for a name of the file", () => {
  withProject(
    {
      "src/results.ts": `export const RESULTS: string[] = []

try {
  RESULTS.push(String(JSON.parse("1")))
} catch (error) {
  RESULTS.push(String(error))
}
`,
    },
    (project) => {
      const result = project.move("src/results.ts", 3, 7, "src/parse.ts")

      assert.equal(result.kind, "accepted")
      const target = project.read("src/parse.ts")
      assert.deepEqual(linesMatching(target, /^import /), [
        `import { RESULTS } from "./results.js"`,
      ])
      assert.match(target, /^\} catch \(error\) \{$/m)
      assert.doesNotMatch(project.read("src/results.ts"), /try|catch/)
    },
  )
})

// A `var` in a loop's head stays a name of the file. A global of the same name
// and type, such as the DOM's `origin`, would let a reader cut off from it read
// the global with no new diagnostic.
test("imports the var of a loop's head into a moved reader", () => {
  withProject(
    {
      "src/globals.d.ts": `declare var origin: string
`,
      "src/source.ts": `for (var origin of ["course"]) {}

export { origin }

export function read(): string {
  return origin
}
`,
    },
    (project) => {
      const result = project.move("src/source.ts", 5, 7, "src/reader.ts")

      assert.equal(result.kind, "accepted")
      assert.deepEqual(
        linesMatching(project.read("src/reader.ts"), /^import /),
        [`import { origin } from "./source.js"`],
      )
    },
  )
})
