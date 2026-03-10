import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "electron-vite"

type TsConfigPaths = Record<string, string[]>

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildWorkspaceAliases() {
  const repoRoot = resolve(__dirname, "../..")
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

const workspaceAliases = buildWorkspaceAliases()

export default defineConfig({
  main: {
    resolve: {
      alias: workspaceAliases,
    },
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: resolve(__dirname, "src/main.ts"),
      },
    },
  },
  preload: {
    resolve: {
      alias: workspaceAliases,
    },
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: resolve(__dirname, "src/preload.ts"),
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
        input: resolve(__dirname, "index.html"),
        // Some ESM dependencies include top-level `"use client"` directives.
        // Rollup prints MODULE_LEVEL_DIRECTIVE warnings because those directives
        // are not used in this Electron renderer bundle. They are expected and
        // noisy for runtime validation output, so we suppress only this case.
        onwarn(warning, warn) {
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
