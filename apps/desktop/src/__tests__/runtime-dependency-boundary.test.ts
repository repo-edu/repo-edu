import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type DesktopRuntimeBundle,
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
      imports: options?.hostImports ?? [],
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

    validateDesktopRuntimeBundle({
      bundle: runtimeBundle(),
      declarations: desktopRuntimeExternals,
      outputDirectory: "/repo/apps/desktop/out/main",
      resolvers: recorded.resolvers,
    })

    assert.deepEqual(
      recorded.imports.map(({ fullName }) => fullName).sort(),
      desktopRuntimeExternals
        .filter(({ proof }) => proof === "rollup")
        .map(({ fullName }) => fullName)
        .sort(),
    )
    assert.deepEqual(
      recorded.requires.map(({ fullName }) => fullName),
      desktopRuntimeExternals
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
