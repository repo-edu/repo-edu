import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { builtinModules, createRequire } from "node:module"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath as nodeFileURLToPath } from "node:url"
import { promisify } from "node:util"
import { resolveLicensesBestEffort } from "@quantco/pnpm-licenses/dist/api.mjs"
import { TOKENIZER_GRAMMAR_ASSETS } from "@repo-edu/tree-sitter-grammar-assets"
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js"
import { extract as extractTar } from "tar"

const require = createRequire(import.meta.url)
const satisfiesSpdx = require("spdx-satisfies") as (
  expression: string,
  allowed: string[],
) => boolean
const parseSpdxExpression = require("spdx-expression-parse") as (
  expression: string,
) => SpdxExpressionNode

const rootDirectory = resolve(
  dirname(nodeFileURLToPath(import.meta.url)),
  "../../..",
)
const execFileAsync = promisify(execFile)

export type LicenseGateApp = "desktop" | "cli"

export type ReleasePlatform =
  | "darwin-arm64"
  | "linux-arm64"
  | "linux-x64"
  | "windows-arm64"
  | "windows-x64"

export type LicenseGateOptions = {
  readonly app: LicenseGateApp
  readonly platform: ReleasePlatform
  readonly artifactTargets: readonly string[]
  readonly manifestOut: string
  readonly bunMetafile?: string
  readonly root?: string
}

export type ClassificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

type BlueOakList = readonly {
  readonly licenses: readonly { readonly id: string }[]
}[]

type BlueOakCopyleft = Record<
  string,
  readonly { readonly id: string; readonly name?: string }[]
>

type SpdxExpressionNode =
  | { readonly license: string; readonly exception?: string }
  | {
      readonly conjunction: "and" | "or"
      readonly left: SpdxExpressionNode
      readonly right: SpdxExpressionNode
    }

export type PnpmListNode = {
  readonly name?: string
  readonly from?: string
  readonly version?: string
  readonly path?: string
  readonly resolved?: string
  readonly private?: boolean
  readonly deduped?: boolean
  readonly dedupedDependenciesCount?: number
  readonly dependencies?: Record<string, PnpmListNode>
  readonly unsavedDependencies?: Record<string, PnpmListNode>
}

export type ReachedPackage = {
  readonly reachedName: string
  readonly packageName: string
  readonly version: string
  readonly packagePath: string
  readonly firstParty: boolean
  readonly path: readonly string[]
}

export type PackageClosure = {
  readonly firstPartyPackages: readonly ReachedPackage[]
  readonly externalPackages: readonly ReachedPackage[]
}

type PackageJson = {
  readonly name?: string
  readonly version?: string
  readonly license?: string
  readonly author?: string | { readonly name?: string }
  readonly homepage?: string
  readonly description?: string
}

type LicenseMetadataRecord = {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly license: string
  readonly author?: string
  readonly homepage?: string
  readonly description?: string
}

type QuantcoDependency = {
  readonly name: string
  readonly license: string
  readonly author?: string
  readonly homepage?: string
  readonly description?: string
  readonly version: string
  readonly path: string
}

type NoticeEntry = {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly licenseExpression: string
  readonly kind: "package" | "runtime-asset" | "package-sub-asset"
  readonly source: string
  readonly licenseText: string
  readonly noticeText?: string
  readonly additionalText?: string
}

type PackageNoticeSubject = ReachedPackage & {
  readonly kind: "package" | "runtime-asset"
  readonly source: string
}

type DirectNoticeSubject = {
  readonly id: string
  readonly kind: "runtime-asset" | "package-sub-asset"
  readonly name: string
  readonly version: string
  readonly licenseExpression: string
  readonly source: string
  readonly licenseText: string
  readonly noticeText?: string
}

type ReleaseRuntimeDecision = {
  readonly target: string
  readonly decision: string
}

type DotSlashManifest = {
  readonly name: string
  readonly platforms: Record<
    string,
    {
      readonly size: number
      readonly hash: string
      readonly digest: string
      readonly format: "tar.gz" | "zip"
      readonly path: string
      readonly providers: readonly { readonly url: string }[]
    }
  >
}

type BunMetafileImport = {
  readonly path?: string
  readonly external?: boolean
}

type BunMetafileLike = {
  readonly inputs?: Record<string, unknown>
  readonly outputs?: Record<string, unknown>
}

const appPackageByApp = {
  desktop: "@repo-edu/desktop",
  cli: "@repo-edu/cli",
} satisfies Record<LicenseGateApp, string>

