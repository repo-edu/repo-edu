import { basename, extname, join } from "node:path"
import {
  init,
  type ModuleInfo,
  type ModuleInfos,
} from "license-checker-rseidelsohn"
import { compareReachedPackage } from "./closure.js"
import {
  appDirectoryByApp,
  canonicalPackagePath,
  formatEvidencePath,
  isObjectRecord,
  packageKey,
  packageMetadataEvidence,
  readPackageJson,
  readRequiredTextFile,
} from "./shared.js"
import type { LicenseGateApp, NoticeEntry } from "./types.js"

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

export async function scanPackageNotices(
  app: LicenseGateApp,
  root: string,
): Promise<ScannedPackageNotice[]> {
  return scanPackageNoticesFromStart(join(root, appDirectoryByApp[app]), root)
}

export async function scanPackageNoticesFromStart(
  start: string,
  sourceRoot = start,
): Promise<ScannedPackageNotice[]> {
  const scan = await runLicenseChecker(start)
  const entries = await Promise.all(
    Object.entries(scan).map(([moduleKey, record]) =>
      toScannedPackageNotice(
        moduleKey,
        record,
        canonicalPackagePath(sourceRoot),
      ),
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
}

async function runLicenseChecker(start: string): Promise<ModuleInfos> {
  return new Promise((resolve, reject) => {
    init(
      {
        start,
        production: true,
        unknown: true,
        excludePrivatePackages: true,
        customFormat: scannerCustomFormat,
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
  sourceRoot: string,
): Promise<ScannedPackageNotice> {
  const packageName = nonEmptyString(record.name, moduleKey, "name")
  const version = nonEmptyString(record.version, moduleKey, "version")
  const rawPackagePath = nonEmptyString(record.path, moduleKey, "path")
  const packagePath = canonicalPackagePath(rawPackagePath)
  const packageJson = readPackageJson(packagePath)
  const licenseFile = optionalString(
    record.licenseFile,
    moduleKey,
    "licenseFile",
  )
  // The checker selects README last when no dedicated license file exists.
  // Keep discovery in the checker, but never label README content as license text.
  const dedicatedLicenseFile =
    licenseFile &&
    basename(licenseFile, extname(licenseFile)).toUpperCase() !== "README"
      ? licenseFile
      : undefined
  const licenseExpression = normalizeLicenseExpression(
    dedicatedLicenseFile ? record.licenses : packageJson.license,
    moduleKey,
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

  const base = {
    id: packageKey(packageName, version, packagePath),
    packageName,
    packagePath,
    kind: "package",
    name: packageName,
    version,
    licenseExpression,
    noticeText,
  } as const

  if (dedicatedLicenseFile) {
    return {
      ...base,
      source: `license-checker-rseidelsohn package notice from ${formatEvidencePath(canonicalPackagePath(dedicatedLicenseFile), sourceRoot)}`,
      licenseText: nonEmptyString(record.licenseText, moduleKey, "licenseText"),
    }
  }

  return {
    ...base,
    source: `Package metadata from ${formatEvidencePath(join(packagePath, "package.json"), sourceRoot)}`,
    licenseEvidence: packageMetadataEvidence({
      name: packageName,
      version,
      licenseExpression,
      packageJson,
      context:
        "License checker found no dedicated package license file; the installed package declaration supplies the license evidence.",
    }),
  }
}

function normalizeLicenseExpression(value: unknown, moduleKey: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim()
  }
  // license-checker reports an array when a package declares several licenses.
  // Join with AND so the policy gate must accept every one: a genuine `A OR B`
  // package is over-constrained but never under-gated.
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
