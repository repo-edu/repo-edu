import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { compileAreaModel, loadAreaModel } from "../area-model.js"
import { runDependencyCruiserRules } from "../dependency-cruiser-runner.js"
import { buildDependencyCruiserRuleSet } from "../graph-policy.js"
import { ROOT } from "../repo-paths.js"

describe("graph policy", () => {
  it("does not compile cover areas into dependency-cruiser boundaries", () => {
    const model = compileAreaModel(loadAreaModel(ROOT))
    const serialized = JSON.stringify(buildDependencyCruiserRuleSet(model))

    assert.equal(serialized.includes("cover-analysis-workflow"), false)
    assert.equal(serialized.includes("cover-examination-workflow"), false)
    assert.equal(serialized.includes("cover-llm-runtime"), false)
  })

  it("resolves workspace package imports to source paths", async () => {
    const root = await createGraphFixture({
      "packages/domain/src/index.ts": 'import "@repo-edu/application"\n',
      "packages/application/src/index.ts": "export const value = 1\n",
    })

    const violations = await runDependencyCruiserRules(
      root,
      inventory([
        "packages/domain/src/index.ts",
        "packages/application/src/index.ts",
      ]),
      {
        forbidden: [
          {
            name: "domain-not-to-application",
            severity: "error",
            from: { path: "^packages/domain/src/" },
            to: { path: "^packages/application/src/" },
          },
        ],
      },
    )

    assert.match(
      violations.map((violation) => violation.message).join("\n"),
      /domain-not-to-application/,
    )
    assert.equal(violations.length, 1)
  })

  it("fails closed when workspace imports resolve outside the source inventory", async () => {
    const root = await createGraphFixture(
      {
        "packages/domain/src/index.ts": 'import "@repo-edu/application"\n',
        "packages/application/dist/index.js": "export const value = 1\n",
      },
      {
        paths: {
          "@repo-edu/application": ["./packages/application/dist/index.js"],
        },
      },
    )

    const violations = await runDependencyCruiserRules(
      root,
      inventory(["packages/domain/src/index.ts"]),
      {
        forbidden: [
          {
            name: "domain-not-to-application",
            severity: "error",
            from: { path: "^packages/domain/src/" },
            to: { path: "^packages/application/src/" },
          },
        ],
      },
    )

    assert.match(
      violations.map((violation) => violation.message).join("\n"),
      /resolved it outside the source inventory/,
    )
  })

  it("does not apply the workspace projection guard to resolver-only modules", async () => {
    const root = await createGraphFixture({
      "packages/domain/src/index.ts":
        'import "./generated.js"\nexport const value = true\n',
      "packages/domain/src/generated.js": 'import "@repo-edu/application"\n',
      "packages/application/dist/index.js": "export const value = 1\n",
    })

    const violations = await runDependencyCruiserRules(
      root,
      inventory(["packages/domain/src/index.ts"]),
      { forbidden: [] },
    )

    assert.deepEqual(violations, [])
  })

  it("allows generated fixture output as a resolver-only target", async () => {
    const root = await createGraphFixture({
      "apps/docs/src/fixtures/projects/calculator/index.ts":
        'import "./generated/index.js"\n',
      "apps/docs/src/fixtures/projects/calculator/generated/index.ts":
        "export const generated = true\n",
    })

    const violations = await runDependencyCruiserRules(
      root,
      inventory(["apps/docs/src/fixtures/projects/calculator/index.ts"]),
      {
        forbidden: [
          {
            name: "source-inventory-no-circular",
            severity: "error",
            from: { path: "^(?:apps|packages|tools)/[^/]+/src/.+\\.tsx?$" },
            to: {
              circular: true,
              viaOnly: {
                path: "^(?:apps|packages|tools)/[^/]+/src/.+\\.tsx?$",
              },
            },
          },
        ],
      },
    )

    assert.deepEqual(violations, [])
  })

  it("fails whole-source-inventory cycles including type-only cycles", async () => {
    const root = await createGraphFixture({
      "packages/domain/src/a.ts":
        'import type { B } from "./b.js"\nexport type A = B\n',
      "packages/domain/src/b.ts":
        'import type { A } from "./a.js"\nexport type B = A\n',
    })

    const violations = await runDependencyCruiserRules(
      root,
      inventory(["packages/domain/src/a.ts", "packages/domain/src/b.ts"]),
      {
        forbidden: [
          {
            name: "source-inventory-no-circular",
            severity: "error",
            from: { path: "^(?:apps|packages|tools)/[^/]+/src/.+\\.tsx?$" },
            to: {
              circular: true,
              viaOnly: {
                path: "^(?:apps|packages|tools)/[^/]+/src/.+\\.tsx?$",
              },
            },
          },
        ],
      },
    )

    assert.match(
      violations.map((violation) => violation.message).join("\n"),
      /source-inventory-no-circular/,
    )
  })

  it("does not fail cycles that leave the exact source inventory", async () => {
    const root = await createGraphFixture({
      "packages/domain/src/a.ts":
        'import { b } from "../scripts/b.js"\nexport const a = b\n',
      "packages/domain/scripts/b.ts":
        'import { a } from "../src/a.js"\nexport const b = a\n',
    })
    const model = compileAreaModel(loadAreaModel(ROOT))

    const violations = await runDependencyCruiserRules(
      root,
      inventory(["packages/domain/src/a.ts"]),
      buildDependencyCruiserRuleSet(
        model,
        inventory(["packages/domain/src/a.ts"]),
      ),
    )

    assert.deepEqual(violations, [])
  })

  it("keeps the cross-layer test helper exception explicit", async () => {
    const root = await createGraphFixture({
      "packages/domain/src/__tests__/helper.test.ts":
        'import "@repo-edu/application"\n',
      "packages/application/src/index.ts": "export const value = 1\n",
    })

    const violations = await runDependencyCruiserRules(
      root,
      inventory([
        "packages/domain/src/__tests__/helper.test.ts",
        "packages/application/src/index.ts",
      ]),
      {
        forbidden: [
          {
            name: "domain-not-to-application",
            severity: "error",
            from: {
              path: "^packages/domain/src/",
              pathNot: "(^|/)__tests__/",
            },
            to: { path: "^packages/application/src/" },
          },
        ],
      },
    )

    assert.deepEqual(violations, [])
  })

  it("confines claude-coder without blocking its internal imports", async () => {
    const root = await createGraphFixture({
      "packages/domain/src/index.ts": 'import "@repo-edu/claude-coder"\n',
      "packages/claude-coder/src/index.ts": 'import "./claude/coder.js"\n',
      "packages/claude-coder/src/claude/coder.ts":
        "export const coder = true\n",
    })
    const model = compileAreaModel(loadAreaModel(ROOT))

    const violations = await runDependencyCruiserRules(
      root,
      inventory([
        "packages/domain/src/index.ts",
        "packages/claude-coder/src/index.ts",
        "packages/claude-coder/src/claude/coder.ts",
      ]),
      buildDependencyCruiserRuleSet(model),
    )
    const messages = violations
      .map((violation) => `${violation.file}: ${violation.message}`)
      .join("\n")

    assert.match(messages, /claude-coder-confined-to-fixture-engine/)
    assert.deepEqual(
      violations.filter((violation) =>
        violation.file.startsWith("packages/claude-coder/src/"),
      ),
      [],
    )
  })
})

async function createGraphFixture(
  files: Record<string, string>,
  options?: {
    readonly paths?: Record<string, readonly string[]>
  },
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-architecture-"))
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", type: "module" }),
  )
  await writeFile(
    join(root, "tsconfig.base.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2024",
        paths: {
          "@repo-edu/application": ["./packages/application/src/index.ts"],
          "@repo-edu/claude-coder": ["./packages/claude-coder/src/index.ts"],
          ...options?.paths,
        },
      },
    }),
  )

  for (const [file, contents] of Object.entries(files)) {
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(join(root, file), contents)
  }

  return root
}

function inventory(files: readonly string[]) {
  return {
    files,
    fileSet: new Set(files),
  }
}
