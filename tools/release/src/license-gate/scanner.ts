import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  init,
  type ModuleInfo,
  type ModuleInfos,
} from "license-checker-rseidelsohn"
import { compareReachedPackage } from "./closure.js"
import { licenseTextForSpdxId } from "./license-text.js"
import {
  appDirectoryByApp,
  isObjectRecord,
  packageKey,
  readRequiredTextFile,
} from "./shared.js"
import type { LicenseGateApp, NoticeEntry, ReachedPackage } from "./types.js"

export type ScannedPackageNotice = NoticeEntry & {
  readonly packageName: string
  readonly packagePath: string
}

const scannerCustomFormat = {
  name: "",
  version: "",
  licenses: "",
  path: "",
  licenseFile: "",
  licenseText: "",
  noticeFile: "",
} as const

const checkerClarificationLicenses = {
  "@openai/codex@0.128.0": "Apache-2.0",
  "trpc-electron@0.1.2": "MIT",
} as const

export async function scanPackageNotices(
  app: LicenseGateApp,
  root: string,
): Promise<ScannedPackageNotice[]> {
  return scanPackageNoticesFromStart(join(root, appDirectoryByApp[app]))
}

export async function scanPackageNoticesFromStart(
  start: string,
): Promise<ScannedPackageNotice[]> {
  const clarificationsDirectory = await mkdtemp(
    join(tmpdir(), "repo-edu-license-checker-"),
  )
  const clarificationsFile = join(
    clarificationsDirectory,
    "clarifications.json",
  )
  try {
    await writeFile(
      clarificationsFile,
      `${JSON.stringify(buildClarifications(), null, 2)}\n`,
      "utf8",
    )
    const scan = await runLicenseChecker({
      start,
      clarificationsFile,
    })
    const entries = await Promise.all(
      Object.entries(scan).map(([moduleKey, record]) =>
        toScannedPackageNotice(moduleKey, record),
      ),
    )
    return entries.sort((left, right) =>
      compareReachedPackage(
        {
          packageName: left.packageName,
          version: left.version,
          packagePath: left.packagePath,
        },
        {
          packageName: right.packageName,
          version: right.version,
          packagePath: right.packagePath,
        },
      ),
    )
  } finally {
    await rm(clarificationsDirectory, { force: true, recursive: true })
  }
}

export function assertScannerParity(options: {
  readonly scannerPackages: readonly ScannedPackageNotice[]
  readonly thirdParty: readonly ReachedPackage[]
}): void {
  const scannerByBase = groupByBaseIdentity(options.scannerPackages)
  const thirdPartyByBase = groupByBaseIdentity(options.thirdParty)
  const misses = options.thirdParty.filter((pkg) => {
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

  const unexpected = misses.filter((pkg) => !isExpectedScannerMiss(pkg))
  if (unexpected.length > 0) {
    throw new Error(
      `License checker missed production package(s): ${unexpected.map(formatReachedPackageDiagnostic).join(", ")}`,
    )
  }
}

function buildClarifications(): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(checkerClarificationLicenses).map(([packageId, license]) => [
      packageId,
      {
        licenses: license,
        licenseText: licenseTextForSpdxId(license),
      },
    ]),
  )
}

async function runLicenseChecker(options: {
  readonly start: string
  readonly clarificationsFile: string
}): Promise<ModuleInfos> {
  return new Promise((resolve, reject) => {
    init(
      {
        start: options.start,
        production: true,
        unknown: true,
        excludePrivatePackages: true,
        customFormat: scannerCustomFormat,
        clarificationsFile: options.clarificationsFile,
      },
      (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      },
    )
  })
}

async function toScannedPackageNotice(
  moduleKey: string,
  record: ModuleInfo,
): Promise<ScannedPackageNotice> {
  const packageName = nonEmptyString(record.name, moduleKey, "name")
  const version = nonEmptyString(record.version, moduleKey, "version")
  const packagePath = nonEmptyString(record.path, moduleKey, "path")
  const licenseExpression = normalizeLicenseExpression(
    record.licenses,
    moduleKey,
  )
  const licenseText = nonEmptyString(
    record.licenseText,
    moduleKey,
    "licenseText",
  )
  const licenseFile = optionalString(
    record.licenseFile,
    moduleKey,
    "licenseFile",
  )
  const noticeFile = optionalString(record.noticeFile, moduleKey, "noticeFile")
  const noticeText = noticeFile
    ? await readRequiredTextFile(noticeFile)
    : undefined

  if (/unknown/i.test(licenseExpression) || /\*$/.test(licenseExpression)) {
    throw new Error(
      `License checker reported unknown or guessed license for ${moduleKey}: ${licenseExpression}`,
    )
  }

  return {
    id: packageKey(packageName, version, packagePath),
    packageName,
    packagePath,
    kind: "package",
    name: packageName,
    version,
    licenseExpression,
    source: scannerSource(licenseFile),
    licenseText,
    noticeText,
  }
}

function normalizeLicenseExpression(value: unknown, moduleKey: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim()
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  ) {
    return value.map((entry) => entry.trim()).join(" AND ")
  }
  throw new Error(
    `License checker produced no license expression for ${moduleKey}.`,
  )
}

function nonEmptyString(
  value: unknown,
  moduleKey: string,
  field: string,
): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  throw new Error(
    `License checker produced unusable ${field} for ${moduleKey}.`,
  )
}

function optionalString(
  value: unknown,
  moduleKey: string,
  field: string,
): string | undefined {
  if (typeof value === "undefined" || value === "") {
    return undefined
  }
  if (typeof value === "string") {
    return value
  }
  if (isObjectRecord(value) || typeof value === "boolean") {
    throw new Error(
      `License checker produced unusable ${field} for ${moduleKey}.`,
    )
  }
  return undefined
}

function scannerSource(licenseFile: string | undefined): string {
  return licenseFile
    ? `license-checker-rseidelsohn package notice from ${licenseFile}`
    : "license-checker-rseidelsohn package notice from checker clarification"
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
  return isOpenAiCodexPlatformOptional(pkg) || pkg.path.includes("electron")
}

function isOpenAiCodexPlatformOptional(pkg: ReachedPackage): boolean {
  return /^@openai\/codex-(?:darwin|linux|win32)-/.test(pkg.reachedName)
}

function formatReachedPackageDiagnostic(pkg: ReachedPackage): string {
  return `${pkg.reachedName} (${pkg.packageName}@${pkg.version}) via ${pkg.path.join(" > ")}`
}
