import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { normalizePath } from "./shared.js"
import type { ReleasePlatform } from "./types.js"

export type DotSlashManifest = {
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

export function resolveOpenAiCodexDotslashManifest(
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

export function extractRipgrepVersion(
  record: DotSlashManifest["platforms"][string],
  providerUrl: string,
): string {
  const pathVersion = /(?:^|\/)ripgrep-([0-9]+\.[0-9]+\.[0-9]+)(?:[-/]|$)/.exec(
    record.path,
  )?.[1]
  const urlVersion = /\/download\/([^/]+)\//.exec(providerUrl)?.[1]
  const versions = [pathVersion, urlVersion].filter(
    (version): version is string => typeof version === "string",
  )
  const uniqueVersions = new Set(versions)

  if (uniqueVersions.size !== 1) {
    throw new Error(
      `Could not derive a single ripgrep version from DotSlash path ${record.path} and provider ${providerUrl}.`,
    )
  }

  const version = versions[0]
  if (!version) {
    throw new Error(
      `Could not derive ripgrep version from DotSlash path ${record.path} and provider ${providerUrl}.`,
    )
  }
  return version
}

export function dotslashPlatformKey(platform: ReleasePlatform): string {
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