const appDirectoryByApp = {
  desktop: "apps/desktop",
  cli: "apps/cli",
} satisfies Record<LicenseGateApp, string>

const firstPartyScope = "@repo-edu/"

const forbiddenReleasePackages = new Set([
  "@repo-edu/claude-coder",
  "@repo-edu/fixture-engine",
  "@anthropic-ai/claude-agent-sdk",
])

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
])

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
  "@openai/codex",
  "@trpc/server",
  "app-builder-bin",
  "electron",
  "trpc-electron",
  "victory-vendor",
])

const noExtraDesktopRuntime: Record<string, string> = {
  dmg: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  zip: "No extra third-party runtime beyond the Electron app payload is added by this target.",
  deb: "No extra third-party runtime beyond the Electron app payload is added by this target.",
}

export function noticeSidecarName(binaryName: string): string {
  return `${binaryName}.third-party-notices.txt`
}

export function manifestFileName(
  app: LicenseGateApp,
  platform: ReleasePlatform,
): string {
  return `RepoEdu-third-party-notices-${app}-${platform}.txt`
}

export function classifyLicenseExpression(
  expression: string,
): ClassificationResult {
  const normalized = expression.trim()
  if (
    normalized.length === 0 ||
    /^UNLICENSED$/i.test(normalized) ||
    /^SEE LICEN[CS]E/i.test(normalized) ||
    /all rights reserved/i.test(normalized) ||
    /source[- ]available/i.test(normalized) ||
    /^unknown$/i.test(normalized)
  ) {
    return {
      ok: false,
      reason: `non-SPDX or non-redistributable license string "${expression}"`,
    }
  }

  const allowlist = blueOakAllowlist()
  const allowlistIds = [...allowlist]

  try {
    if (satisfiesSpdx(normalized, allowlistIds)) {
      return { ok: true }
    }
  } catch {
    return {
      ok: false,
      reason: `invalid SPDX license expression "${expression}"`,
    }
  }

  let ids: string[]
  try {
    ids = collectSpdxIds(parseSpdxExpression(normalized))
  } catch {
    return {
      ok: false,
      reason: `invalid SPDX license expression "${expression}"`,
    }
  }

  const denylist = blueOakCopyleftIds()
  const copyleftIds = ids.filter((id) => denylist.has(id))
  if (copyleftIds.length > 0) {
    return {
      ok: false,
      reason: `copyleft license id(s): ${copyleftIds.join(", ")}`,
    }
  }

  const unknownIds = ids.filter((id) => !allowlist.has(id) && !denylist.has(id))
  if (unknownIds.length > 0) {
    return {
      ok: false,
      reason: `license id(s) absent from Blue Oak allow/deny datasets: ${unknownIds.join(", ")}`,
    }
  }

  return {
    ok: false,
    reason: `SPDX expression "${expression}" does not satisfy the permissive allowlist`,
  }
}

export function enumeratePackageClosureFromList(
  listRoot: PnpmListNode,
  options?: { readonly repoRoot?: string },
): PackageClosure {
  const repoRoot = options?.repoRoot ?? rootDirectory
  const equivalents = collectEquivalentDependencyNodes(listRoot)
  const reached = new Map<string, ReachedPackage>()

  function visit(
    reachedName: string,
    node: PnpmListNode,
    path: readonly string[],
  ): void {
    const packagePath = node.path
    const hasPackageDirectory =
      typeof packagePath === "string" && existsSync(packagePath)

    if (!hasPackageDirectory) {
      if (isFirstPartyPackageName(reachedName)) {
        throw new Error(
          `Reached first-party package ${reachedName} has no package directory.`,
        )
      }
      return
    }

    const packageJson = readPackageJson(packagePath)
    const packageName = packageJson.name ?? reachedName
    const version = normalizePackageVersion(node.version, packageJson)
    const firstParty = isFirstPartyPackageName(packageName)
    const key = packageKey(packageName, version, packagePath)

    if (!reached.has(key)) {
      reached.set(key, {
        reachedName,
        packageName,
        version,
        packagePath,
        firstParty,
        path,
      })
    }

    const dependencySource = dependenciesSourceForNode(
      reachedName,
      node,
      equivalents,
    )
    for (const [childName, child] of Object.entries(
      dependencySource.dependencies ?? {},
    )) {
      visit(childName, child, [...path, childName])
    }
  }

  for (const [name, node] of Object.entries(listRoot.dependencies ?? {})) {
    visit(name, node, [name])
  }

  const packages = [...reached.values()].sort(compareReachedPackage)
  const firstPartyPackages = packages.filter((pkg) => pkg.firstParty)
  const externalPackages = packages.filter((pkg) => !pkg.firstParty)

  for (const pkg of packages) {
    if (
      forbiddenReleasePackages.has(pkg.packageName) ||
      forbiddenReleasePackages.has(pkg.reachedName) ||
      packagePathBelongsToTools(repoRoot, pkg.packagePath)
    ) {
      throw new Error(
        `Forbidden dev-only package reached release closure: ${pkg.reachedName}`,
      )
    }
  }

  return { firstPartyPackages, externalPackages }
}

