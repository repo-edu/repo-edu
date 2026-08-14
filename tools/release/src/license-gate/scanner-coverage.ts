import { compareReachedPackage } from "./closure.js"
import {
  type ScannedPackageNotice,
  scanPackageNoticesFromStart,
} from "./scanner.js"
import { canonicalPackagePath, packageKey } from "./shared.js"
import type { NoticeEntry, ReachedPackage } from "./types.js"

type ScannerCoverage = {
  readonly scannerPackages: readonly ScannedPackageNotice[]
  readonly thirdParty: readonly ReachedPackage[]
  readonly runtimePackages?: readonly NoticeEntry[]
}

export async function completeScannerPackageNotices(
  options: ScannerCoverage & { readonly sourceRoot: string },
): Promise<ScannedPackageNotice[]> {
  const supplementalPackages: ScannedPackageNotice[] = []
  for (const pkg of scannerMisses(options)) {
    if (!pkg.packageDirectoryExists || isExpectedScannerMiss(pkg)) {
      continue
    }

    const scanned = await scanPackageNoticesFromStart(
      pkg.packagePath,
      options.sourceRoot,
    )
    const expectedId = packageKey(
      pkg.packageName,
      pkg.version,
      canonicalPackagePath(pkg.packagePath),
    )
    const packageNotice = scanned.find((entry) => entry.id === expectedId)
    if (packageNotice) {
      supplementalPackages.push(packageNotice)
    }
  }

  const completedById = new Map(
    [...options.scannerPackages, ...supplementalPackages].map((entry) => [
      entry.id,
      entry,
    ]),
  )
  const completed = [...completedById.values()].sort((left, right) =>
    compareReachedPackage(left, right),
  )

  assertScannerParity({
    scannerPackages: completed,
    thirdParty: options.thirdParty,
    runtimePackages: options.runtimePackages,
  })
  return completed
}

export function assertScannerParity(options: ScannerCoverage): void {
  const unexpected = scannerMisses(options).filter(
    (pkg) => !isExpectedScannerMiss(pkg),
  )
  if (unexpected.length > 0) {
    throw new Error(
      `License checker missed production package(s): ${unexpected.map(formatReachedPackageDiagnostic).join(", ")}`,
    )
  }
}

function scannerMisses(options: ScannerCoverage): ReachedPackage[] {
  const scannerByBase = groupByBaseIdentity(options.scannerPackages)
  const thirdPartyByBase = groupByBaseIdentity(options.thirdParty)
  const runtimePackageIds = new Set(
    (options.runtimePackages ?? []).map((entry) => entry.id),
  )
  return options.thirdParty.filter((pkg) => {
    if (
      runtimePackageIds.has(
        packageKey(pkg.packageName, pkg.version, pkg.packagePath),
      )
    ) {
      return false
    }
    const scannerMatches = scannerByBase.get(baseIdentity(pkg))
    if (!scannerMatches) {
      return true
    }
    const thirdPartyMatches = thirdPartyByBase.get(baseIdentity(pkg)) ?? []
    if (scannerMatches.length === 1 && thirdPartyMatches.length === 1) {
      return false
    }
    return !scannerMatches.some(
      (match) => match.packagePath === pkg.packagePath,
    )
  })
}

function groupByBaseIdentity<
  T extends { readonly packageName: string; readonly version: string },
>(packages: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const pkg of packages) {
    const key = baseIdentity(pkg)
    grouped.set(key, [...(grouped.get(key) ?? []), pkg])
  }
  return grouped
}

function baseIdentity(pkg: {
  readonly packageName: string
  readonly version: string
}): string {
  return `${pkg.packageName}@${pkg.version}`
}

function isExpectedScannerMiss(pkg: ReachedPackage): boolean {
  return (
    isOpenAiCodexPlatformOptional(pkg) ||
    isAbsentKoffiPlatformOptional(pkg) ||
    isElectronBuildTimeSubtreeMiss(pkg)
  )
}

function isOpenAiCodexPlatformOptional(pkg: ReachedPackage): boolean {
  return /^@openai\/codex-(?:darwin|linux|win32)-/.test(pkg.reachedName)
}

function isAbsentKoffiPlatformOptional(pkg: ReachedPackage): boolean {
  return (
    !pkg.packageDirectoryExists &&
    /^@koromix\/koffi-(?:darwin|freebsd|linux|openbsd|win32)-/.test(
      pkg.reachedName,
    ) &&
    pkg.paths.length > 0 &&
    pkg.paths.every(
      (path) => path.at(-1) === pkg.reachedName && path.at(-2) === "koffi",
    )
  )
}

function isElectronBuildTimeSubtreeMiss(pkg: ReachedPackage): boolean {
  return (
    pkg.paths.length > 0 &&
    pkg.paths.every((path) => {
      const electronIndex = path.indexOf("electron")
      return electronIndex > 0 && path[electronIndex - 1] === "trpc-electron"
    })
  )
}

function formatReachedPackageDiagnostic(pkg: ReachedPackage): string {
  return `${pkg.reachedName} (${pkg.packageName}@${pkg.version}) via ${pkg.paths.map((path) => path.join(" > ")).join(" | ")}`
}
