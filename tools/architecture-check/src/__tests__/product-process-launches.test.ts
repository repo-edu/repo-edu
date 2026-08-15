import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { productProcessLaunchInventory } from "../product-process-launch-inventory.js"
import { checkProductProcessLaunches } from "../product-process-launches.js"

const REGISTERED_SOURCES: Record<string, string> = {
  "packages/host-node/src/child-process-lifetime.ts":
    'import { spawn } from "node:child_process"\nvoid spawn\n',
  "packages/host-node/src/windows-child-lifetime-platform.ts":
    'import { spawn } from "node:child_process"\nvoid spawn\n',
  "packages/host-node/resources/host-child-lifetime/windows-launcher.cjs":
    'const { spawn } = require("node:child_process")\nvoid spawn\n',
  "packages/integrations-llm/src/codex/runner.ts":
    'import { Codex } from "@openai/codex-sdk"\nvoid Codex\n',
}

describe("product process launch policy", () => {
  it("records every current launch and its target route", () => {
    assert.deepEqual(productProcessLaunchInventory, [
      {
        id: "child-lifetime-adapter",
        file: "packages/host-node/src/child-process-lifetime.ts",
        mechanism: "node-child-process",
        targetRoute: "direct-adapter",
        launches: [
          "POSIX Git commands",
          "POSIX ProcessPort tool commands",
          "POSIX Claude CLI",
          "POSIX managed-helper entries",
        ],
      },
      {
        id: "windows-launcher-host",
        file: "packages/host-node/src/windows-child-lifetime-platform.ts",
        mechanism: "node-child-process",
        targetRoute: "direct-adapter",
        launches: ["fixed inert Windows launcher"],
      },
      {
        id: "windows-assigned-target",
        file: "packages/host-node/resources/host-child-lifetime/windows-launcher.cjs",
        mechanism: "node-child-process",
        targetRoute: "direct-adapter",
        launches: [
          "Windows Git commands",
          "Windows ProcessPort tool commands",
          "Windows Claude CLI",
          "Windows managed-helper entries",
        ],
      },
      {
        id: "codex-sdk",
        file: "packages/integrations-llm/src/codex/runner.ts",
        mechanism: "codex-sdk",
        targetRoute: "managed-helper",
        launches: ["Codex SDK child", "Codex tool descendants"],
      },
    ])
  })

  it("accepts the closed inventory and ignores non-runtime sources", async () => {
    const root = await createFixture({
      ...REGISTERED_SOURCES,
      "packages/domain/src/process-types.ts":
        'import type { ChildProcess } from "node:child_process"\nexport type Process = ChildProcess\n',
      "packages/domain/src/process-types-2.ts":
        'export type Process = import("node:child_process").ChildProcess\n',
      "packages/domain/src/process-types-3.ts":
        'export { type ChildProcess } from "node:child_process"\n',
      "packages/domain/src/process.test.ts":
        'import { spawn } from "node:child_process"\nvoid spawn\n',
      "packages/fixture-engine/src/coder.ts":
        'import { spawnSync } from "node:child_process"\nvoid spawnSync\n',
      "tools/example/src/main.ts":
        'import { execFile } from "node:child_process"\nvoid execFile\n',
    })

    assert.deepEqual(
      checkProductProcessLaunches(root, [
        ...Object.keys(REGISTERED_SOURCES),
        "packages/domain/src/process-types.ts",
        "packages/domain/src/process-types-2.ts",
        "packages/domain/src/process-types-3.ts",
        "packages/domain/src/process.test.ts",
        "packages/fixture-engine/src/coder.ts",
        "tools/example/src/main.ts",
      ]),
      [],
    )
  })

  it("rejects unregistered direct and dependency-owned launches", async () => {
    const files = {
      ...REGISTERED_SOURCES,
      "packages/domain/src/direct.ts":
        'import { spawn } from "node:child_process"\nvoid spawn\n',
      "packages/application/src/bun.ts": 'Bun["spawn"](["git"])\n',
      "apps/cli/src/bun-shell.ts": "Bun.$`git status`\n",
      "apps/desktop/src/deno.ts": 'new Deno.Command("git")\n',
      "packages/application/src/codex.ts":
        'import { Codex } from "@openai/codex-sdk/internal"\nvoid Codex\n',
      "packages/application/src/cluster.ts":
        'const cluster = process.getBuiltinModule("node:cluster")\nvoid cluster\n',
    }
    const root = await createFixture(files)

    const violations = checkProductProcessLaunches(root, Object.keys(files))

    assert.deepEqual(violations, [
      {
        file: "packages/domain/src/direct.ts",
        message:
          "Node child-process launch is outside the child-lifetime direct-adapter and managed-helper inventory",
      },
      {
        file: "packages/application/src/bun.ts",
        message:
          "Bun process launch is outside the child-lifetime direct-adapter and managed-helper inventory",
      },
      {
        file: "apps/cli/src/bun-shell.ts",
        message:
          "Bun process launch is outside the child-lifetime direct-adapter and managed-helper inventory",
      },
      {
        file: "apps/desktop/src/deno.ts",
        message:
          "Deno command launch is outside the child-lifetime direct-adapter and managed-helper inventory",
      },
      {
        file: "packages/application/src/codex.ts",
        message:
          "Codex SDK process launch is outside the child-lifetime direct-adapter and managed-helper inventory",
      },
      {
        file: "packages/application/src/cluster.ts",
        message:
          "Node cluster process launch is outside the child-lifetime direct-adapter and managed-helper inventory",
      },
    ])
  })

  it("rejects stale inventory entries", async () => {
    const files = { ...REGISTERED_SOURCES }
    delete files["packages/integrations-llm/src/codex/runner.ts"]
    const root = await createFixture(files)

    const violations = checkProductProcessLaunches(root, Object.keys(files))

    assert.deepEqual(violations, [
      {
        file: "packages/integrations-llm/src/codex/runner.ts",
        message:
          'child-lifetime launch inventory entry "codex-sdk" points to missing product source',
      },
    ])
  })
})

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-process-launches-"))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(join(root, file), content)
  }
  return root
}