export function narrowCliClosureWithBunMetafile(
  closure: PackageClosure,
  metafile: unknown,
): PackageClosure {
  const fileInputs = collectMetafileFileInputs(metafile)
  const unresolvedImports = collectExternalMetafileImports(metafile)
  const allPackages = [
    ...closure.firstPartyPackages,
    ...closure.externalPackages,
  ]
  const packageByPath = allPackages
    .map((pkg) => ({
      package: pkg,
      normalizedPath: normalizePath(pkg.packagePath),
    }))
    .sort(
      (left, right) => right.normalizedPath.length - left.normalizedPath.length,
    )

  const usedPackageKeys = new Set<string>()
  for (const input of fileInputs) {
    const normalizedInput = normalizePath(input)
    const owner = packageByPath.find(({ normalizedPath }) =>
      isPathInside(normalizedInput, normalizedPath),
    )
    if (owner) {
      usedPackageKeys.add(
        packageKey(
          owner.package.packageName,
          owner.package.version,
          owner.package.packagePath,
        ),
      )
    }
  }

  const unresolved = [...unresolvedImports].filter(
    (specifier) => !isExplicitlyOwnedMetafileExternal(specifier),
  )
  if (unresolved.length > 0) {
    throw new Error(
      `Bun metafile contains external package imports that are not bundled or explicitly owned by runtime assets: ${unresolved.join(", ")}`,
    )
  }

  return {
    firstPartyPackages: closure.firstPartyPackages.filter((pkg) =>
      usedPackageKeys.has(
        packageKey(pkg.packageName, pkg.version, pkg.packagePath),
      ),
    ),
    externalPackages: closure.externalPackages.filter((pkg) =>
      usedPackageKeys.has(
        packageKey(pkg.packageName, pkg.version, pkg.packagePath),
      ),
    ),
  }
}

export async function runLicenseGate(
  options: LicenseGateOptions,
): Promise<void> {
  const root = options.root ?? rootDirectory
  const closure = await enumerateReleaseClosure(options, root)
  const metadata = await loadLicenseMetadata(options.app, root)
  const runtime = await collectRuntimeAssets(options, root)
  const packageSubjects = mergePackageSubjects([
    ...closure.externalPackages.map(
      (pkg): PackageNoticeSubject => ({
        ...pkg,
        kind: "package",
        source: `Production dependency path: ${pkg.path.join(" > ")}`,
      }),
    ),
    ...runtime.packageSubjects,
  ])
  const directSubjects = [...runtime.directSubjects]
  const packageExtraText = new Map<string, string[]>()

  await applyPackageInternalAssetRules({
    packageSubjects,
    directSubjects,
    packageExtraText,
    platform: options.platform,
  })

  const noticeEntries = await resolveNoticeEntries({
    packageSubjects,
    directSubjects,
    metadata,
    packageExtraText,
  })

  for (const entry of noticeEntries) {
    const classification = classifyLicenseExpression(entry.licenseExpression)
    if (!classification.ok) {
      throw new Error(
        `License gate failed for ${entry.name}@${entry.version}: ${classification.reason}`,
      )
    }
  }

  const manifest = formatNoticeManifest({
    app: options.app,
    platform: options.platform,
    artifactTargets: options.artifactTargets,
    firstPartyPackages: closure.firstPartyPackages,
    runtimeDecisions: runtime.decisions,
    entries: noticeEntries,
  })

  await mkdir(dirname(options.manifestOut), { recursive: true })
  await writeFile(options.manifestOut, manifest, "utf8")
}

