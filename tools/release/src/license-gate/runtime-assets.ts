import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { TOKENIZER_GRAMMAR_ASSETS } from "@repo-edu/tree-sitter-grammar-assets"
import {
  dotslashPlatformKey,
  extractRipgrepVersion,
  parseDotslashManifest,
  resolveOpenAiCodexDotslashManifest,
} from "./archive.js"
import {
  closureContainsPackage,
  findReachedPackage,
  findReachedPackageByReachedName,
} from "./closure.js"
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
  CliReleasePlatform,
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

type AdditionalNoticeFile = string | readonly string[]

const releaseGateDirectory = dirname(fileURLToPath(import.meta.url))
const execFileAsync = promisify(execFile)
const forbidElectronRuntimeInstallEnv =
  "REPO_EDU_RELEASE_FORBID_ELECTRON_RUNTIME_INSTALL"
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
        platform: options.platform,
        artifactTargets: options.artifactTargets,
        productionReached,
      })),
    )

    for (const target of options.artifactTargets) {
      const decision = noExtraDesktopRuntime[target]
      if (decision) {
        decisions.push({ target, decision })
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

  const codexRoot = findReachedPackageByReachedName(
    productionReached,
    "@openai/codex",
  )
  if (codexRoot?.packageDirectoryExists) {
    const platformRuntime = await resolveOpenAiCodexPlatformRuntime(
      codexRoot,
      options.platform,
    )
    entries.push(platformRuntime.entry)
    entries.push(
      ...(await resolveRipgrepNoticeEntries({
        codexRoot,
        platform: options.platform,
        platformPackageName: platformRuntime.packageName,
        platformPackagePath: platformRuntime.packagePath,
      })),
    )
  }

  return { entries, decisions }
}

export async function resolveDesktopRuntimePackageEntries(options: {
  readonly root: string
  readonly platform: ReleasePlatform
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
      preparePackage: (packagePath) =>
        ensureElectronRuntimePayload(packagePath, options.platform),
      additionalNoticeFiles: [
        electronChromiumNoticeCandidates(options.root, options.platform),
      ],
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
  platform: CliReleasePlatform,
): Promise<NoticeEntry[]> {
  const bunEntry = await runtimePackageRecord("bun", {
    root,
    source: "Bun compiled CLI package-manager runtime",
  })
  // Fail closed before any further work if the installed Bun version is not
  // attested, so a bump cannot silently ship the previous version's linked set.
  const linkedRuntimes = attestedBunLinkedRuntimesFor(bunEntry.version)
  const bunPackagePath = dirname(resolvePackageJsonPath("bun", root))
  const ovenPackageName = await resolveSelectedOvenBunPackageName(
    bunPackagePath,
    platform,
  )
  const ovenEntry = await runtimePackageRecord(ovenPackageName, {
    root: bunPackagePath,
    source: "Bun compiled CLI platform runtime",
  })

  return [
    bunEntry,
    ovenEntry,
    ...linkedRuntimes.map((linked) =>
      bunLinkedRuntimeEntry({
        id: `bun-${linked.id}:${bunEntry.version}`,
        name: `${linked.subject} linked by Bun`,
        version: bunEntry.version,
        license: linked.license,
        source:
          "Bun compiled CLI runtime; Bun licensing documentation: https://bun.sh/docs/project/licensing",
      }),
    ),
  ]
}

async function runtimePackageRecord(
  packageName: string,
  options: {
    readonly root: string
    readonly source: string
    readonly reachedPackage?: ReachedPackage
    readonly additionalNoticeFiles?: readonly AdditionalNoticeFile[]
    readonly preparePackage?: (packagePath: string) => Promise<void>
    readonly displayName?: string
  },
): Promise<NoticeEntry> {
  const packageJsonPath = options.reachedPackage
    ? join(options.reachedPackage.packagePath, "package.json")
    : resolvePackageJsonPath(packageName, options.root)
  const packagePath = canonicalPackagePath(dirname(packageJsonPath))
  const packageJson = readPackageJson(packagePath)
  if (options.preparePackage) {
    await options.preparePackage(packagePath)
  }
  // `displayName` lets an aliased package carry its dependency-key identity
  // instead of the published `package.json` name, which for the platform-
  // specific `@openai/codex` optional collides with the launcher entry.
  const name = options.displayName ?? packageJson.name ?? packageName
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
          await readAdditionalNoticeFiles(
            packagePath,
            options.additionalNoticeFiles,
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

async function readAdditionalNoticeFiles(
  packagePath: string,
  files: readonly AdditionalNoticeFile[],
): Promise<string[]> {
  const texts: string[] = []
  for (const file of files) {
    const candidates = (Array.isArray(file) ? file : [file]).map((candidate) =>
      resolve(packagePath, candidate),
    )
    const path = candidates.find((candidate) => existsSync(candidate))
    if (!path) {
      throw new Error(
        `Required notice file is missing. Checked: ${candidates.join(", ")}`,
      )
    }

    const text = await readFile(path, "utf8")
    if (text.trim().length === 0) {
      throw new Error(`Required notice file is empty: ${path}`)
    }
    texts.push(text)
  }
  return texts
}

function electronChromiumNoticeCandidates(
  root: string,
  platform: ReleasePlatform,
): readonly string[] {
  const releaseDirectory = resolve(root, appDirectoryByApp.desktop, "release")
  const packagedNoticeByPlatform = {
    "darwin-arm64": [
      join(
        releaseDirectory,
        "mac-arm64",
        "RepoEdu.app",
        "Contents",
        "Resources",
        "LICENSES.chromium.html",
      ),
      join(releaseDirectory, "mac-arm64", "LICENSES.chromium.html"),
    ],
    "linux-arm64": [
      join(releaseDirectory, "linux-arm64-unpacked", "LICENSES.chromium.html"),
    ],
    "linux-x64": [
      join(releaseDirectory, "linux-unpacked", "LICENSES.chromium.html"),
    ],
    "windows-arm64": [
      join(releaseDirectory, "win-arm64-unpacked", "LICENSES.chromium.html"),
    ],
    "windows-x64": [
      join(releaseDirectory, "win-unpacked", "LICENSES.chromium.html"),
    ],
  } satisfies Record<ReleasePlatform, readonly string[]>

  return ["dist/LICENSES.chromium.html", ...packagedNoticeByPlatform[platform]]
}

async function ensureElectronRuntimePayload(
  packagePath: string,
  platform: ReleasePlatform,
): Promise<void> {
  if (existsSync(join(packagePath, "dist", "LICENSES.chromium.html"))) {
    return
  }

  if (process.env[forbidElectronRuntimeInstallEnv] === "1") {
    throw new Error(
      `Electron runtime install is disabled by ${forbidElectronRuntimeInstallEnv}, but ${packagePath} has no materialized dist/LICENSES.chromium.html.`,
    )
  }

  const installScript = join(packagePath, "install.js")
  if (!existsSync(installScript)) {
    throw new Error(
      `Electron runtime package at ${packagePath} has no install.js to materialize Chromium notices.`,
    )
  }

  const target = electronInstallTarget(platform)
  try {
    await execFileAsync(process.execPath, [installScript], {
      cwd: packagePath,
      env: electronInstallEnvironment(target),
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch (error) {
    throw new Error(
      `Electron runtime install failed for ${platform}: ${formatExecError(error)}`,
    )
  }
}

function electronInstallTarget(platform: ReleasePlatform): {
  readonly platform: string
  readonly arch: string
} {
  switch (platform) {
    case "darwin-arm64":
      return { platform: "darwin", arch: "arm64" }
    case "linux-arm64":
      return { platform: "linux", arch: "arm64" }
    case "linux-x64":
      return { platform: "linux", arch: "x64" }
    case "windows-arm64":
      return { platform: "win32", arch: "arm64" }
    case "windows-x64":
      return { platform: "win32", arch: "x64" }
  }
}

function electronInstallEnvironment(target: {
  readonly platform: string
  readonly arch: string
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_INSTALL_PLATFORM: target.platform,
    ELECTRON_INSTALL_ARCH: target.arch,
    npm_config_platform: target.platform,
    npm_config_arch: target.arch,
  }
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD
  return env
}

function formatExecError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error)
  }

  const details: string[] = []
  if (error instanceof Error) {
    details.push(error.message)
  }

  const record = error as Record<string, unknown>
  for (const key of ["stdout", "stderr"] as const) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) {
      details.push(`${key}: ${value.trim()}`)
    }
  }

  return details.join("\n") || String(error)
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

// Bun statically links runtime libraries that no scanner and no CLI flag can
// enumerate from the installed binary, so the set is attested by hand against
// Bun's published licensing documentation. The table is keyed by the exact
// installed Bun version: any bump fails the gate closed until the linked set is
// re-verified, the same fail-closed version coupling the ripgrep and Codex
// records use.
type BunLinkedRuntime = {
  readonly id: string
  readonly subject: string
  readonly license: string
}

const attestedBunLinkedRuntimes = {
  "1.3.11": [
    {
      id: "javascriptcore",
      subject: "JavaScriptCore/WebKit",
      license: "LGPL-2.1-only",
    },
    { id: "tinycc", subject: "tinycc", license: "LGPL-2.1-only" },
  ],
} as const satisfies Record<string, readonly BunLinkedRuntime[]>

function attestedBunLinkedRuntimesFor(
  version: string,
): readonly BunLinkedRuntime[] {
  if (!Object.hasOwn(attestedBunLinkedRuntimes, version)) {
    throw new Error(
      `Bun runtime version ${version} is not attested. Re-verify the linked runtime set (e.g. JavaScriptCore, tinycc) against https://bun.sh/docs/project/licensing and add a ${version} entry to attestedBunLinkedRuntimes before shipping.`,
    )
  }
  return attestedBunLinkedRuntimes[
    version as keyof typeof attestedBunLinkedRuntimes
  ]
}

function bunLinkedRuntimeEntry(options: {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly license: string
  readonly source: string
}): NoticeEntry {
  return {
    id: options.id,
    kind: "runtime-asset",
    name: options.name,
    version: options.version,
    licenseExpression: options.license,
    source: options.source,
    licenseText: licenseTextForSpdxId(options.license),
    licenseEvidence: [
      `Bun's published licensing documentation identifies this linked runtime subject as ${options.license}.`,
      `The installed Bun npm package publishes no dedicated notice file for it, so the canonical ${options.license} license text above is supplied instead.`,
    ].join("\n"),
  }
}

async function resolveOpenAiCodexPlatformRuntime(
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

async function resolveRipgrepNoticeEntries(options: {
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

type OvenBunPackageCandidate = {
  readonly packageName: string
  readonly executablePath: string
}

async function resolveSelectedOvenBunPackageName(
  bunPackagePath: string,
  platform: CliReleasePlatform,
): Promise<string> {
  // Bun's npm postinstall renames the selected platform binary out of its
  // @oven package into bun/bin/bun.exe (see node_modules/bun/install.js
  // optimizeBun), so the supplying candidate is identified by one of two
  // signals: its source binary is still present and byte-identical to the
  // installed runtime (copy semantics), or its source binary is now absent
  // because it was the one renamed away (move semantics, the real install).
  const installedBunBinary = join(bunPackagePath, "bin", "bun.exe")
  const installedDigest = await fileSha256(installedBunBinary)
  const digestMatched: string[] = []
  const movedOut: string[] = []
  const notInstalled: string[] = []

  for (const candidate of ovenBunPackageCandidates(platform)) {
    let packageJsonPath: string
    try {
      packageJsonPath = resolvePackageJsonPath(
        candidate.packageName,
        bunPackagePath,
      )
    } catch {
      notInstalled.push(candidate.packageName)
      continue
    }
    const candidateBinary = join(
      dirname(packageJsonPath),
      candidate.executablePath,
    )
    try {
      if ((await fileSha256(candidateBinary)) === installedDigest) {
        digestMatched.push(candidate.packageName)
      }
    } catch {
      // The package is installed but its source executable is gone: bun's
      // postinstall renamed it into the installed runtime, so this candidate
      // supplied the binary.
      movedOut.push(candidate.packageName)
    }
  }

  if (digestMatched.length === 1) {
    return digestMatched[0] as string
  }
  if (digestMatched.length === 0 && movedOut.length === 1) {
    return movedOut[0] as string
  }

  const candidateNames = ovenBunPackageCandidates(platform)
    .map((candidate) => candidate.packageName)
    .join(", ")
  throw new Error(
    `Could not resolve the @oven Bun runtime package that supplied ${installedBunBinary} for ${platform}. Candidates: ${candidateNames}. Digest matches: ${digestMatched.join(", ") || "none"}; moved into installed runtime: ${movedOut.join(", ") || "none"}; not installed: ${notInstalled.join(", ") || "none"}.`,
  )
}

async function fileSha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
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

function ovenBunPackageCandidates(
  platform: CliReleasePlatform,
): readonly OvenBunPackageCandidate[] {
  switch (platform) {
    case "darwin-arm64":
      return [
        {
          packageName: "@oven/bun-darwin-aarch64",
          executablePath: "bin/bun",
        },
      ]
    case "linux-arm64":
      return [
        {
          packageName: "@oven/bun-linux-aarch64",
          executablePath: "bin/bun",
        },
      ]
    case "linux-x64":
      return [
        {
          packageName: "@oven/bun-linux-x64",
          executablePath: "bin/bun",
        },
        {
          packageName: "@oven/bun-linux-x64-baseline",
          executablePath: "bin/bun",
        },
      ]
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
