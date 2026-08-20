import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import type {
  DependencyEdge,
  DependencyGraph,
} from "../dependency-cruiser-runner.js"
import { checkDesktopRuntimeDependencyOwnership } from "../desktop-runtime-dependency-checks.js"
import type { SourceInventory } from "../inventory.js"

const MAIN_ENTRY = "apps/desktop/src/main.ts"
const CODEX_ENTRY = "packages/integrations-llm/src/codex/sdk-host-entry.ts"
const EXTERNALS = "apps/desktop/src/desktop-runtime-externals.json"
const DESKTOP_MANIFEST = "apps/desktop/package.json"

describe("desktop runtime dependency ownership", () => {
  it("accepts protocol imports and a declared direct literal load", async () => {
    const fixture = await runtimeFixture({
      declarations: [
        { fullName: "runtime-package", proof: "rollup" },
        { fullName: "trpc-electron/main", proof: "direct", entry: "main" },
      ],
      desktopDependencies: {
        "runtime-package": "catalog:",
        "trpc-electron": "^0.1.2",
      },
      extraFiles: {
        "packages/runtime-owner/package.json": JSON.stringify({
          dependencies: { "runtime-package": "catalog:" },
        }),
      },
      mainSource: [
        'import { createRequire } from "node:module"',
        'import "runtime-package"',
        'const bunSqlite = "bun:sqlite"',
        "void import(bunSqlite)",
        'createRequire(import.meta.url)("trpc-electron/main")',
      ].join("\n"),
    })

    assert.deepEqual(
      checkDesktopRuntimeDependencyOwnership(
        fixture.root,
        fixture.inventory,
        fixture.graph,
      ),
      [],
    )
  })

  it("rejects a hidden package import and a missing desktop dependency", async () => {
    const fixture = await runtimeFixture({
      declarations: [{ fullName: "hidden-package", proof: "rollup" }],
      desktopDependencies: {},
      mainSource: [
        'const hiddenPackage = "hidden-package"',
        "void import(hiddenPackage)",
      ].join("\n"),
    })

    const violations = checkDesktopRuntimeDependencyOwnership(
      fixture.root,
      fixture.inventory,
      fixture.graph,
    )

    assert.equal(
      violations.some(
        ({ file, message }) =>
          file === MAIN_ENTRY &&
          message.includes(
            'dynamic import of bare package "hidden-package" must use a string literal',
          ),
      ),
      true,
    )
    assert.equal(
      violations.some(
        ({ file, message }) =>
          file === DESKTOP_MANIFEST &&
          message.includes(
            'package root "hidden-package", which is absent from desktop runtime dependencies',
          ),
      ),
      true,
    )
  })

  it("requires catalog references in every repeated manifest", async () => {
    const fixture = await runtimeFixture({
      declarations: [{ fullName: "shared-runtime", proof: "rollup" }],
      desktopDependencies: { "shared-runtime": "1.2.3" },
      extraFiles: {
        "packages/runtime-owner/package.json": JSON.stringify({
          dependencies: { "shared-runtime": "1.2.3" },
        }),
      },
      mainSource: 'import "shared-runtime"',
    })

    const violations = checkDesktopRuntimeDependencyOwnership(
      fixture.root,
      fixture.inventory,
      fixture.graph,
    )

    assert.deepEqual(
      violations
        .filter(({ message }) => message.includes('must use "catalog:"'))
        .map(({ file }) => file)
        .sort(),
      [DESKTOP_MANIFEST, "packages/runtime-owner/package.json"],
    )
  })

  it("rejects a non-literal createRequire load", async () => {
    const fixture = await runtimeFixture({
      declarations: [
        { fullName: "trpc-electron/main", proof: "direct", entry: "main" },
      ],
      desktopDependencies: { "trpc-electron": "^0.1.2" },
      mainSource: [
        'import { createRequire } from "node:module"',
        'const trpcMain = "trpc-electron/main"',
        "createRequire(import.meta.url)(trpcMain)",
      ].join("\n"),
    })

    const violations = checkDesktopRuntimeDependencyOwnership(
      fixture.root,
      fixture.inventory,
      fixture.graph,
    )

    assert.equal(
      violations.some(
        ({ file, message }) =>
          file === MAIN_ENTRY &&
          message.includes("createRequire load must use one string literal"),
      ),
      true,
    )
  })
})

type RuntimeFixtureOptions = {
  readonly declarations: readonly Record<string, string>[]
  readonly desktopDependencies: Readonly<Record<string, string>>
  readonly mainSource: string
  readonly extraFiles?: Readonly<Record<string, string>>
}

async function runtimeFixture(options: RuntimeFixtureOptions): Promise<{
  readonly root: string
  readonly inventory: SourceInventory
  readonly graph: DependencyGraph
}> {
  const files: Record<string, string> = {
    [EXTERNALS]: JSON.stringify(options.declarations),
    [DESKTOP_MANIFEST]: JSON.stringify({
      dependencies: options.desktopDependencies,
    }),
    [MAIN_ENTRY]: options.mainSource,
    [CODEX_ENTRY]: "export {}\n",
    ...options.extraFiles,
  }
  const root = await createFixture(files)
  const sourceFiles = [MAIN_ENTRY, CODEX_ENTRY]
  const worktreePaths = Object.keys(files).sort()
  return {
    root,
    inventory: {
      files: sourceFiles,
      fileSet: new Set(sourceFiles),
      worktreePaths,
    },
    graph: new Map([
      [MAIN_ENTRY, runtimePackageEdges(options.mainSource)],
      [CODEX_ENTRY, []],
    ]),
  }
}

function runtimePackageEdges(source: string): readonly DependencyEdge[] {
  const packageNames = [
    "runtime-package",
    "shared-runtime",
    "hidden-package",
    "node:module",
  ]
  return packageNames
    .filter((packageName) => source.includes(`"${packageName}"`))
    .map((packageName) => ({
      module: packageName,
      coreModule: packageName.startsWith("node:"),
      dependencyTypes: ["import"],
      preCompilationOnly: false,
      typeOnly: false,
    }))
}

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-runtime-dependencies-"))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(root, file, ".."), { recursive: true })
    await writeFile(join(root, file), content)
  }
  return root
}