async function enumerateReleaseClosure(
  options: LicenseGateOptions,
  root: string,
): Promise<PackageClosure> {
  const [listRoot] = await runPnpmJson<PnpmListNode[]>(
    [
      "--filter",
      appPackageByApp[options.app],
      "list",
      "--prod",
      "--depth",
      "Infinity",
      "--json",
    ],
    root,
  )

  if (!listRoot) {
    throw new Error(`pnpm list returned no root for ${options.app}.`)
  }

  let closure = enumeratePackageClosureFromList(listRoot, { repoRoot: root })

  if (options.app === "cli") {
    if (!options.bunMetafile) {
      throw new Error("CLI license gate requires --bun-metafile.")
    }
    const metafile = JSON.parse(await readFile(options.bunMetafile, "utf8"))
    closure = narrowCliClosureWithBunMetafile(closure, metafile)
  }

  return closure
}

async function loadLicenseMetadata(
  app: LicenseGateApp,
  root: string,
): Promise<Map<string, LicenseMetadataRecord>> {
  const raw = await runPnpmJson<Record<string, unknown>>(
    ["licenses", "list", "--filter", appPackageByApp[app], "--prod", "--json"],
    root,
  )
  const metadata = new Map<string, LicenseMetadataRecord>()

  for (const records of Object.values(raw)) {
    if (!Array.isArray(records)) {
      continue
    }
    for (const record of records) {
      if (!isPnpmLicenseRecord(record)) {
        continue
      }
      for (const version of record.versions) {
        for (const path of record.paths) {
          metadata.set(path, {
            name: record.name,
            version,
            path,
            license: record.license,
            author: record.author,
            homepage: record.homepage,
            description: record.description,
          })
        }
      }
    }
  }

  return metadata
}

