import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  assertDesktopBundleInputsCovered,
  narrowCliClosureWithBunMetafile,
} from "./license-gate/cli-metafile.js"
import { enumeratePackageClosureFromList } from "./license-gate/closure.js"
import {
  formatNoticeManifest,
  mergePackageSubjects,
  resolveNoticeEntries,
} from "./license-gate/notices.js"
import { classifyLicenseExpression } from "./license-gate/policy.js"
import { collectRuntimeAssets } from "./license-gate/runtime-assets.js"
import {
  appDirectoryByApp,
  isObjectRecord,
  resolveRepoRelativePath,
  rootDirectory,
  runPnpmJson,
} from "./license-gate/shared.js"
import { applyPackageInternalAssetRules } from "./license-gate/sub-assets.js"
import type {
  LicenseGateApp,
  LicenseGateOptions,
  LicenseMetadataRecord,
  PackageClosure,
  PackageNoticeSubject,
  PnpmListNode,
} from "./license-gate/types.js"

export {
  extractRipgrepVersion,
  parseDotslashManifest,
} from "./license-gate/archive.js"
export {
  assertDesktopBundleInputsCovered,
  narrowCliClosureWithBunMetafile,
} from "./license-gate/cli-metafile.js"
export { enumeratePackageClosureFromList } from "./license-gate/closure.js"
export {
  formatNoticeManifest,
  manifestFileName,
  noticeSidecarName,
} from "./license-gate/notices.js"
export type { ClassificationResult } from "./license-gate/policy.js"
export { classifyLicenseExpression } from "./license-gate/policy.js"
export {
  resolveCliRuntimePackageSubjects,
  resolveDesktopRuntimePackageSubjects,
} from "./license-gate/runtime-assets.js"
export { readRequiredTextFiles } from "./license-gate/shared.js"
export type {
  LicenseGateApp,
  LicenseGateOptions,
  PackageClosure,
  PnpmListNode,
  ReachedPackage,
  ReleasePlatform,
} from "./license-gate/types.js"

const appPackageByApp = {
  desktop: "@repo-edu/desktop",
  cli: "@repo-edu/cli",
} satisfies Record<LicenseGateApp, string>

const desktopTargetsByPlatform = {
  "darwin-arm64": ["dmg", "zip"],
  "linux-arm64": ["AppImage", "deb"],
  "linux-x64": ["AppImage", "deb"],
  "windows-arm64": ["nsis"],
  "windows-x64": ["nsis"],
} satisfies Record<LicenseGateOptions["platform"], readonly string[]>

export async function runLicenseGate(
  options: LicenseGateOptions,
): Promise<void> {
  validateLicenseGateArtifactTargets(options)

  const root = options.root ?? rootDirectory
  const manifestOut = resolveRepoRelativePath(root, options.manifestOut)
  const closure = await enumerateReleaseClosure(options, root)
  const metadata = await loadLicenseMetadata(options.app, root)
  const runtime = await collectRuntimeAssets(options, root, closure)
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

  await mkdir(dirname(manifestOut), { recursive: true })
  await writeFile(manifestOut, manifest, "utf8")
}

export function validateLicenseGateArtifactTargets(
  options: Pick<LicenseGateOptions, "app" | "artifactTargets" | "platform">,
): void {
  const expectedTargets =
    options.app === "cli"
      ? ["binary"]
      : desktopTargetsByPlatform[options.platform]
  const expected = new Set(expectedTargets)
  const actual = new Set(options.artifactTargets)

  if (
    actual.size !== options.artifactTargets.length ||
    actual.size !== expected.size ||
    ![...actual].every((target) => expected.has(target))
  ) {
    throw new Error(
      `Unsupported artifact targets for ${options.app} on ${options.platform}: ${options.artifactTargets.join(", ")}. Expected: ${expectedTargets.join(", ")}`,
    )
  }
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
    const metafile = JSON.parse(
      await readFile(
        resolveRepoRelativePath(root, options.bunMetafile),
        "utf8",
      ),
    )
    closure = narrowCliClosureWithBunMetafile(closure, metafile, {
      repoRoot: root,
      appSourceDirectories: [resolve(root, appDirectoryByApp.cli)],
    })
  }

  if (options.app === "desktop") {
    if (!options.desktopBundleManifest) {
      throw new Error(
        "Desktop license gate requires --desktop-bundle-manifest.",
      )
    }
    const manifest = JSON.parse(
      await readFile(
        resolveRepoRelativePath(root, options.desktopBundleManifest),
        "utf8",
      ),
    )
    assertDesktopBundleInputsCovered(closure, manifest, {
      repoRoot: root,
      appSourceDirectories: [resolve(root, appDirectoryByApp.desktop)],
    })
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
