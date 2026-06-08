import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { TOKENIZER_GRAMMAR_ASSETS } from "@repo-edu/tree-sitter-grammar-assets"
import {
  dotslashPlatformKey,
  extractRipgrepVersion,
  parseDotslashManifest,
  resolveOpenAiCodexDotslashManifest,
} from "./archive.js"
import { closureContainsPackage, findReachedPackage } from "./closure.js"
import { licenseTextForSpdxId } from "./license-text.js"
import { noticeEntryId } from "./notices.js"
import {
  appDirectoryByApp,
  canonicalPackagePath,
  packageMetadataEvidence,
  readPackageJson,
  readRequiredTextFile,
  readRequiredTextFiles,
} from "./shared.js"
import type {
  LicenseGateOptions,
  NoticeEntry,
  PackageJson,
  ReachedPackage,
  ReleasePlatform,
  ReleaseRuntimeDecision,
} from "./types.js"

const noExtraDesktopRuntime: Record<string, string> = {
  dmg: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  zip: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  deb: "No extra third-party runtime beyond the Electron app payload is added by this target.",
}

const releaseGateDirectory = dirname(fileURLToPath(import.meta.url))
const ripgrepNoticeVersion = "15.1.0"
const ripgrepNoticeFiles = [
  "COPYING.txt",
  "LICENSE-MIT.txt",
  "UNLICENSE.txt",
].map((file) =>
  join(
    releaseGateDirectory,
    "runtime-notices",
    `ripgrep-${ripgrepNoticeVersion}`,
    file,
  ),
)

const ripgrepDotslashDigestByPlatform = {
  "darwin-arm64":
    "378e973289176ca0c6054054ee7f631a065874a352bf43f0fa60ef079b6ba715",
  "linux-arm64":
    "2b661c6ef508e902f388e9098d9c4c5aca72c87b55922d94abdba830b4dc885e",
  "linux-x64":
    "1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599",
  "windows-arm64":
    "00d931fb5237c9696ca49308818edb76d8eb6fc132761cb2a1bd616b2df02f8e",
  "windows-x64":
    "124510b94b6baa3380d051fdf4650eaa80a302c876d611e9dba0b2e18d87493a",
} satisfies Record<ReleasePlatform, string>