async function collectRuntimeAssets(
  options: LicenseGateOptions,
  root: string,
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
    directSubjects.push(...resolveTokenizerGrammarRuntimeAssets())

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

function resolveTokenizerGrammarRuntimeAssets(): DirectNoticeSubject[] {
  return Object.values(TOKENIZER_GRAMMAR_ASSETS).map((entry) => {
    const noticeText =
      entry.noticeFile === null
        ? `No separate notice file is recorded for ${entry.upstreamSource}.`
        : readFileSync(resolveAssetUrlPath(entry.noticeFile), "utf8")

    return {
      id: `tokenizer-grammar:${entry.language}:${entry.assetSha256}`,
      kind: "runtime-asset",
      name: `${entry.acquisition.packageName} tokenizer grammar (${entry.language})`,
      version: entry.acquisition.packageVersion,
      licenseExpression: entry.spdxLicense,
      source: `Committed WASM asset ${basename(resolveAssetUrlPath(entry.assetUrl))} from ${entry.upstreamSource}`,
      licenseText: [
        `SPDX License: ${entry.spdxLicense}`,
        `Upstream source: ${entry.upstreamSource}`,
        `Grammar version: ${entry.grammarVersion}`,
        `Acquisition package: ${entry.acquisition.packageName}@${entry.acquisition.packageVersion}`,
        `Acquisition asset: ${entry.acquisition.assetPath}`,
      ].join("\n"),
      noticeText,
    }
  })
}

async function applyPackageInternalAssetRules(options: {
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

async function applyNestedNoticeRules(
  subject: PackageNoticeSubject,
  packageExtraText: Map<string, string[]>,
): Promise<void> {
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
    const notices = await readExistingTextFiles([
      join(vendorDirectory, "LICENSE"),
      join(vendorDirectory, "ATTRIBUTION.txt"),
    ])
    appendPackageExtraText(subject, packageExtraText, notices)
    return
  }

  if (subject.packageName === "electron") {
    const notices = await readExistingTextFiles([
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
    version: "15.1.0",
    licenseExpression: "Unlicense OR MIT",
    source: `@openai/codex ${subject.version} ${asset.relativePath} from ${provider.url}`,
    licenseText: noticeTexts.join("\n\n"),
  }
}

async function resolveNoticeEntries(options: {
  readonly packageSubjects: readonly PackageNoticeSubject[]
  readonly directSubjects: readonly DirectNoticeSubject[]
  readonly metadata: ReadonlyMap<string, LicenseMetadataRecord>
  readonly packageExtraText: ReadonlyMap<string, readonly string[]>
}): Promise<NoticeEntry[]> {
  const quantcoSubjects = options.packageSubjects.filter(
    (subject) => !usesManualPackageLicenseText(subject),
  )
  const dependencyRecords = quantcoSubjects.map((subject) =>
    toQuantcoDependency(subject, options.metadata),
  )
  const resolved = await resolveLicensesBestEffort(dependencyRecords)

  if (resolved.failed.length > 0) {
    throw new Error(
      `Could not extract license text for ${resolved.failed.map(formatQuantcoFailure).join(", ")}`,
    )
  }

  const resolvedByPath = new Map(
    resolved.successful.map((record) => [
      packageKey(record.name, record.version, record.path),
      record,
    ]),
  )

  const entries: NoticeEntry[] = []
  for (const subject of options.packageSubjects) {
    const metadata = toQuantcoDependency(subject, options.metadata)
    const extraText =
      options.packageExtraText.get(
        packageKey(subject.packageName, subject.version, subject.packagePath),
      ) ?? []
    const packageDisplayName =
      subject.reachedName === subject.packageName
        ? subject.packageName
        : `${subject.reachedName} (installed package ${subject.packageName})`

    if (usesManualPackageLicenseText(subject)) {
      if (extraText.length === 0) {
        throw new Error(
          `Manual package notice rule for ${subject.packageName}@${subject.version} produced no notice text.`,
        )
      }
      entries.push({
        id: packageKey(
          subject.packageName,
          subject.version,
          subject.packagePath,
        ),
        name: packageDisplayName,
        version: subject.version,
        licenseExpression: metadata.license,
        kind: subject.kind,
        source: subject.source,
        licenseText: extraText.join("\n\n"),
      })
      continue
    }

    const resolvedRecord = resolvedByPath.get(
      packageKey(metadata.name, metadata.version, metadata.path),
    )
    if (!resolvedRecord) {
      throw new Error(
        `Missing resolved license text for ${metadata.name}@${metadata.version}.`,
      )
    }

    entries.push({
      id: packageKey(subject.packageName, subject.version, subject.packagePath),
      name: packageDisplayName,
      version: subject.version,
      licenseExpression: metadata.license,
      kind: subject.kind,
      source: subject.source,
      licenseText: resolvedRecord.licenseText,
      additionalText: joinOptionalTexts([
        resolvedRecord.additionalText,
        ...extraText,
      ]),
      noticeText: resolvedRecord.noticeText,
    })
  }

  for (const subject of options.directSubjects) {
    entries.push({
      id: subject.id,
      name: subject.name,
      version: subject.version,
      licenseExpression: subject.licenseExpression,
      kind: subject.kind,
      source: subject.source,
      licenseText: subject.licenseText,
      noticeText: subject.noticeText,
    })
  }

  return entries.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
    ),
  )
}

function usesManualPackageLicenseText(subject: PackageNoticeSubject): boolean {
  return subject.packageName === "victory-vendor"
}

export function formatNoticeManifest(options: {
  readonly app: LicenseGateApp
  readonly platform: ReleasePlatform
  readonly artifactTargets: readonly string[]
  readonly firstPartyPackages: readonly ReachedPackage[]
  readonly runtimeDecisions: readonly ReleaseRuntimeDecision[]
  readonly entries: readonly NoticeEntry[]
}): string {
  const lines = [
    "RepoEdu Third-Party Notices",
    "",
    `App: ${options.app}`,
    `Platform: ${options.platform}`,
    `Artifact targets: ${options.artifactTargets.join(", ")}`,
    "",
    "RepoEdu first-party workspace packages are covered by the root MIT license.",
  ]

  for (const pkg of options.firstPartyPackages) {
    lines.push(`- ${pkg.packageName}@${pkg.version}`)
  }

  if (options.runtimeDecisions.length > 0) {
    lines.push("", "Release Runtime Target Decisions")
    for (const decision of options.runtimeDecisions) {
      lines.push(`- ${decision.target}: ${decision.decision}`)
    }
  }

  lines.push("", "Third-Party Notices")

  for (const entry of options.entries) {
    lines.push(
      "",
      "================================================================================",
      `${entry.name} (${entry.version})`,
      `Kind: ${entry.kind}`,
      `SPDX License: ${entry.licenseExpression}`,
      `Source: ${entry.source}`,
      "",
      "License Text:",
      entry.licenseText.trim(),
    )

    if (entry.noticeText?.trim()) {
      lines.push("", "Notice Text:", entry.noticeText.trim())
    }

    if (entry.additionalText?.trim()) {
      lines.push("", "Additional Notice Text:", entry.additionalText.trim())
    }
  }

  return `${lines.join("\n")}\n`
}

function toQuantcoDependency(
  subject: PackageNoticeSubject,
  metadata: ReadonlyMap<string, LicenseMetadataRecord>,
): QuantcoDependency {
  const packageJson = readPackageJson(subject.packagePath)
  const licenseMetadata = metadata.get(subject.packagePath)
  return {
    name: packageJson.name ?? licenseMetadata?.name ?? subject.packageName,
    version: packageJson.version ?? licenseMetadata?.version ?? subject.version,
    path: subject.packagePath,
    license: licenseMetadata?.license ?? packageJson.license ?? "Unknown",
    author: stringifyAuthor(packageJson.author) ?? licenseMetadata?.author,
    homepage: packageJson.homepage ?? licenseMetadata?.homepage,
    description: packageJson.description ?? licenseMetadata?.description,
  }
}

function formatQuantcoFailure(failure: unknown): string {
  if (isObjectRecord(failure)) {
    const dependency = failure.dependency
    if (isObjectRecord(dependency)) {
      const name =
        typeof dependency.name === "string" ? dependency.name : "unknown"
      const version =
        typeof dependency.version === "string" ? dependency.version : "unknown"
      return `${name}@${version}`
    }
    if (failure instanceof Error) {
      return failure.message
    }
  }
  return String(failure)
}

function mergePackageSubjects(
  subjects: readonly PackageNoticeSubject[],
): PackageNoticeSubject[] {
  const merged = new Map<string, PackageNoticeSubject>()
  for (const subject of subjects) {
    const key = packageKey(
      subject.packageName,
      subject.version,
      subject.packagePath,
    )
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, subject)
      continue
    }

    merged.set(key, {
      ...subject,
      reachedName: existing.reachedName,
      kind:
        existing.kind === "runtime-asset" || subject.kind === "runtime-asset"
          ? "runtime-asset"
          : "package",
      source: `${existing.source}; ${subject.source}`,
      path: existing.path,
    })
  }
  return [...merged.values()].sort(compareReachedPackage)
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

function collectEquivalentDependencyNodes(
  root: PnpmListNode,
): Map<string, PnpmListNode> {
  const equivalents = new Map<string, PnpmListNode>()

  function walk(name: string, node: PnpmListNode): void {
    if (!node.deduped && node.dependencies) {
      equivalents.set(dedupeKey(name, node), node)
    }
    for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
      walk(childName, child)
    }
  }

  for (const [name, node] of Object.entries(root.dependencies ?? {})) {
    walk(name, node)
  }

  return equivalents
}

