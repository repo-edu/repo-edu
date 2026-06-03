import { resolveLicensesBestEffort } from "@quantco/pnpm-licenses/dist/api.mjs"
import { compareReachedPackage } from "./closure.js"
import { isObjectRecord, packageKey, readPackageJson } from "./shared.js"
import type {
  DirectNoticeSubject,
  LicenseGateApp,
  LicenseMetadataRecord,
  PackageJson,
  PackageNoticeSubject,
  ReachedPackage,
  ReleasePlatform,
  ReleaseRuntimeDecision,
} from "./types.js"

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

export function noticeSidecarName(binaryName: string): string {
  return `${binaryName}.third-party-notices.txt`
}

export function manifestFileName(
  app: LicenseGateApp,
  platform: ReleasePlatform,
): string {
  return `RepoEdu-third-party-notices-${app}-${platform}.txt`
}

export function mergePackageSubjects(
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

export async function resolveNoticeEntries(options: {
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
