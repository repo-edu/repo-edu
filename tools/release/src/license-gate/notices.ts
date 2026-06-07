import { packageKey } from "./shared.js"
import type {
  LicenseGateApp,
  NoticeEntry,
  ReleasePlatform,
  ReleaseRuntimeDecision,
} from "./types.js"

export function noticeSidecarName(binaryName: string): string {
  return `${binaryName}.third-party-notices.txt`
}

export function manifestFileName(
  app: LicenseGateApp,
  platform: ReleasePlatform,
): string {
  return `RepoEdu-third-party-notices-${app}-${platform}.txt`
}

export function noticeEntryId(entry: {
  readonly name: string
  readonly version: string
  readonly packagePath?: string
}): string {
  return packageKey(entry.name, entry.version, entry.packagePath ?? entry.name)
}

export function mergeNoticeEntries(
  entries: readonly NoticeEntry[],
): NoticeEntry[] {
  const merged = new Map<string, NoticeEntry>()
  for (const entry of entries) {
    const existing = merged.get(entry.id)
    if (!existing) {
      merged.set(entry.id, entry)
      continue
    }

    merged.set(entry.id, {
      ...existing,
      kind:
        existing.kind === "runtime-asset" || entry.kind === "runtime-asset"
          ? "runtime-asset"
          : existing.kind,
      licenseText: existing.licenseText ?? entry.licenseText,
      licenseEvidence: existing.licenseEvidence ?? entry.licenseEvidence,
      source:
        joinTexts([existing.source, entry.source], "; ") ?? existing.source,
      noticeText: joinTexts([existing.noticeText, entry.noticeText], "\n\n"),
      additionalText: joinTexts(
        [existing.additionalText, entry.additionalText],
        "\n\n",
      ),
    })
  }
  return [...merged.values()].sort((left, right) =>
    `${left.name}@${left.version}\0${left.id}`.localeCompare(
      `${right.name}@${right.version}\0${right.id}`,
    ),
  )
}

export function formatNoticeManifest(options: {
  readonly app: LicenseGateApp
  readonly platform: ReleasePlatform
  readonly artifactTargets: readonly string[]
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
    "RepoEdu first-party code is covered by the repository root MIT license.",
  ]

  if (options.runtimeDecisions.length > 0) {
    lines.push("", "Release Runtime Target Decisions")
    for (const decision of options.runtimeDecisions) {
      lines.push(`- ${decision.target}: ${decision.decision}`)
    }
  }

  lines.push("", "Third-Party Notices")

  for (const entry of options.entries) {
    const licenseText = entry.licenseText?.trim()
    const licenseEvidence = entry.licenseEvidence?.trim()
    if (!licenseText && !licenseEvidence) {
      throw new Error(
        `Notice entry ${entry.name}@${entry.version} has no license text or metadata evidence.`,
      )
    }

    lines.push(
      "",
      "================================================================================",
      `${entry.name} (${entry.version})`,
      `Kind: ${entry.kind}`,
      `SPDX License: ${entry.licenseExpression}`,
      `Source: ${entry.source}`,
    )

    if (licenseText) {
      lines.push("", "License Text:", licenseText)
    }

    if (licenseEvidence) {
      lines.push("", "License Evidence:", licenseEvidence)
    }

    if (entry.noticeText?.trim()) {
      lines.push("", "Notice Text:", entry.noticeText.trim())
    }

    if (entry.additionalText?.trim()) {
      lines.push("", "Additional Notice Text:", entry.additionalText.trim())
    }
  }

  return `${lines.join("\n")}\n`
}

function joinTexts(
  texts: readonly (string | undefined)[],
  separator: string,
): string | undefined {
  const present = texts.filter(
    (text): text is string =>
      typeof text === "string" && text.trim().length > 0,
  )
  return present.length > 0 ? present.join(separator) : undefined
}