export async function collectRuntimeNoticeEntries(
  options: LicenseGateOptions,
  root: string,
  productionReached: readonly ReachedPackage[],
): Promise<{
  readonly entries: readonly NoticeEntry[]
  readonly decisions: readonly ReleaseRuntimeDecision[]
}> {
  const entries: NoticeEntry[] = []
  const decisions: ReleaseRuntimeDecision[] = []

  if (options.app === "desktop") {
    entries.push(
      ...(await resolveDesktopRuntimePackageEntries({
        root,
        artifactTargets: options.artifactTargets,
        productionReached,
      })),
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
    entries.push(
      ...(await resolveCliRuntimeNoticeEntries(root, options.platform)),
    )
  }

  if (
    options.app === "desktop" ||
    closureContainsPackage(
      productionReached,
      "@repo-edu/tree-sitter-grammar-assets",
    )
  ) {
    entries.push(...(await resolveTokenizerGrammarRuntimeAssets()))
  }

  const codexRoot = findReachedPackage(productionReached, "@openai/codex")
  if (codexRoot?.packageDirectoryExists) {
    entries.push(
      await resolveOpenAiCodexPlatformRuntimeEntry(codexRoot, options.platform),
    )
    entries.push(await resolveRipgrepNoticeEntry(codexRoot, options.platform))
  }

  return { entries, decisions }
}

export async function resolveDesktopRuntimePackageEntries(options: {
  readonly root: string
  readonly artifactTargets: readonly string[]
  readonly productionReached?: readonly ReachedPackage[]
}): Promise<NoticeEntry[]> {
  const desktopRoot = resolve(options.root, appDirectoryByApp.desktop)
  const electronBuilderRoot = dirname(
    resolvePackageJsonPath("electron-builder", desktopRoot),
  )
  const electronReached = options.productionReached
    ? findReachedPackage(options.productionReached, "electron")
    : undefined
  const subjects = [
    runtimePackageRecord("electron", {
      reachedPackage: electronReached,
      root: desktopRoot,
      source: "Desktop Electron runtime",
      additionalNoticeFiles: ["dist/LICENSES.chromium.html"],
    }),
    runtimePackageRecord("electron-builder", {
      root: desktopRoot,
      source: "Desktop Electron Builder packaging runtime",
    }),
    ...["app-builder-lib", "app-builder-bin", "builder-util-runtime"].map(
      (packageName) =>
        runtimePackageRecord(packageName, {
          root: electronBuilderRoot,
          source: "Desktop Electron Builder transitive packaging runtime",
        }),
    ),
  ]

  if (options.artifactTargets.includes("dmg")) {
    subjects.push(
      runtimePackageRecord("dmg-builder", {
        root: electronBuilderRoot,
        source: "Desktop Electron Builder macOS DMG packaging runtime",
      }),
    )
  }
  if (options.artifactTargets.includes("nsis")) {
    subjects.push(
      runtimePackageRecord("electron-builder-squirrel-windows", {
        root: electronBuilderRoot,
        source: "Desktop Electron Builder Windows installer runtime",
      }),
    )
  }

  return Promise.all(subjects)
}

export async function resolveCliRuntimeNoticeEntries(
  root: string,
  platform: ReleasePlatform,
): Promise<NoticeEntry[]> {
  const ovenPackageName = ovenBunPackageName(platform)
  const bunEntry = await runtimePackageRecord("bun", {
    root,
    source: "Bun compiled CLI package-manager runtime",
  })
  const ovenEntry = await runtimePackageRecord(ovenPackageName, {
    root: dirname(resolvePackageJsonPath("bun", root)),
    source: "Bun compiled CLI platform runtime",
  })

  return [
    bunEntry,
    ovenEntry,
    bunLinkedRuntimeEntry({
      id: `bun-javascriptcore:${bunEntry.version}`,
      name: "JavaScriptCore/WebKit linked by Bun",
      version: bunEntry.version,
      source:
        "Bun compiled CLI runtime; Bun licensing documentation: https://bun.sh/docs/project/licensing",
    }),
    bunLinkedRuntimeEntry({
      id: `bun-tinycc:${bunEntry.version}`,
      name: "tinycc linked by Bun",
      version: bunEntry.version,
      source:
        "Bun compiled CLI runtime; Bun licensing documentation: https://bun.sh/docs/project/licensing",
    }),
  ]
}

async function runtimePackageRecord(
  packageName: string,
  options: {
    readonly root: string
    readonly source: string
    readonly reachedPackage?: ReachedPackage
    readonly additionalNoticeFiles?: readonly string[]
  },
): Promise<NoticeEntry> {
  const packageJsonPath = options.reachedPackage
    ? join(options.reachedPackage.packagePath, "package.json")
    : resolvePackageJsonPath(packageName, options.root)
  const packagePath = canonicalPackagePath(dirname(packageJsonPath))
  const packageJson = readPackageJson(packagePath)
  const name = packageJson.name ?? packageName
  const version = packageJson.version ?? "0.0.0"
  const licenseExpression = readPackageLicense(packageJson, name)
  const licenseFile = findPackageLicenseFile(packagePath)
  const licenseText = licenseFile
    ? await readRequiredTextFile(licenseFile)
    : undefined
  const licenseEvidence = licenseFile
    ? undefined
    : packageMetadataEvidence({
        name,
        version,
        licenseExpression,
        packageJson,
        context: `${options.source} found no dedicated package license file in the installed runtime package.`,
      })
  const additionalText =
    options.additionalNoticeFiles && options.additionalNoticeFiles.length > 0
      ? (
          await readRequiredTextFiles(
            options.additionalNoticeFiles.map((file) =>
              join(packagePath, file),
            ),
          )
        ).join("\n\n")
      : undefined

  return {
    id: noticeEntryId({ name, version, packagePath }),
    kind: "runtime-asset",
    name,
    version,
    licenseExpression,
    source: options.source,
    licenseText,
    licenseEvidence,
    additionalText,
  }
}

function readPackageLicense(packageJson: PackageJson, name: string): string {
  if (typeof packageJson.license === "string" && packageJson.license.trim()) {
    return packageJson.license.trim()
  }
  throw new Error(`Runtime package ${name} has no package license field.`)
}

function findPackageLicenseFile(packagePath: string): string | undefined {
  for (const fileName of [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "LICENCE",
    "COPYING",
  ]) {
    const path = join(packagePath, fileName)
    if (existsSync(path)) {
      return path
    }
  }
  return undefined
}

const bunLinkedRuntimeLicense = "LGPL-2.1-only"

function bunLinkedRuntimeEntry(options: {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly source: string
}): NoticeEntry {
  return {
    id: options.id,
    kind: "runtime-asset",
    name: options.name,
    version: options.version,
    licenseExpression: bunLinkedRuntimeLicense,
    source: options.source,
    licenseText: licenseTextForSpdxId(bunLinkedRuntimeLicense),
    licenseEvidence: [
      "Bun's published licensing documentation identifies this linked runtime subject as LGPL-2.1-only.",
      "The installed Bun npm package publishes no dedicated notice file for it, so the canonical LGPL-2.1 license text above is supplied instead.",
    ].join("\n"),
  }
}

async function resolveOpenAiCodexPlatformRuntimeEntry(
  codexRoot: ReachedPackage,
  platform: ReleasePlatform,
): Promise<NoticeEntry> {
  return runtimePackageRecord(openAiCodexOptionalPackageName(platform), {
    root: codexRoot.packagePath,
    source: `OpenAI Codex native runtime for ${platform}`,
  })
}

async function resolveTokenizerGrammarRuntimeAssets(): Promise<NoticeEntry[]> {
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
      } satisfies NoticeEntry
    }),
  )
}

