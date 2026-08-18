import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import type {
  DependencyEdge,
  DependencyGraph,
} from "../dependency-cruiser-runner.js"
import { productProcessLaunchInventory } from "../product-process-launch-inventory.js"
import { checkProductProcessLaunches } from "../product-process-launches.js"

const CODEX_SDK_HOST_ENTRY =
  "packages/integrations-llm/src/codex/sdk-host-entry.ts"
const CODEX_SDK_HOST_SERVER =
  "packages/integrations-llm/src/codex/sdk-host-server.ts"
const CODEX_RUNNER = "packages/integrations-llm/src/codex/runner.ts"

const REGISTERED_SOURCES: Record<string, string> = {
  "packages/host-node/src/posix-child-process-lifetime-adapter.ts":
    'import { spawn } from "node:child_process"\nvoid spawn\n',
  "packages/host-node/src/windows-child-process-lifetime-adapter.ts":
    'import { spawn } from "node:child_process"\nvoid spawn\n',
  "packages/host-node/resources/host-child-lifetime/windows-launcher.cjs":
    'const { spawn } = require("node:child_process")\nvoid spawn\n',
  [CODEX_SDK_HOST_ENTRY]: 'import "./sdk-host-server.js"\n',
  [CODEX_SDK_HOST_SERVER]: 'import "./runner.js"\n',
  [CODEX_RUNNER]: 'import { Codex } from "@openai/codex-sdk"\nvoid Codex\n',
}

function registeredOwnerGraph(): DependencyGraph {
  return new Map([
    [
      CODEX_SDK_HOST_ENTRY,
      [runtimeEdge("./sdk-host-server.js", CODEX_SDK_HOST_SERVER)],
    ],
    [CODEX_SDK_HOST_SERVER, [runtimeEdge("./runner.js", CODEX_RUNNER)]],
    [CODEX_RUNNER, []],
  ])
}

describe("product process launch policy", () => {
  it("records every current launch and its owner", () => {
    assert.deepEqual(productProcessLaunchInventory, [
      {
        id: "posix-child-process-lifetime-adapter",
        file: "packages/host-node/src/posix-child-process-lifetime-adapter.ts",
        mechanism: "node-child-process",
        launchOwner: "platform-adapter",
        launches: [
          "POSIX Git commands",
          "POSIX ProcessPort tool commands",
          "POSIX Claude CLI",
          "POSIX Codex SDK host process entries",
        ],
      },
      {
        id: "windows-launcher-host",
        file: "packages/host-node/src/windows-child-process-lifetime-adapter.ts",
        mechanism: "node-child-process",
        launchOwner: "platform-adapter",
        launches: ["fixed inert Windows launcher"],
      },
      {
        id: "windows-assigned-target",
        file: "packages/host-node/resources/host-child-lifetime/windows-launcher.cjs",
        mechanism: "node-child-process",
        launchOwner: "platform-adapter",
        launches: [
          "Windows Git commands",
          "Windows ProcessPort tool commands",
          "Windows Claude CLI",
          "Windows Codex SDK host process entries",
        ],
      },
      {
        id: "codex-sdk",
        file: "packages/integrations-llm/src/codex/runner.ts",
        mechanism: "codex-sdk",
        launchOwner: "codex-sdk-host-process",
        launches: ["Codex process", "Codex tool descendants"],
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
      checkProductProcessLaunches(
        root,
        [
          ...Object.keys(REGISTERED_SOURCES),
          "packages/domain/src/process-types.ts",
          "packages/domain/src/process-types-2.ts",
          "packages/domain/src/process-types-3.ts",
          "packages/domain/src/process.test.ts",
          "packages/fixture-engine/src/coder.ts",
          "tools/example/src/main.ts",
        ],
        registeredOwnerGraph(),
      ),
      [],
    )
  })

  it("rejects a host-side path to the Codex SDK process launch", async () => {
    const client = "packages/integrations-llm/src/codex/sdk-host-client.ts"
    const files = {
      ...REGISTERED_SOURCES,
      [client]: 'import "./runner.js"\n',
    }
    const root = await createFixture(files)
    const graph = new Map(registeredOwnerGraph())
    graph.set(client, [runtimeEdge("./runner.js", CODEX_RUNNER)])

    const violations = checkProductProcessLaunches(
      root,
      Object.keys(files),
      graph,
    )

    assert.deepEqual(violations, [
      {
        file: client,
        message:
          "production source reaches the Codex SDK process launch outside the fixed Codex SDK host entry",
      },
    ])
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

    const violations = checkProductProcessLaunches(
      root,
      Object.keys(files),
      registeredOwnerGraph(),
    )

    assert.deepEqual(violations, [
      {
        file: "packages/domain/src/direct.ts",
        message:
          "Node child-process launch is outside the child-process lifetime launch-owner inventory",
      },
      {
        file: "packages/application/src/bun.ts",
        message:
          "Bun process launch is outside the child-process lifetime launch-owner inventory",
      },
      {
        file: "apps/cli/src/bun-shell.ts",
        message:
          "Bun process launch is outside the child-process lifetime launch-owner inventory",
      },
      {
        file: "apps/desktop/src/deno.ts",
        message:
          "Deno command launch is outside the child-process lifetime launch-owner inventory",
      },
      {
        file: "packages/application/src/codex.ts",
        message:
          "Codex SDK process launch is outside the child-process lifetime launch-owner inventory",
      },
      {
        file: "packages/application/src/cluster.ts",
        message:
          "Node cluster process launch is outside the child-process lifetime launch-owner inventory",
      },
    ])
  })

  it("rejects stale inventory entries", async () => {
    const files = { ...REGISTERED_SOURCES }
    delete files[CODEX_RUNNER]
    const root = await createFixture(files)

    const violations = checkProductProcessLaunches(
      root,
      Object.keys(files),
      registeredOwnerGraph(),
    )

    assert.deepEqual(violations, [
      {
        file: "packages/integrations-llm/src/codex/runner.ts",
        message:
          'child-process lifetime launch inventory entry "codex-sdk" points to missing product source',
      },
    ])
  })
})

function runtimeEdge(module: string, resolved: string): DependencyEdge {
  return {
    module,
    resolved,
    coreModule: false,
    dependencyTypes: ["import"],
    preCompilationOnly: false,
    typeOnly: false,
  }
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-process-launches-"))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(join(root, file), content)
  }
  return root
}
