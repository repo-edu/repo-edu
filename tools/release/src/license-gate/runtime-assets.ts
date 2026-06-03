import { createRequire } from "node:module"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { TOKENIZER_GRAMMAR_ASSETS } from "@repo-edu/tree-sitter-grammar-assets"
import { closureContainsPackage } from "./closure.js"
import {
  appDirectoryByApp,
  readPackageJson,
  readRequiredTextFile,
} from "./shared.js"
import type {
  DirectNoticeSubject,
  LicenseGateOptions,
  PackageClosure,
  PackageNoticeSubject,
  ReleasePlatform,
  ReleaseRuntimeDecision,
} from "./types.js"

const noExtraDesktopRuntime: Record<string, string> = {
  dmg: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  zip: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  deb: "No extra third-party runtime beyond the Electron app payload is added by this target.",
}

export async function collectRuntimeAssets(
  options: LicenseGateOptions,
  root: string,
  closure: PackageClosure,
): Promise<{
  readonly packageSubjects: readonly PackageNoticeSubject[]
  readonly directSubjects: readonly DirectNoticeSubject[]
  readonly decisions: readonly ReleaseRuntimeDecision[]
}> {
  const packageSubjects: PackageNoticeSubject[] = []
  const directSubjects: DirectNoticeSubject[] = []
  const decisions: ReleaseRuntimeDecision[] = []

  if (options.app === "desktop") {
    packageSubjects.push(
      ...resolveDesktopRuntimePackageSubjects(root, options.artifactTargets),
    )

    for (const target of options.artifactTargets) {
      const decision = noExtraDesktopRuntime[target]
      if (decision) {
        decisions.push({ target, decision })
      }
      if (target === "AppImage") {
        decisions.push({
          target,
          decision:
            "AppImage runtime and packaging helper assets are represented by app-builder-bin and Electron Builder runtime package records.",
        })
      }
      if (target === "nsis") {
        decisions.push({
          target,
          decision:
            "NSIS installer runtime and Windows packaging resources are represented by electron-builder-squirrel-windows and app-builder-bin package records.",
        })
      }
    }
  } else {
    packageSubjects.push(
      ...resolveCliRuntimePackageSubjects(root, options.platform),
    )
  }

  if (
    options.app === "desktop" ||
    closureContainsPackage(closure, "@repo-edu/tree-sitter-grammar-assets")
  ) {
    directSubjects.push(...(await resolveTokenizerGrammarRuntimeAssets()))
  }

  return { packageSubjects, directSubjects, decisions }
}

export function resolveDesktopRuntimePackageSubjects(
  root: string,
  artifactTargets: readonly string[],
): PackageNoticeSubject[] {
  const desktopRoot = resolve(root, appDirectoryByApp.desktop)
  const electronBuilderRoot = dirname(
    resolvePackageJsonPath("electron-builder", desktopRoot),
  )
  const subjects = [
    resolvePackageSubject("electron", {
      reachedName: "electron",
      root: desktopRoot,
      kind: "runtime-asset",
      source: "Desktop Electron runtime",
    }),
    resolvePackageSubject("electron-builder", {
      reachedName: "electron-builder",
      root: desktopRoot,
      kind: "runtime-asset",
      source: "Desktop Electron Builder packaging runtime",
    }),
    ...["app-builder-lib", "app-builder-bin", "builder-util-runtime"].map(
      (packageName) =>
        resolvePackageSubject(packageName, {
          reachedName: packageName,
          root: electronBuilderRoot,
          kind: "runtime-asset",
          source: "Desktop Electron Builder transitive packaging runtime",
        }),
    ),
  ]

  if (artifactTargets.includes("dmg")) {
    subjects.push(
      resolvePackageSubject("dmg-builder", {
        reachedName: "dmg-builder",
        root: electronBuilderRoot,
        kind: "runtime-asset",
        source: "Desktop Electron Builder macOS DMG packaging runtime",
      }),
    )
  }
  if (artifactTargets.includes("nsis")) {
    subjects.push(
      resolvePackageSubject("electron-builder-squirrel-windows", {
        reachedName: "electron-builder-squirrel-windows",
        root: electronBuilderRoot,
        kind: "runtime-asset",
        source: "Desktop Electron Builder Windows installer runtime",
      }),
    )
  }

  return subjects
}

