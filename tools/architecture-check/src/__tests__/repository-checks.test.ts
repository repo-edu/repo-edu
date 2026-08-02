import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import type {
  DependencyEdge,
  DependencyGraph,
} from "../dependency-cruiser-runner.js"
import {
  checkBrowserSafeSourceBoundary,
  checkWorkspaceExportSources,
  checkWorkspaceTestRunner,
} from "../repository-checks.js"

describe("repository checks", () => {
  it("validates exact and wildcard workspace source exports", async () => {
    const root = await createFixture({
      "packages/example/package.json": JSON.stringify({
        exports: {
          ".": { source: "./src/index.ts" },
          "./feature/*": { source: "./src/features/*.ts" },
          "./missing": { source: "./src/missing.ts" },
        },
      }),
      "packages/example/src/index.ts": "export const value = true\n",
      "packages/example/src/features/one.ts": "export const one = true\n",
    })
    const paths = [
      "packages/example/package.json",
      "packages/example/src/index.ts",
      "packages/example/src/features/one.ts",
    ]

    const violations = checkWorkspaceExportSources(root, paths)

    assert.equal(violations.length, 1)
    assert.match(violations[0].message, /src\/missing\.ts/)
  })

  it("applies the Node test convention to TypeScript and TSX tests", async () => {
    const root = await createFixture({
      "apps/example/src/passing.test.ts": [
        'import assert from "node:assert/strict"',
        'import { it } from "node:test"',
        'it("passes", () => assert.ok(true))',
      ].join("\n"),
      "tools/example/src/failing.test.tsx":
        'import { it } from "node:test"\nit("fails", () => {})\n',
    })

    const violations = checkWorkspaceTestRunner(root, [
      "apps/example/src/passing.test.ts",
      "tools/example/src/failing.test.tsx",
    ])

    assert.deepEqual(violations, [
      {
        file: "tools/example/src/failing.test.tsx",
        message: "test source must import node:assert/strict",
      },
    ])
  })

  it("checks the emitted renderer closure and exact independent roots", () => {
    const files = [
      "apps/desktop/src/renderer.ts",
      "apps/desktop/src/UpdateDialog.tsx",
      "packages/renderer-app/src/index.ts",
      "packages/renderer-app/src/types-only.ts",
      "packages/renderer-host-contract/src/index.ts",
      "packages/integrations-llm-contract/src/index.ts",
      "packages/host-runtime-contract/src/index.ts",
      "packages/host-runtime-contract/src/index.test.ts",
      "packages/test-fixtures/src/index.ts",
      "packages/domain/src/outside.ts",
    ]
    const graph: DependencyGraph = new Map([
      [
        "apps/desktop/src/renderer.ts",
        [runtimeEdge("./UpdateDialog", "apps/desktop/src/UpdateDialog.tsx")],
      ],
      [
        "apps/desktop/src/UpdateDialog.tsx",
        [
          runtimeEdge("node:os"),
          runtimeEdge(
            "@repo-edu/renderer-app",
            "packages/renderer-app/src/index.ts",
          ),
        ],
      ],
      [
        "packages/renderer-app/src/index.ts",
        [
          runtimeEdge("node:path"),
          {
            ...runtimeEdge(
              "./types-only",
              "packages/renderer-app/src/types-only.ts",
            ),
            dependencyTypes: ["type-only", "import"],
            preCompilationOnly: true,
            typeOnly: true,
          },
        ],
      ],
      ["packages/renderer-app/src/types-only.ts", [runtimeEdge("node:fs")]],
      [
        "packages/renderer-host-contract/src/index.ts",
        [runtimeEdge("node:buffer")],
      ],
      [
        "packages/integrations-llm-contract/src/index.ts",
        [runtimeEdge("node:crypto")],
      ],
      ["packages/host-runtime-contract/src/index.ts", [runtimeEdge("path")]],
      [
        "packages/host-runtime-contract/src/index.test.ts",
        [runtimeEdge("node:assert/strict")],
      ],
      ["packages/test-fixtures/src/index.ts", [runtimeEdge("node:util")]],
      ["packages/domain/src/outside.ts", [runtimeEdge("node:child_process")]],
    ])

    const violations = checkBrowserSafeSourceBoundary(
      { files, fileSet: new Set(files) },
      graph,
    )

    assert.deepEqual(violations, [
      {
        file: "apps/desktop/src/UpdateDialog.tsx",
        message:
          'browser-safe production source imports Node built-in module "node:os"',
      },
      {
        file: "packages/host-runtime-contract/src/index.ts",
        message:
          'browser-safe production source imports Node built-in module "path"',
      },
      {
        file: "packages/integrations-llm-contract/src/index.ts",
        message:
          'browser-safe production source imports Node built-in module "node:crypto"',
      },
      {
        file: "packages/renderer-app/src/index.ts",
        message:
          'browser-safe production source imports Node built-in module "node:path"',
      },
      {
        file: "packages/renderer-host-contract/src/index.ts",
        message:
          'browser-safe production source imports Node built-in module "node:buffer"',
      },
      {
        file: "packages/test-fixtures/src/index.ts",
        message:
          'browser-safe production source imports Node built-in module "node:util"',
      },
    ])
  })

  it("follows runtime dependencies from independent browser-safe roots", () => {
    const files = [
      "apps/desktop/src/renderer.ts",
      "packages/renderer-host-contract/src/index.ts",
      "packages/domain/src/transitive.ts",
      "packages/domain/src/unreachable.ts",
    ]
    const graph: DependencyGraph = new Map([
      ["apps/desktop/src/renderer.ts", []],
      [
        "packages/renderer-host-contract/src/index.ts",
        [
          runtimeEdge(
            "@repo-edu/domain/transitive",
            "packages/domain/src/transitive.ts",
          ),
        ],
      ],
      ["packages/domain/src/transitive.ts", [runtimeEdge("node:fs")]],
      ["packages/domain/src/unreachable.ts", [runtimeEdge("node:os")]],
    ])

    const violations = checkBrowserSafeSourceBoundary(
      { files, fileSet: new Set(files) },
      graph,
    )

    assert.deepEqual(violations, [
      {
        file: "packages/domain/src/transitive.ts",
        message:
          'browser-safe production source imports Node built-in module "node:fs"',
      },
    ])
  })

  it("rejects runtime imports from production sources into test sources", () => {
    const files = [
      "apps/desktop/src/renderer.ts",
      "packages/renderer-app/src/index.ts",
      "packages/renderer-app/src/__tests__/runtime-helper.ts",
    ]
    const graph: DependencyGraph = new Map([
      [
        "apps/desktop/src/renderer.ts",
        [
          runtimeEdge(
            "@repo-edu/renderer-app",
            "packages/renderer-app/src/index.ts",
          ),
        ],
      ],
      [
        "packages/renderer-app/src/index.ts",
        [
          runtimeEdge(
            "./__tests__/runtime-helper",
            "packages/renderer-app/src/__tests__/runtime-helper.ts",
          ),
        ],
      ],
      [
        "packages/renderer-app/src/__tests__/runtime-helper.ts",
        [runtimeEdge("node:fs")],
      ],
    ])

    const violations = checkBrowserSafeSourceBoundary(
      { files, fileSet: new Set(files) },
      graph,
    )

    assert.deepEqual(violations, [
      {
        file: "packages/renderer-app/src/index.ts",
        message:
          'browser-safe production source imports test source "packages/renderer-app/src/__tests__/runtime-helper.ts"',
      },
    ])
  })
})

function runtimeEdge(module: string, resolved?: string): DependencyEdge {
  return {
    module,
    resolved,
    coreModule: module === "path" || module.startsWith("node:"),
    dependencyTypes: ["import"],
    preCompilationOnly: false,
    typeOnly: false,
  }
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-repository-checks-"))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(join(root, file), content)
  }
  return root
}
