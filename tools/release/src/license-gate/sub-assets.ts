import { readFileSync } from "node:fs"
import { open, readdir, readFile, stat } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import {
  dotslashPlatformKey,
  extractRipgrepVersion,
  fetchVerifiedArchive,
  parseDotslashManifest,
  readArchiveTextFiles,
  resolveOpenAiCodexDotslashManifest,
} from "./archive.js"
import {
  normalizePath,
  packageKey,
  readGlobbedTextFiles,
  readRequiredTextFiles,
} from "./shared.js"
import type {
  DirectNoticeSubject,
  PackageNoticeSubject,
  ReleasePlatform,
} from "./types.js"

const binaryMagicHeaders = [
  [0x7f, 0x45, 0x4c, 0x46],
  [0xca, 0xfe, 0xba, 0xbe],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0x4d, 0x5a],
]

const handledVendoredPackages = new Set([
  "@anthropic-ai/sdk",
  "@openai/codex",
  "@trpc/server",
  "app-builder-bin",
  "electron",
  "trpc-electron",
  "victory-vendor",
])

const partialJsonParserLicenseText = `partial-json-parser vendored by @anthropic-ai/sdk
Upstream package: https://www.npmjs.com/package/partial-json-parser
Upstream version inspected for this notice rule: 1.2.2

MIT License

Copyright (c) 2017 indgov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

type ExecutableAsset = {
  readonly relativePath: string
  readonly absolutePath: string
  readonly reason: "binary-magic" | "dotslash" | "executable-mode"
}

export async function applyPackageInternalAssetRules(options: {
  readonly packageSubjects: readonly PackageNoticeSubject[]
  readonly directSubjects: DirectNoticeSubject[]
  readonly packageExtraText: Map<string, string[]>
  readonly platform: ReleasePlatform
}): Promise<void> {
  for (const subject of options.packageSubjects) {
    await applyNestedNoticeRules(subject, options.packageExtraText)
    const executableAssets = await detectExecutableAssets(subject.packagePath)
    const vendoredSurface = await detectVendoredSurface(subject.packagePath)

    if (subject.packageName === "@openai/codex") {
      await applyOpenAiCodexRules(subject, executableAssets, options)
      continue
    }
    if (subject.packageName === "bun") {
      applyBunRuntimePackageRule(
        subject,
        executableAssets,
        options.packageExtraText,
      )
      continue
    }

    const unexpectedExecutableAssets = executableAssets.filter(
      (asset) => !isPackageTextLauncher(subject.packagePath, asset),
    )
    if (
      runtimeExecutablesCoveredByPackageLicense(
        subject,
        unexpectedExecutableAssets,
      )
    ) {
      appendPackageExtraText(
        subject,
        options.packageExtraText,
        unexpectedExecutableAssets.map(
          (asset) =>
            `Runtime executable included at ${asset.relativePath}; notice coverage is supplied by the ${subject.packageName} package license text.`,
        ),
      )
      continue
    }

    if (unexpectedExecutableAssets.length > 0) {
      throw new Error(
        `Package ${subject.packageName} contains executable sub-assets without an explicit notice rule: ${unexpectedExecutableAssets.map((asset) => asset.relativePath).join(", ")}`,
      )
    }

    if (
      vendoredSurface.length > 0 &&
      !handledVendoredPackages.has(subject.packageName)
    ) {
      throw new Error(
        `Package ${subject.packageName} contains vendored sub-assets without an explicit notice rule: ${vendoredSurface.join(", ")}`,
      )
    }
  }
}

function runtimeExecutablesCoveredByPackageLicense(
  subject: PackageNoticeSubject,
  assets: readonly ExecutableAsset[],
): boolean {
  if (assets.length === 0) {
    return false
  }
  return (
    subject.packageName === "app-builder-bin" ||
    subject.packageName === "electron" ||
    subject.packageName.startsWith("@oven/bun-")
  )
}

function applyBunRuntimePackageRule(
  subject: PackageNoticeSubject,
  executableAssets: readonly ExecutableAsset[],
  packageExtraText: Map<string, string[]>,
): void {
  const expectedRuntimeAssets = executableAssets.filter((asset) =>
    /^bin\/bunx?\.exe$/.test(asset.relativePath),
  )
  const unexpected = executableAssets.filter(
    (asset) =>
      !expectedRuntimeAssets.includes(asset) &&
      !isPackageTextLauncher(subject.packagePath, asset),
  )

  if (unexpected.length > 0) {
    throw new Error(
      `Package bun contains executable sub-assets without an explicit notice rule: ${unexpected.map((asset) => asset.relativePath).join(", ")}`,
    )
  }

  appendPackageExtraText(
    subject,
    packageExtraText,
    expectedRuntimeAssets.map(
      (asset) =>
        `Bun package-manager runtime executable included at ${asset.relativePath}; notice coverage is supplied by the bun package license text and the platform Bun runtime package record.`,
    ),
  )
}

async function applyNestedNoticeRules(
  subject: PackageNoticeSubject,
  packageExtraText: Map<string, string[]>,
): Promise<void> {
  if (subject.packageName === "@anthropic-ai/sdk") {
    const notices = await readRequiredTextFiles([
      join(subject.packagePath, "src/internal/qs/LICENSE.md"),
      join(subject.packagePath, "src/_vendor/partial-json-parser/README.md"),
    ])
    appendPackageExtraText(subject, packageExtraText, [
      ...notices,
      partialJsonParserLicenseText,
    ])
    return
  }

  if (subject.packageName === "victory-vendor") {
    const notices = await readGlobbedTextFiles(
      join(subject.packagePath, "lib-vendor"),
      "LICENSE",
    )
    appendPackageExtraText(subject, packageExtraText, notices)
    return
  }

  if (
    subject.packageName === "@trpc/server" ||
    subject.packageName === "trpc-electron"
  ) {
    const vendorDirectory = join(subject.packagePath, "src/vendor/unpromise")
    const notices = await readRequiredTextFiles([
      join(vendorDirectory, "LICENSE"),
      join(vendorDirectory, "ATTRIBUTION.txt"),
    ])
    appendPackageExtraText(subject, packageExtraText, notices)
    return
  }

  if (subject.packageName === "electron") {
    const notices = await readRequiredTextFiles([
      join(subject.packagePath, "dist/LICENSE"),
      join(subject.packagePath, "dist/LICENSES.chromium.html"),
    ])
    appendPackageExtraText(subject, packageExtraText, notices)
  }
}

async function applyOpenAiCodexRules(
  subject: PackageNoticeSubject,
  executableAssets: readonly ExecutableAsset[],
  options: {
    readonly directSubjects: DirectNoticeSubject[]
    readonly packageExtraText: Map<string, string[]>
    readonly platform: ReleasePlatform
  },
): Promise<void> {
  const codexAssets = executableAssets.filter((asset) =>
    /(^|\/)vendor\/[^/]+\/codex\/codex(\.exe)?$/.test(asset.relativePath),
  )
  const ripgrepAssets = executableAssets.filter((asset) =>
    /(^|\/)vendor\/[^/]+\/path\/rg(\.exe)?$/.test(asset.relativePath),
  )
  const unexpected = executableAssets.filter(
    (asset) =>
      !codexAssets.includes(asset) &&
      !ripgrepAssets.includes(asset) &&
      !asset.relativePath.startsWith("bin/"),
  )

  if (codexAssets.length > 0) {
    appendPackageExtraText(
      subject,
      options.packageExtraText,
      codexAssets.map(
        (asset) =>
          `Native Codex runtime binary included at ${asset.relativePath}; notice coverage is supplied by the @openai/codex package license text.`,
      ),
    )
  }

  for (const asset of ripgrepAssets) {
    options.directSubjects.push(
      await resolveRipgrepNoticeSubject(subject, asset, options.platform),
    )
  }

  if (unexpected.length > 0) {
    throw new Error(
      `@openai/codex contains executable sub-assets without an explicit notice rule: ${unexpected.map((asset) => asset.relativePath).join(", ")}`,
    )
  }
}

async function resolveRipgrepNoticeSubject(
  subject: PackageNoticeSubject,
  asset: ExecutableAsset,
  platform: ReleasePlatform,
): Promise<DirectNoticeSubject> {
  const manifestPath = resolveOpenAiCodexDotslashManifest(
    subject.packagePath,
    subject.version,
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

  const archiveBytes = await fetchVerifiedArchive(provider.url, record)
  const archivePrefix = dirname(record.path)
  const noticeFiles = ["COPYING", "LICENSE-MIT", "UNLICENSE"]
  const noticeTexts = await readArchiveTextFiles(
    archiveBytes,
    record.format,
    noticeFiles.map((file) => `${archivePrefix}/${file}`),
  )

  return {
    id: `ripgrep:${record.digest}:${asset.relativePath}`,
    kind: "package-sub-asset",
    name: "ripgrep vendored by @openai/codex",
    version: ripgrepVersion,
    licenseExpression: "Unlicense OR MIT",
    source: `@openai/codex ${subject.version} ${asset.relativePath} from ${provider.url}`,
    licenseText: noticeTexts.join("\n\n"),
  }
}

async function detectExecutableAssets(
  packagePath: string,
): Promise<ExecutableAsset[]> {
  const assets: ExecutableAsset[] = []

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      const relativePath = normalizePath(relative(packagePath, absolutePath))

      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== ".git"
      ) {
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const fileStat = await stat(absolutePath)
      const header = await readFileHeader(absolutePath, 128)
      const reason = executableReason(relativePath, fileStat.mode, header)
      if (reason) {
        assets.push({ relativePath, absolutePath, reason })
      }
    }
  }

  await walk(packagePath)
  return assets
}

function executableReason(
  relativePath: string,
  mode: number,
  header: Buffer,
): ExecutableAsset["reason"] | null {
  const textHeader = header.toString("utf8")
  if (textHeader.startsWith("#!/usr/bin/env dotslash")) {
    return "dotslash"
  }

  if (
    binaryMagicHeaders.some((magic) =>
      magic.every((byte, index) => header[index] === byte),
    )
  ) {
    return "binary-magic"
  }

  if (
    (mode & 0o111) !== 0 &&
    (textHeader.startsWith("#!") || /(^|\/)(bin|vendor)\//.test(relativePath))
  ) {
    return "executable-mode"
  }

  return null
}

function isPackageTextLauncher(
  packagePath: string,
  asset: ExecutableAsset,
): boolean {
  if (asset.reason !== "executable-mode") {
    return false
  }
  const header = readFileSync(join(packagePath, asset.relativePath), "utf8")
  return (
    header.startsWith("#!") && !header.startsWith("#!/usr/bin/env dotslash")
  )
}

async function readFileHeader(path: string, bytes: number): Promise<Buffer> {
  const file = await open(path, "r")
  try {
    const buffer = Buffer.alloc(bytes)
    const result = await file.read(buffer, 0, bytes, 0)
    return buffer.subarray(0, result.bytesRead)
  } finally {
    await file.close()
  }
}

async function detectVendoredSurface(packagePath: string): Promise<string[]> {
  const surfaces: string[] = []

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 3) {
      return
    }

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      const relativePath = normalizePath(relative(packagePath, absolutePath))
      if (entry.isDirectory()) {
        if (isVendoredDirectoryName(entry.name)) {
          surfaces.push(relativePath)
        }
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          await walk(absolutePath, depth + 1)
        }
      }
    }
  }

  await walk(packagePath, 0)
  return surfaces
}

function isVendoredDirectoryName(name: string): boolean {
  return [
    "_vendor",
    "vendor",
    "vendors",
    "lib-vendor",
    "third_party",
    "third-party",
  ].includes(name)
}

function appendPackageExtraText(
  subject: PackageNoticeSubject,
  extraText: Map<string, string[]>,
  texts: readonly string[],
): void {
  if (texts.length === 0) {
    return
  }

  const key = packageKey(
    subject.packageName,
    subject.version,
    subject.packagePath,
  )
  const current = extraText.get(key) ?? []
  extraText.set(key, [...current, ...texts])
}