function dependenciesSourceForNode(
  reachedName: string,
  node: PnpmListNode,
  equivalents: ReadonlyMap<string, PnpmListNode>,
): PnpmListNode {
  if (node.dependencies || !node.deduped || !node.dedupedDependenciesCount) {
    return node
  }

  const equivalent = equivalents.get(dedupeKey(reachedName, node))
  if (!equivalent) {
    throw new Error(
      `pnpm list marked ${reachedName}@${node.version ?? "unknown"} as deduped but no dependency source was found.`,
    )
  }

  return equivalent
}

function dedupeKey(name: string, node: PnpmListNode): string {
  return `${name}\0${node.version ?? ""}\0${node.path ?? ""}`
}

function normalizePackageVersion(
  version: string | undefined,
  packageJson: PackageJson,
): string {
  if (version?.startsWith("link:") || !version) {
    return packageJson.version ?? "0.0.0"
  }
  return version
}

function readPackageJson(packagePath: string): PackageJson {
  return JSON.parse(readFileSync(join(packagePath, "package.json"), "utf8"))
}

function isFirstPartyPackageName(packageName: string): boolean {
  return packageName.startsWith(firstPartyScope)
}

function packagePathBelongsToTools(
  repoRoot: string,
  packagePath: string,
): boolean {
  const repoRelativePath = normalizePath(relative(repoRoot, packagePath))
  return repoRelativePath.startsWith("tools/")
}

function packageKey(
  name: string,
  version: string,
  packagePath: string,
): string {
  return `${name}@${version}\0${packagePath}`
}

function compareReachedPackage(
  left: Pick<ReachedPackage, "packageName" | "version" | "packagePath">,
  right: Pick<ReachedPackage, "packageName" | "version" | "packagePath">,
): number {
  return `${left.packageName}@${left.version}\0${left.packagePath}`.localeCompare(
    `${right.packageName}@${right.version}\0${right.packagePath}`,
  )
}

function collectSpdxIds(node: SpdxExpressionNode): string[] {
  if ("license" in node) {
    return [node.license]
  }
  return [...collectSpdxIds(node.left), ...collectSpdxIds(node.right)]
}

function blueOakAllowlist(): Set<string> {
  const data = require("@blueoak/list/index.json") as BlueOakList
  return new Set(
    data.flatMap((rating) => rating.licenses.map((license) => license.id)),
  )
}

