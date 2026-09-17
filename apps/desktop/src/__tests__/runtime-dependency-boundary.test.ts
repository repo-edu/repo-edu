import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { build } from "esbuild"
import {
  type DesktopRuntimeBundle,
  desktopRuntimeExternalPackageRoots,
  desktopRuntimeExternals,
  isDesktopRuntimeExternalId,
  isRuntimeSuppliedLoadName,
  packageRootForLoadName,
  type RuntimeDependencyResolvers,
  validateDesktopRuntimeBundle,
} from "../runtime-dependency-boundary.js"

function runtimeBundle(options?: {
  readonly mainImports?: readonly string[]
  readonly mainDynamicImports?: readonly string[]
  readonly hostImports?: readonly string[]
}): DesktopRuntimeBundle {
  return {
    "main.js": {
      type: "chunk",
      fileName: "main.js",
      name: "main",
      isEntry: true,
      imports: ["chunks/host.js", ...(options?.mainImports ?? [])],
      dynamicImports: options?.mainDynamicImports ?? [],
    },
    "codex-sdk-host.js": {
      type: "chunk",
      fileName: "codex-sdk-host.js",
      name: "codex-sdk-host",
      isEntry: true,
      imports: ["@openai/codex-sdk"],
      dynamicImports: [],
    },
    "chunks/host.js": {
      type: "chunk",
      fileName: "chunks/host.js",
      name: "host",
      isEntry: false,
      imports: ["write-file-atomic", ...(options?.hostImports ?? [])],
      dynamicImports: ["koffi"],
    },
  }
}

function recordingResolvers() {
  const imports: Array<{ fullName: string; parentUrl: string }> = []
  const requires: Array<{ fullName: string; parentUrl: string }> = []
  const resolvers: RuntimeDependencyResolvers = {
    resolveImport(fullName, parentUrl) {
      imports.push({ fullName, parentUrl })
      return `file:///resolved/${fullName}`
    },
    resolveRequire(fullName, parentUrl) {
      requires.push({ fullName, parentUrl })
      return `/resolved/${fullName}`
    },
  }
  return { imports, requires, resolvers }
}

describe("desktop runtime dependency boundary", () => {
  it("publishes settings from an ES module with the shipped dependency boundary", async () => {
    // Keep the test entry beneath the desktop package so its runtime imports
    // resolve through the same production dependencies as the shipped entry.
    const desktop = resolve(import.meta.dirname, "../..")
    const directory = await mkdtemp(join(desktop, ".settings-runtime-"))
    try {
      const entry = join(directory, "publish.mjs")
      await build({
        stdin: {
          contents: `
            import { createNodeSettingsSectionStore } from "../../packages/host-node/src/settings-section-store"
            const store = createNodeSettingsSectionStore({
              settingsDirectory: process.argv[2],
              fileName: "preferences.json",
              unit: "preferences",
              validate: value => ({ ok: true, value }),
            })
            await store.save({ theme: "light" })
            await store.save({ theme: "dark" })
          `,
          resolveDir: desktop,
          loader: "ts",
        },
        bundle: true,
        platform: "node",
        format: "esm",
        external: [...desktopRuntimeExternalPackageRoots],
        outfile: entry,
      })
      execFileSync(process.execPath, [entry, directory], { stdio: "pipe" })
      assert.equal(
        await readFile(join(directory, "preferences.json"), "utf8"),
        '{\n  "theme": "dark"\n}\n',
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it("derives package roots and externalizes package subpaths", () => {
    assert.equal(packageRootForLoadName("koffi"), "koffi")
    assert.equal(
      packageRootForLoadName("@openai/codex-sdk/internal"),
      "@openai/codex-sdk",
    )
    assert.equal(isDesktopRuntimeExternalId("koffi/native"), true)
    assert.equal(isDesktopRuntimeExternalId("@openai/codex-sdk/internal"), true)
    assert.equal(isDesktopRuntimeExternalId("unlisted-package"), false)
  })

  it("resolves Rollup-visible and direct loads from their owning outputs", () => {
    const recorded = recordingResolvers()
    const declarations = [
      ...desktopRuntimeExternals,
      { fullName: "direct-runtime/entry", proof: "direct", entry: "main" },
    ] as const

    validateDesktopRuntimeBundle({
      bundle: runtimeBundle(),
      declarations,
      outputDirectory: "/repo/apps/desktop/out/main",
      resolvers: recorded.resolvers,
    })

    assert.deepEqual(
      recorded.imports.map(({ fullName }) => fullName).sort(),
      declarations
        .filter(({ proof }) => proof === "rollup")
        .map(({ fullName }) => fullName)
        .sort(),
    )
    assert.deepEqual(
      recorded.requires.map(({ fullName }) => fullName),
      declarations
        .filter(({ proof }) => proof === "direct")
        .map(({ fullName }) => fullName),
    )
    assert.match(
      recorded.imports.find(({ fullName }) => fullName === "koffi")
        ?.parentUrl ?? "",
      /chunks\/host\.js$/,
    )
    assert.match(recorded.requires[0]?.parentUrl ?? "", /main\.js$/)
  })

  it("excludes names supplied by the Electron, Node and Bun runtimes", () => {
    for (const fullName of [
      "electron",
      "electron/main",
      "node:fs",
      "fs",
      "bun:sqlite",
    ]) {
      assert.equal(isRuntimeSuppliedLoadName(fullName), true)
    }

    validateDesktopRuntimeBundle({
      bundle: runtimeBundle({ hostImports: ["electron", "node:fs", "fs"] }),
      outputDirectory: "/repo/apps/desktop/out/main",
      resolvers: recordingResolvers().resolvers,
    })
  })

  it("rejects an undeclared external with its entry and package root", () => {
    assert.throws(
      () =>
        validateDesktopRuntimeBundle({
          bundle: runtimeBundle({ mainImports: ["unknown/subpath"] }),
          outputDirectory: "/repo/apps/desktop/out/main",
          resolvers: recordingResolvers().resolvers,
        }),
      /entries main.*undeclared runtime external "unknown\/subpath".*package root "unknown"/,
    )
  })

  it("rejects a declared Rollup external that was silently bundled", () => {
    const bundle = runtimeBundle()
    const host = bundle["chunks/host.js"]
    assert.equal(host?.type, "chunk")
    const bundledKoffi: DesktopRuntimeBundle = {
      ...bundle,
      "chunks/host.js": {
        ...host,
        dynamicImports: [],
      },
    }

    assert.throws(
      () =>
        validateDesktopRuntimeBundle({
          bundle: bundledKoffi,
          outputDirectory: "/repo/apps/desktop/out/main",
          resolvers: recordingResolvers().resolvers,
        }),
      /"koffi" was bundled or is no longer loaded/,
    )
  })
})
