import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { resolveCodexPackageRipgrep } from "./codex-package.js"
import {
  resolvePackageJsonPath,
  runtimePackageRecord,
} from "./runtime-package-record.js"
import {
  canonicalPackagePath,
  readRequiredTextFile,
  readRequiredTextFiles,
} from "./shared.js"
import type { NoticeEntry, ReachedPackage, ReleasePlatform } from "./types.js"

const releaseGateDirectory = dirname(fileURLToPath(import.meta.url))
const execFileAsync = promisify(execFile)
const ripgrepNoticeVersion = "15.2.0"
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
const pcre2NoticeVersion = "10.45"
const pcre2NoticeFile = join(
  releaseGateDirectory,
  "runtime-notices",
  `pcre2-${pcre2NoticeVersion}`,
  "LICENCE.txt",
)

export async function resolveOpenAiCodexPlatformRuntime(
  codexRoot: ReachedPackage,
  platform: ReleasePlatform,
): Promise<{
  readonly entry: NoticeEntry
  readonly packageName: string
  readonly packagePath: string
}> {
  // The optional resolves to a package published as `@openai/codex` with a
  // platform-suffixed version, so label the notice with the platform dependency
  // key to keep it distinct from the `@openai/codex` launcher entry.
  const platformPackageName = openAiCodexOptionalPackageName(platform)
  const packageJsonPath = resolvePackageJsonPath(
    platformPackageName,
    codexRoot.packagePath,
  )
  const entry = await runtimePackageRecord(platformPackageName, {
    root: codexRoot.packagePath,
    source: `OpenAI Codex native runtime for ${platform}`,
    displayName: platformPackageName,
  })
  return {
    entry,
    packageName: platformPackageName,
    packagePath: canonicalPackagePath(dirname(packageJsonPath)),
  }
}

export async function resolveRipgrepNoticeEntries(options: {
  readonly codexRoot: ReachedPackage
  readonly platform: ReleasePlatform
  readonly platformPackageName: string
  readonly platformPackagePath: string
}): Promise<NoticeEntry[]> {
  const packageLayout = await resolveCodexPackageRipgrep({
    packagePath: options.platformPackagePath,
    packageVersion: options.codexRoot.version,
    platform: options.platform,
  })
  const binary = await inspectVendoredRipgrepBinary({
    path: packageLayout.binaryPath,
    expectedVersion: ripgrepNoticeVersion,
    platformPackageName: options.platformPackageName,
    platformPackagePath: options.platformPackagePath,
  })
  const noticeTexts = await readRequiredTextFiles(ripgrepNoticeFiles)
  const entries: NoticeEntry[] = [
    {
      id: `ripgrep:${binary.sha256}`,
      kind: "package-sub-asset",
      name: "ripgrep vendored by @openai/codex",
      version: binary.version,
      licenseExpression: "Unlicense OR MIT",
      source: `${options.platformPackageName} vendored ${binary.relativePath}; root @openai/codex ${options.codexRoot.version} layout from ${packageLayout.manifestRelativePath}; notice text from committed ripgrep ${binary.version} source-tag files`,
      licenseText: noticeTexts.join("\n\n"),
      noticeText: binary.versionOutput,
    },
  ]

  if (binary.pcre2Version) {
    const licenseText = await readRequiredTextFile(pcre2NoticeFile)
    entries.push({
      id: `pcre2:${binary.pcre2Version}`,
      kind: "package-sub-asset",
      name: "PCRE2 linked by ripgrep vendored by @openai/codex",
      version: binary.pcre2Version,
      licenseExpression: "BSD-3-Clause WITH PCRE2-exception",
      source: `${options.platformPackageName} vendored ${binary.relativePath} reports PCRE2 ${binary.pcre2Version}; notice text from committed PCRE2 ${binary.pcre2Version} source-tag LICENCE.txt`,
      licenseText,
      noticeText: binary.pcre2Output,
    })
  }

  return entries
}

async function inspectVendoredRipgrepBinary(options: {
  readonly path: string
  readonly expectedVersion: string
  readonly platformPackageName: string
  readonly platformPackagePath: string
}): Promise<{
  readonly path: string
  readonly relativePath: string
  readonly version: string
  readonly sha256: string
  readonly versionOutput: string
  readonly pcre2Output: string
  readonly pcre2Version: string | undefined
}> {
  const path = options.path
  const relativePath = formatPackageRelativePath(
    options.platformPackagePath,
    path,
  )
  const versionOutput = await runRuntimeBinary(path, ["--version"])
  const version = parseRipgrepBinaryVersion(versionOutput)
  if (version !== options.expectedVersion) {
    throw new Error(
      `${options.platformPackageName} vendored ${relativePath} reports ripgrep ${version}, but committed notice evidence is for ${options.expectedVersion}.`,
    )
  }

  const pcre2Output = await runRuntimeBinary(path, ["--pcre2-version"])
  const pcre2Version = parsePcre2Version(pcre2Output)
  if (pcre2Version && pcre2Version !== pcre2NoticeVersion) {
    throw new Error(
      `${options.platformPackageName} vendored ${relativePath} reports PCRE2 ${pcre2Version}, but committed notice evidence is for ${pcre2NoticeVersion}.`,
    )
  }

  return {
    path,
    relativePath,
    version,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    versionOutput: versionOutput.trim(),
    pcre2Output: pcre2Output.trim(),
    pcre2Version,
  }
}

async function runRuntimeBinary(
  path: string,
  args: readonly string[],
): Promise<string> {
  const { stdout } = await execFileAsync(path, [...args], {
    maxBuffer: 1024 * 1024,
  })
  return stdout
}

function parseRipgrepBinaryVersion(output: string): string {
  const version = /^ripgrep ([0-9]+\.[0-9]+\.[0-9]+)/.exec(output)?.[1]
  if (!version) {
    throw new Error(`Could not parse ripgrep binary version from: ${output}`)
  }
  return version
}

function parsePcre2Version(output: string): string | undefined {
  return /PCRE2 ([0-9]+\.[0-9]+)/.exec(output)?.[1]
}

function formatPackageRelativePath(packagePath: string, path: string): string {
  return path.slice(packagePath.length + 1).replaceAll("\\", "/")
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