function blueOakCopyleftIds(): Set<string> {
  const data = require("@blueoak/copyleft/index.json") as BlueOakCopyleft
  return new Set(
    Object.values(data).flatMap((licenses) =>
      licenses.map((license) => license.id),
    ),
  )
}

function collectMetafileFileInputs(metafile: unknown): Set<string> {
  const inputs = new Set<string>()
  const typedMetafile = metafile as BunMetafileLike

  for (const key of Object.keys(typedMetafile.inputs ?? {})) {
    if (looksLikeFilePath(key)) {
      inputs.add(resolve(rootDirectory, key))
    }
  }

  walkJson(metafile, (value, key) => {
    if (
      typeof value === "string" &&
      (key === "path" || key === "input" || key === "file") &&
      looksLikeFilePath(value)
    ) {
      inputs.add(resolve(rootDirectory, value))
    }
  })

  return inputs
}

function collectExternalMetafileImports(metafile: unknown): Set<string> {
  const imports = new Set<string>()
  walkJson(metafile, (value) => {
    if (!isObjectRecord(value)) {
      return
    }
    const importRecord = value as BunMetafileImport
    if (
      importRecord.external &&
      typeof importRecord.path === "string" &&
      looksLikePackageSpecifier(importRecord.path)
    ) {
      imports.add(importRecord.path)
    }
  })
  return imports
}

function walkJson(
  value: unknown,
  visitor: (value: unknown, key: string | null) => void,
  key: string | null = null,
): void {
  visitor(value, key)
  if (Array.isArray(value)) {
    for (const item of value) {
      walkJson(item, visitor)
    }
  } else if (isObjectRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      walkJson(childValue, visitor, childKey)
    }
  }
}

function looksLikeFilePath(value: string): boolean {
  return (
    value.startsWith(".") ||
    value.startsWith("/") ||
    value.includes("/") ||
    /^[A-Za-z]:[\\/]/.test(value)
  )
}

function looksLikePackageSpecifier(value: string): boolean {
  return (
    !value.startsWith(".") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !nodeBuiltins.has(value)
  )
}

function isExplicitlyOwnedMetafileExternal(specifier: string): boolean {
  return (
    nodeBuiltins.has(specifier) ||
    specifier === "bun" ||
    specifier.startsWith("bun:")
  )
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/")
}

