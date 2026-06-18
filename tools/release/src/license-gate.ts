import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { enumeratePackageClosureFromList } from "./license-gate/closure.js"
import {
  formatNoticeManifest,
  mergeNoticeEntries,
} from "./license-gate/notices.js"
import { classifyLicenseExpression } from "./license-gate/policy.js"
import { collectRuntimeNoticeEntries } from "./license-gate/runtime-assets.js"
import {
  assertScannerParity,
  scanPackageNotices,
} from "./license-gate/scanner.js"
import {
  appDirectoryByApp,
  resolveRepoRelativePath,
  rootDirectory,
  runPnpmJson,
} from "./license-gate/shared.js"
import type {
  CliReleasePlatform,
  DesktopReleasePlatform,
  LicenseGateApp,
  LicenseGateOptions,
  LicenseGateValidationOptions,
  PnpmListNode,
  ProductionDependencyViews,
} from "./license-gate/types.js"

export {
  extractRipgrepVersion,
  parseDotslashManifest,
} from "./license-gate/archive.js"
export {
  assertNoForbiddenProductionDependencies,
  enumeratePackageClosureFromList,
  findReachedPackageByReachedName,
} from "./license-gate/closure.js"
export {
  formatNoticeManifest,
  manifestFileName,
  mergeNoticeEntries,
  noticeSidecarName,
} from "./license-gate/notices.js"
export type { ClassificationResult } from "./license-gate/policy.js"
export { classifyLicenseExpression } from "./license-gate/policy.js"
export {
  resolveCliRuntimeNoticeEntries,
  resolveDesktopRuntimePackageEntries,
} from "./license-gate/runtime-assets.js"
export {
  assertScannerParity,
  scanPackageNotices,
  scanPackageNoticesFromStart,
} from "./license-gate/scanner.js"
export { readRequiredTextFiles } from "./license-gate/shared.js"
export type {
  CliLicenseGateOptions,
  CliReleasePlatform,
  DesktopLicenseGateOptions,
  DesktopReleasePlatform,
  LicenseGateApp,
  LicenseGateOptions,
  LicenseGateValidationOptions,
  NoticeEntry,
  PnpmListNode,
  ProductionDependencyViews,
  ReachedPackage,
  ReleasePlatform,
} from "./license-gate/types.js"

const appPackageByApp = {
  desktop: "@repo-edu/desktop",
  cli: "@repo-edu/cli",
} satisfies Record<LicenseGateApp, string>

const desktopTargetsByPlatform = {
  "darwin-arm64": ["dmg", "zip"],
  "linux-arm64": ["deb"],
  "linux-x64": ["deb"],
  "windows-arm64": ["nsis"],
  "windows-x64": ["nsis"],
} satisfies Record<DesktopReleasePlatform, readonly string[]>

const cliTargetsByPlatform = {
  "darwin-arm64": ["binary"],
  "linux-arm64": ["binary"],
  "linux-x64": ["binary"],
} satisfies Record<CliReleasePlatform, readonly string[]>

export async function runLicenseGate(
  options: LicenseGateOptions,
): Promise<void> {
  validateLicenseGateArtifactTargets(options)

  const root = options.root ?? rootDirectory
  const manifestOut = resolveRepoRelativePath(root, options.manifestOut)
  const dependencies = await enumerateProductionDependencies(options.app, root)
  const scannerPackages = await scanPackageNotices(options.app, root)

  assertScannerParity({
    scannerPackages,
    thirdParty: dependencies.thirdParty,
  })

  const runtime = await collectRuntimeNoticeEntries(
    options,
    root,
    dependencies.productionReached,
  )
  const noticeEntries = mergeNoticeEntries([
    ...scannerPackages,
    ...runtime.entries,
  ])

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
    runtimeDecisions: runtime.decisions,
    entries: noticeEntries,
  })

  await mkdir(dirname(manifestOut), { recursive: true })
  await writeFile(manifestOut, manifest, "utf8")
}

export function validateLicenseGateArtifactTargets(
  options: LicenseGateValidationOptions,
): void {
  const expectedTargets = expectedArtifactTargets(options)
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

function expectedArtifactTargets(
  options: LicenseGateValidationOptions,
): readonly string[] {
  if (options.app === "desktop") {
    return desktopTargetsByPlatform[options.platform]
  }

  const targets = cliTargetsByPlatform[options.platform as CliReleasePlatform]
  if (!targets) {
    throw new Error(
      `Unsupported release platform for cli: ${options.platform}. Expected: ${Object.keys(cliTargetsByPlatform).join(", ")}`,
    )
  }
  return targets
}

async function enumerateProductionDependencies(
  app: LicenseGateApp,
  root: string,
): Promise<ProductionDependencyViews> {
  const [listRoot] = await runPnpmJson<PnpmListNode[]>(
    [
      "--filter",
      appPackageByApp[app],
      "list",
      "--prod",
      "--depth",
      "Infinity",
      "--json",
    ],
    root,
  )

  if (!listRoot) {
    throw new Error(`pnpm list returned no root for ${app}.`)
  }

  return enumeratePackageClosureFromList(listRoot, { repoRoot: root })
}

export { appDirectoryByApp }
