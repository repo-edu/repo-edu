import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

// Third-party packages that ship no scanner-discoverable license file and so
// rely on metadata-only evidence. Keys are pinned to the installed
// `name@version` because license-checker matches clarifications by exact
// version: a codex-sdk or trpc-electron bump invalidates the key, the scanner
// then reports no license file and the gate fails closed until the pin is
// refreshed against pnpm-lock.yaml. That coupling is deliberate, not an
// oversight, because it forces a re-check whenever the package, and therefore
// its licensing, changes.
const checkerClarifications = {
  "@openai/codex@0.128.0": {
    license: "Apache-2.0",
    context:
      "License checker clarification for @openai/codex publishes the package metadata license because the installed package has no dedicated license file.",
  },
  "trpc-electron@0.1.2": {
    license: "MIT",
    context:
      "License checker clarification for trpc-electron publishes the package metadata license because the installed package has no dedicated license file.",
  },
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
        toScannedPackageNotice(moduleKey, record, sourceRoot),
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
    Object.entries(checkerClarifications).map(([packageId, clarification]) => [
      packageId,
      {
        licenses: clarification.license,
        licenseText: clarification.context,
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
  sourceRoot: string,
): Promise<ScannedPackageNotice> {
  const packageName = nonEmptyString(record.name, moduleKey, "name")
  const version = nonEmptyString(record.version, moduleKey, "version")
  const rawPackagePath = nonEmptyString(record.path, moduleKey, "path")
  const packagePath = canonicalPackagePath(rawPackagePath)
  const packageJson = readPackageJson(packagePath)
  const licenseExpression = normalizeLicenseExpression(
    record.licenses,
    moduleKey,
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

  // A clarified package is the only metadata-only path: it carries no scanner
  // license file by design, so it skips the file/text requirement below.
  const clarification = checkerClarificationFor(`${packageName}@${version}`)
  if (clarification) {
    return {
      ...base,
      source: scannerSource({
        licenseFile,
        packageName,
        version,
        sourceRoot,
        explicitMetadataEvidence: true,
      }),
      licenseEvidence: packageMetadataEvidence({
        name: packageName,
        version,
        licenseExpression,
        packageJson,
        context: clarification.context,
      }),
    }
  }

  if (!licenseFile) {
    throw new Error(
      `License checker produced no scanner-owned license file for ${moduleKey}. Add an explicit checker clarification before shipping metadata-only notice evidence.`,
    )
  }

  return {
    ...base,
    source: scannerSource({
      licenseFile,
      packageName,
      version,
      sourceRoot,
      explicitMetadataEvidence: false,
    }),
    licenseText: nonEmptyString(record.licenseText, moduleKey, "licenseText"),
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

type ScannerClarificationId = keyof typeof checkerClarifications

function checkerClarificationFor(
  id: string,
): (typeof checkerClarifications)[ScannerClarificationId] | undefined {
  return Object.hasOwn(checkerClarifications, id)
    ? checkerClarifications[id as ScannerClarificationId]
    : undefined
}

function scannerSource(options: {
  readonly licenseFile: string | undefined
  readonly packageName: string
  readonly version: string
  readonly sourceRoot: string
  readonly explicitMetadataEvidence: boolean
}): string {
  if (options.explicitMetadataEvidence) {
    return `license-checker-rseidelsohn metadata clarification for ${options.packageName}@${options.version}`
  }
  return options.licenseFile
    ? `license-checker-rseidelsohn package notice from ${formatEvidencePath(options.licenseFile, options.sourceRoot)}`
    : "license-checker-rseidelsohn package notice"
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