function isPathInside(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}/`)
}

type ExecutableAsset = {
  readonly relativePath: string
  readonly absolutePath: string
  readonly reason: "binary-magic" | "dotslash" | "executable-mode"
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
  const file = await readFile(path)
  return file.subarray(0, bytes)
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
        if (
          ["vendor", "lib-vendor", "third_party", "third-party"].includes(
            entry.name,
          )
        ) {
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

function resolveOpenAiCodexDotslashManifest(
  packagePath: string,
  packageVersion: string,
): string {
  const baseVersion = packageVersion.replace(
    /-(darwin|linux|win32)-(arm64|x64)$/,
    "",
  )
  const candidates = [
    join(packagePath, "bin/rg"),
    resolve(packagePath, "../../@openai/codex/bin/rg"),
    resolve(packagePath, "../codex/bin/rg"),
    join(
      nearestPnpmStore(packagePath),
      `@openai+codex@${baseVersion}`,
      "node_modules/@openai/codex/bin/rg",
    ),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `Could not locate @openai/codex bin/rg DotSlash manifest from ${packagePath}.`,
  )
}

function nearestPnpmStore(packagePath: string): string {
  const normalized = normalizePath(packagePath)
  const marker = "/node_modules/.pnpm/"
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex === -1) {
    return resolve(packagePath, "../../..")
  }

  return normalized.slice(0, markerIndex + marker.length - 1)
}

export function parseDotslashManifest(contents: string): DotSlashManifest {
  const jsonStart = contents.indexOf("{")
  if (jsonStart === -1) {
    throw new Error("DotSlash manifest does not contain JSON.")
  }
  return JSON.parse(contents.slice(jsonStart)) as DotSlashManifest
}

async function fetchVerifiedArchive(
  url: string,
  record: DotSlashManifest["platforms"][string],
): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    )
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length !== record.size) {
    throw new Error(
      `Archive size mismatch for ${url}: expected ${record.size}, got ${bytes.length}.`,
    )
  }
  if (record.hash !== "sha256") {
    throw new Error(`Unsupported DotSlash hash ${record.hash} for ${url}.`)
  }
  const digest = createHash("sha256").update(bytes).digest("hex")
  if (digest !== record.digest) {
    throw new Error(
      `Archive digest mismatch for ${url}: expected ${record.digest}, got ${digest}.`,
    )
  }

  return bytes
}

async function readArchiveTextFiles(
  archiveBytes: Buffer,
  format: "tar.gz" | "zip",
  paths: readonly string[],
): Promise<string[]> {
  if (format === "zip") {
    return readZipTextFiles(archiveBytes, paths)
  }
  return readTarGzTextFiles(archiveBytes, paths)
}

async function readZipTextFiles(
  archiveBytes: Buffer,
  paths: readonly string[],
): Promise<string[]> {
  const archiveBuffer = new ArrayBuffer(archiveBytes.byteLength)
  new Uint8Array(archiveBuffer).set(archiveBytes)
  const zipReader = new ZipReader(new BlobReader(new Blob([archiveBuffer])))
  try {
    const entries = await zipReader.getEntries()
    const textByPath = new Map<string, string>()
    for (const entry of entries) {
      if (!entry.filename || !paths.includes(entry.filename)) {
        continue
      }
      if (!("getData" in entry)) {
        continue
      }
      const text = await entry.getData(new TextWriter())
      if (typeof text === "string") {
        textByPath.set(entry.filename, text)
      }
    }
    return paths.map((path) => {
      const text = textByPath.get(path)
      if (!text) {
        throw new Error(`Archive is missing ${path}.`)
      }
      return text
    })
  } finally {
    await zipReader.close()
  }
}

async function readTarGzTextFiles(
  archiveBytes: Buffer,
  paths: readonly string[],
): Promise<string[]> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "repo-edu-license-"))
  const archivePath = join(tempDirectory, "archive.tar.gz")
  try {
    await writeFile(archivePath, archiveBytes)
    await extractTar({
      file: archivePath,
      cwd: tempDirectory,
      gzip: true,
      strict: true,
      preservePaths: false,
    })
    return Promise.all(
      paths.map((path) => readFile(join(tempDirectory, path), "utf8")),
    )
  } finally {
    await rm(tempDirectory, { force: true, recursive: true })
  }
}

function dotslashPlatformKey(platform: ReleasePlatform): string {
  switch (platform) {
    case "darwin-arm64":
      return "macos-aarch64"
    case "linux-arm64":
      return "linux-aarch64"
    case "linux-x64":
      return "linux-x86_64"
    case "windows-arm64":
      return "windows-aarch64"
    case "windows-x64":
      return "windows-x86_64"
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

async function readGlobbedTextFiles(
  directory: string,
  fileName: string,
): Promise<string[]> {
  if (!existsSync(directory)) {
    return []
  }
  const texts: string[] = []

  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile() && entry.name === fileName) {
        texts.push(await readFile(path, "utf8"))
      }
    }
  }

  await walk(directory)
  return texts
}

async function readExistingTextFiles(
  paths: readonly string[],
): Promise<string[]> {
  const texts: string[] = []
  for (const path of paths) {
    if (existsSync(path)) {
      texts.push(await readFile(path, "utf8"))
    }
  }
  return texts
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

function joinOptionalTexts(
  texts: readonly (string | undefined)[],
): string | undefined {
  const present = texts.filter(
    (text): text is string =>
      typeof text === "string" && text.trim().length > 0,
  )
  return present.length > 0 ? present.join("\n\n") : undefined
}

function stringifyAuthor(author: PackageJson["author"]): string | undefined {
  if (typeof author === "string") {
    return author
  }
  return author?.name
}

function isPnpmLicenseRecord(value: unknown): value is {
  readonly name: string
  readonly versions: readonly string[]
  readonly paths: readonly string[]
  readonly license: string
  readonly author?: string
  readonly homepage?: string
  readonly description?: string
} {
  if (!isObjectRecord(value)) {
    return false
  }
  return (
    typeof value.name === "string" &&
    Array.isArray(value.versions) &&
    value.versions.every((version) => typeof version === "string") &&
    Array.isArray(value.paths) &&
    value.paths.every((path) => typeof path === "string") &&
    typeof value.license === "string"
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function runPnpmJson<TValue>(
  args: readonly string[],
  cwd: string,
): Promise<TValue> {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 128,
  })
  return JSON.parse(stdout) as TValue
}

function resolveAssetUrlPath(value: string): string {
  if (value.startsWith("file:")) {
    return nodeFileURLToPath(value)
  }
  return value
}
