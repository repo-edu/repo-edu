import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import {
  dotslashPlatformKey,
  extractRipgrepVersion,
  parseDotslashManifest,
  resolveOpenAiCodexDotslashManifest,
} from "./archive.js"
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
const pcre2NoticeVersion = "10.45"
const pcre2NoticeFile = join(
  releaseGateDirectory,
  "runtime-notices",
  `pcre2-${pcre2NoticeVersion}`,
  "LICENCE.txt",
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
  const manifestPath = resolveOpenAiCodexDotslashManifest(
    options.codexRoot.packagePath,
    options.codexRoot.version,
  )
  const manifest = parseDotslashManifest(await readFile(manifestPath, "utf8"))
  const platformKey = dotslashPlatformKey(options.platform)
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
  if (record.digest !== ripgrepDotslashDigestByPlatform[options.platform]) {
    throw new Error(
      `@openai/codex ripgrep DotSlash digest for ${options.platform} changed. Refresh committed ripgrep notice evidence before release.`,
    )
  }

  const binary = await inspectVendoredRipgrepBinary({
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
      version: ripgrepVersion,
      licenseExpression: "Unlicense OR MIT",
      source: `${options.platformPackageName} vendored ${binary.relativePath}; root @openai/codex ${options.codexRoot.version} bin/rg DotSlash provider ${provider.url}; notice text from committed ripgrep ${ripgrepVersion} source-tag files`,
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
  readonly expectedVersion: string
  readonly platformPackageName: string
  readonly platformPackagePath: string
}): Promise<{
  readonly path: string
  readonly relativePath: string
  readonly sha256: string
  readonly versionOutput: string
  readonly pcre2Output: string
  readonly pcre2Version: string | undefined
}> {
  const path = await findVendoredRipgrepBinary(options.platformPackagePath)
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
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
    versionOutput: versionOutput.trim(),
    pcre2Output: pcre2Output.trim(),
    pcre2Version,
  }
}

async function findVendoredRipgrepBinary(packagePath: string): Promise<string> {
  const vendorPath = join(packagePath, "vendor")
  const candidates: string[] = []

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      if (
        entry.isFile() &&
        (entry.name === "rg" || entry.name === "rg.exe") &&
        path.split(/[\\/]/).includes("path")
      ) {
        candidates.push(path)
      }
    }
  }

  await walk(vendorPath)

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one vendored ripgrep binary under ${vendorPath}, found ${candidates.length}.`,
    )
  }

  const [candidate] = candidates
  if (!candidate) {
    throw new Error(`No vendored ripgrep binary was found under ${vendorPath}.`)
  }
  return candidate
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
