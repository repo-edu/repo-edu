import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { runBespokeChecks } from "../bespoke-checks.js"

describe("bespoke checks", () => {
  it("keeps non-source TypeScript files in claude-coder confinement", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-bespoke-"))
    await writeFile(join(root, "package.json"), "{}")
    await mkdir(join(root, "tools/config"), { recursive: true })
    await writeFile(
      join(root, "tools/config/build.ts"),
      'import "@repo-edu/claude-coder"\n',
    )

    const violations = runBespokeChecks(
      root,
      { files: [], fileSet: new Set() },
      () => ["tools/config/build.ts"],
    )

    assert.match(
      violations.map((violation) => violation.message).join("\n"),
      /outside fixture-engine/,
    )
  })

  it("checks non-source CommonJS and import-equals imports", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-bespoke-"))
    await writeFile(join(root, "package.json"), "{}")
    await mkdir(join(root, "tools/config"), { recursive: true })
    await writeFile(
      join(root, "tools/config/build.ts"),
      [
        'import { createRequire } from "node:module"',
        "const configRequire = createRequire(import.meta.url)",
        'configRequire("@repo-edu/claude-coder")',
      ].join("\n"),
    )
    await writeFile(
      join(root, "tools/config/import-equals.ts"),
      'import coder = require("@repo-edu/claude-coder")\n',
    )

    const violations = runBespokeChecks(
      root,
      { files: [], fileSet: new Set() },
      () => ["tools/config/build.ts", "tools/config/import-equals.ts"],
    )

    assert.equal(
      violations.filter((violation) =>
        /outside fixture-engine/.test(violation.message),
      ).length,
      2,
    )
  })

  it("checks non-source TypeScript import-type references", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-bespoke-"))
    await writeFile(join(root, "package.json"), "{}")
    await mkdir(join(root, "tools/config"), { recursive: true })
    await writeFile(
      join(root, "tools/config/types.ts"),
      'export type Coder = import("@repo-edu/claude-coder").Coder\n',
    )

    const violations = runBespokeChecks(
      root,
      { files: [], fileSet: new Set() },
      () => ["tools/config/types.ts"],
    )

    assert.match(
      violations.map((violation) => violation.message).join("\n"),
      /outside fixture-engine/,
    )
  })
})