export function resolveCliRuntimePackageSubjects(
  root: string,
  platform: ReleasePlatform,
): PackageNoticeSubject[] {
  const ovenPackageName = ovenBunPackageName(platform)
  const bunSubject = resolvePackageSubject("bun", {
    reachedName: "bun",
    root,
    kind: "runtime-asset",
    source: "Bun compiled CLI runtime",
  })

  return [
    bunSubject,
    resolvePackageSubject(ovenPackageName, {
      reachedName: ovenPackageName,
      root: bunSubject.packagePath,
      kind: "runtime-asset",
      source: "Bun compiled CLI platform runtime",
    }),
  ]
}

async function resolveTokenizerGrammarRuntimeAssets(): Promise<
  DirectNoticeSubject[]
> {
  return Promise.all(
    Object.values(TOKENIZER_GRAMMAR_ASSETS).map(async (entry) => {
      const licenseText = await readRequiredTextFile(
        resolveAssetUrlPath(entry.licenseTextFile),
      )
      const noticeText =
        entry.noticeFile === null
          ? `No separate notice file is recorded for ${entry.upstreamSource}.`
          : await readRequiredTextFile(resolveAssetUrlPath(entry.noticeFile))

      return {
        id: `tokenizer-grammar:${entry.language}:${entry.assetSha256}`,
        kind: "runtime-asset",
        name: `${entry.acquisition.packageName} tokenizer grammar (${entry.language})`,
        version: entry.acquisition.packageVersion,
        licenseExpression: entry.spdxLicense,
        source: `Committed WASM asset ${basename(resolveAssetUrlPath(entry.assetUrl))} from ${entry.upstreamSource}`,
        licenseText,
        noticeText: [
          `SPDX License: ${entry.spdxLicense}`,
          `Upstream source: ${entry.upstreamSource}`,
          `Grammar version: ${entry.grammarVersion}`,
          `Acquisition package: ${entry.acquisition.packageName}@${entry.acquisition.packageVersion}`,
          `Acquisition asset: ${entry.acquisition.assetPath}`,
          "",
          noticeText,
        ].join("\n"),
      }
    }),
  )
}

function resolvePackageSubject(
  packageName: string,
  options: {
    readonly reachedName: string
    readonly root: string
    readonly kind: "runtime-asset"
    readonly source: string
  },
): PackageNoticeSubject {
  const packageJsonPath = resolvePackageJsonPath(packageName, options.root)
  const packagePath = dirname(packageJsonPath)
  const packageJson = readPackageJson(packagePath)

  return {
    reachedName: options.reachedName,
    packageName: packageJson.name ?? packageName,
    version: packageJson.version ?? "0.0.0",
    packagePath,
    firstParty: false,
    path: [options.reachedName],
    kind: options.kind,
    source: options.source,
  }
}

function resolvePackageJsonPath(packageName: string, fromRoot: string): string {
  try {
    return createRequire(join(fromRoot, "package.json")).resolve(
      `${packageName}/package.json`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not resolve release runtime package ${packageName} from ${fromRoot}: ${message}`,
    )
  }
}

function ovenBunPackageName(platform: ReleasePlatform): string {
  switch (platform) {
    case "darwin-arm64":
      return "@oven/bun-darwin-aarch64"
    case "linux-arm64":
      return "@oven/bun-linux-aarch64"
    case "linux-x64":
      return "@oven/bun-linux-x64"
    case "windows-arm64":
      return "@oven/bun-windows-aarch64"
    case "windows-x64":
      return "@oven/bun-windows-x64"
  }
}

function resolveAssetUrlPath(value: string): string {
  if (value.startsWith("file:")) {
    return fileURLToPath(value)
  }
  return value
}
