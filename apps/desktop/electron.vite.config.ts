import { cpSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "electron-vite"
import {
  desktopRuntimeDependencyBoundaryPlugin,
  desktopRuntimeExternalPackageRoots,
} from "./src/runtime-dependency-boundary"

type TsConfigPaths = Record<string, string[]>

const configDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(configDir, "../..")
const configRequire = createRequire(import.meta.url)

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildWorkspaceAliases() {
  const tsconfigPath = resolve(repoRoot, "tsconfig.base.json")
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
    compilerOptions?: { paths?: TsConfigPaths }
  }
  const paths = tsconfig.compilerOptions?.paths ?? {}

  return Object.entries(paths).flatMap(([find, targets]) => {
    const target = targets[0]
    if (!target) {
      return []
    }

    const normalizedTarget = target.startsWith("./") ? target.slice(2) : target

    if (find.includes("*")) {
      return [
        {
          find: new RegExp(`^${escapeRegex(find).replace("\\*", "(.+)")}$`),
          replacement: resolve(repoRoot, normalizedTarget.replace("*", "$1")),
        },
      ]
    }

    return [
      {
        find: new RegExp(`^${escapeRegex(find)}$`),
        replacement: resolve(repoRoot, normalizedTarget),
      },
    ]
  })
}

function copyMainRuntimeAssetsPlugin() {
  const mainOutputDir = resolve(configDir, "out/main")
  const grammarAssetSource = resolve(
    repoRoot,
    "packages/tree-sitter-grammar-assets/src/assets",
  )
  const windowsLauncherSource = resolve(
    repoRoot,
    "packages/host-node/resources/host-child-lifetime",
  )
  const tokenizerEngineSource = configRequire.resolve(
    "web-tree-sitter/web-tree-sitter.wasm",
    { paths: [resolve(repoRoot, "packages/host-node")] },
  )

  return {
    name: "copy-main-runtime-assets",
    apply: "build" as const,
    closeBundle() {
      cpSync(grammarAssetSource, resolve(mainOutputDir, "assets"), {
        force: true,
        recursive: true,
      })
      cpSync(
        tokenizerEngineSource,
        resolve(mainOutputDir, "web-tree-sitter.wasm"),
        { force: true },
      )
      cpSync(
        windowsLauncherSource,
        resolve(mainOutputDir, "host-child-lifetime"),
        { force: true, recursive: true },
      )
    },
  }
}

type BuildWarning = {
  readonly code?: string
  readonly id?: string
  readonly message: string
}

function referencesWebTreeSitterRuntime(reference: string | undefined) {
  const normalized = reference?.replaceAll("\\", "/") ?? ""
  return normalized.includes("/web-tree-sitter/web-tree-sitter.js")
}

function shouldSuppressKnownWebTreeSitterWarning(warning: BuildWarning) {
  const isWebTreeSitterEvalWarning =
    warning.code === "EVAL" &&
    warning.message.includes("Use of eval") &&
    referencesWebTreeSitterRuntime(warning.id ?? warning.message)

  if (isWebTreeSitterEvalWarning) {
    return true
  }

  const isBrowserBuiltinExternalWarning =
    warning.message.includes("externalized for browser compatibility") &&
    (warning.message.includes('Module "fs/promises"') ||
      warning.message.includes('Module "module"')) &&
    referencesWebTreeSitterRuntime(warning.message)

  return isBrowserBuiltinExternalWarning
}

const workspaceAliases = buildWorkspaceAliases()
const mainOutputDirectory = resolve(configDir, "out/main")
const mainRuntimeExternalMatchers = desktopRuntimeExternalPackageRoots.map(
  (root) => new RegExp(`^${escapeRegex(root)}(?:/|$)`),
)

export default defineConfig({
  main: {
    plugins: [
      desktopRuntimeDependencyBoundaryPlugin(mainOutputDirectory),
      copyMainRuntimeAssetsPlugin(),
    ],
    resolve: {
      alias: workspaceAliases,
    },
    build: {
      externalizeDeps: false,
      outDir: "out/main",
      rollupOptions: {
        input: {
          main: resolve(configDir, "src/main.ts"),
          "codex-sdk-host": resolve(
            repoRoot,
            "packages/integrations-llm/src/codex/sdk-host-entry.ts",
          ),
        },
        output: {
          entryFileNames: "[name].js",
        },
        external: mainRuntimeExternalMatchers,
        onwarn(warning, warn) {
          if (shouldSuppressKnownWebTreeSitterWarning(warning)) {
            return
          }

          warn(warning)
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: workspaceAliases,
    },
    build: {
      externalizeDeps: false,
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(configDir, "src/preload.ts"),
        output: {
          format: "cjs",
          entryFileNames: "preload.cjs",
        },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [tailwindcss()],
    resolve: {
      alias: workspaceAliases,
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: resolve(configDir, "index.html"),
        // Some ESM dependencies include top-level `"use client"` directives.
        // Rollup prints MODULE_LEVEL_DIRECTIVE warnings because those directives
        // are not used in this Electron renderer bundle. They are expected and
        // noisy for runtime validation output, so we suppress only this case.
        onwarn(warning, warn) {
          if (shouldSuppressKnownWebTreeSitterWarning(warning)) {
            return
          }

          const isUseClientDirectiveWarning =
            warning.code === "MODULE_LEVEL_DIRECTIVE" &&
            warning.message.includes('"use client"')

          if (isUseClientDirectiveWarning) {
            return
          }

          warn(warning)
        },
      },
    },
  },
})