async function resolveRipgrepNoticeEntry(
  codexRoot: ReachedPackage,
  platform: ReleasePlatform,
): Promise<NoticeEntry> {
  const manifestPath = resolveOpenAiCodexDotslashManifest(
    codexRoot.packagePath,
    codexRoot.version,
  )
  const manifest = parseDotslashManifest(await readFile(manifestPath, "utf8"))
  const platformKey = dotslashPlatformKey(platform)
  const record = manifest.platforms[platformKey]

  if (!record) {
    throw new Error(
      `@openai/codex ripgrep DotSlash manifest has no ${platformKey} platform entry.`,
    )
  }

  const provider = record.providers[0]
  if (!provider) {
    throw new Error("@openai/codex ripgrep DotSlash manifest has no provider.")
  }
  const ripgrepVersion = extractRipgrepVersion(record, provider.url)
  if (ripgrepVersion !== ripgrepNoticeVersion) {
    throw new Error(
      `@openai/codex ripgrep version ${ripgrepVersion} does not match committed notice evidence ${ripgrepNoticeVersion}.`,
    )
  }
  if (record.hash !== "sha256") {
    throw new Error(
      `@openai/codex ripgrep DotSlash manifest uses unsupported hash ${record.hash}.`,
    )
  }
  if (record.digest !== ripgrepDotslashDigestByPlatform[platform]) {
    throw new Error(
      `@openai/codex ripgrep DotSlash digest for ${platform} changed. Refresh committed ripgrep notice evidence before release.`,
    )
  }

  const noticeTexts = await readRequiredTextFiles(ripgrepNoticeFiles)

  return {
    id: `ripgrep:${record.digest}`,
    kind: "package-sub-asset",
    name: "ripgrep vendored by @openai/codex",
    version: ripgrepVersion,
    licenseExpression: "Unlicense OR MIT",
    source: `@openai/codex ${codexRoot.version} bin/rg from ${provider.url}; notice text from committed ripgrep ${ripgrepVersion} source-tag files`,
    licenseText: noticeTexts.join("\n\n"),
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

function openAiCodexOptionalPackageName(platform: ReleasePlatform): string {
  switch (platform) {
    case "darwin-arm64":
      return "@openai/codex-darwin-arm64"
    case "linux-arm64":
      return "@openai/codex-linux-arm64"
    case "linux-x64":
      return "@openai/codex-linux-x64"
    case "windows-arm64":
      return "@openai/codex-win32-arm64"
    case "windows-x64":
      return "@openai/codex-win32-x64"
  }
}

function resolveAssetUrlPath(value: string): string {
  if (value.startsWith("file:")) {
    return fileURLToPath(value)
  }
  return value
}
