import assert from "node:assert/strict"
import * as path from "node:path"
import { test } from "node:test"
import { withProject } from "./fixture-project.js"

// Moves through the patched TypeScript 6 engine. Some tests prove a shape that
// the patch repairs, and they fail when the patch is missing. The others prove
// a result of the published engine that the repairs must keep.

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

function labelReader(module: string): string {
  return `import label from "${module}"

export function read(): string {
  return String(label)
}
`
}

const VALUE = `export default "value"
`

// The target holds the default export that the moved code imports as `label`,
// while its own `label` names another value.
for (const { holder, files } of [
  {
    holder: "a named import of it",
    files: {
      "src/value.ts": VALUE,
      "src/source.ts": labelReader("./value.js"),
      "src/target.ts": `import { default as saved } from "./value.js"

const label = "target"

export const both = [saved, label]
`,
    },
  },
  {
    holder: "its declaration",
    files: {
      "src/source.ts": labelReader("./target.js"),
      "src/target.ts": `export default "value"

const label = "target"

export const own = label
`,
    },
  },
]) {
  test(`refuses a moved default import whose name the target gives another value beside ${holder}`, () => {
    withProject(files, (project) => {
      const before = project.snapshot()
      const result = project.move("src/source.ts", 3, 5, "src/target.ts")

      assert.equal(result.kind, "refused")
      assert.deepEqual(project.snapshot(), before)
    })
  })
}

// The target's `label` names the default export that the moved code imports.
for (const { holder, files } of [
  {
    holder: "a named import",
    files: {
      "src/value.ts": VALUE,
      "src/source.ts": labelReader("./value.js"),
      "src/target.ts": `import { default as label } from "./value.js"

export const held = label
`,
    },
  },
  {
    holder: "its own declaration",
    files: {
      "src/source.ts": labelReader("./target.js"),
      "src/target.ts": `export default function label(): string {
  return "value"
}
`,
    },
  },
]) {
  test(`reuses the target's binding of the moved default import through ${holder}`, () => {
    withProject(files, (project) => {
      const before = linesMatching(project.read("src/target.ts"), /^import /)
      const result = project.move("src/source.ts", 3, 5, "src/target.ts")

      assert.equal(result.kind, "accepted")
      const target = project.read("src/target.ts")
      assert.deepEqual(linesMatching(target, /^import /), before)
      assert.match(target, /^export function read\(\): string \{$/m)
    })
  })
}

// One wildcard declaration types the default import of every `*.wasm?url`
// file, so its symbol cannot tell two files apart. The engine writes the
// moved code's own import and stops.
test("stops on an import that a wildcard declaration types and writes nothing", () => {
  withProject(
    {
      "src/wasm-url.d.ts": `declare module "*.wasm?url" {
  const url: string
  export default url
}
`,
      "src/source.ts": `import url from "./first.wasm?url"

export function read(): string {
  return url
}
`,
      "src/target.ts": `import url from "./second.wasm?url"

export const second = url
`,
    },
    (project) => {
      const before = project.snapshot()

      assert.throws(
        () => project.move("src/source.ts", 3, 5, "src/target.ts"),
        /Expected symbol to be a module/,
      )
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

// A global of the same name and type, such as the DOM's `origin`, would let a
// reader cut off from a name of the file read the global with no new
// diagnostic.
const ORIGIN_GLOBAL = `declare var origin: string
`

// A top-level loop's `var` belongs to the file, and so does a name that a
// destructuring pattern declares in a top-level loop or statement.
for (const declaration of [
  `for (var origin of ["course"]) {}`,
  `for (var { origin } of [{ origin: "course" }]) {}`,
  `const { origin } = { origin: "course" }`,
]) {
  test(`imports the file's name into a moved reader: ${declaration}`, () => {
    withProject(
      {
        "src/globals.d.ts": ORIGIN_GLOBAL,
        "src/source.ts": `${declaration}

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
}

test("refuses to move a loop away from a reader of its var", () => {
  withProject(
    {
      "src/globals.d.ts": ORIGIN_GLOBAL,
      "src/source.ts": `for (var origin of ["course"]) {}

export function read(): string {
  return origin
}
`,
    },
    (project) => {
      const before = project.snapshot()
      const result = project.move("src/source.ts", 1, 1, "src/loop.ts")

      assert.equal(result.kind, "refused")
      assert.deepEqual(project.snapshot(), before)
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
