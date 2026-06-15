import { homedir } from "node:os"
import path from "node:path"

export type ResolveRepoEduAppDataRootOptions = {
  platform?: NodeJS.Platform
  homeDirectory?: string
  platformAppDataDirectory?: string | null
  roamingAppDataDirectory?: string | null
  xdgConfigHome?: string | null
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

function pathForPlatform(platform: NodeJS.Platform): typeof path.posix {
  return platform === "win32" ? path.win32 : path.posix
}

function resolvePlatformAppDataDirectory(
  options: Required<
    Pick<ResolveRepoEduAppDataRootOptions, "platform" | "homeDirectory">
  > &
    Pick<
      ResolveRepoEduAppDataRootOptions,
      "platformAppDataDirectory" | "roamingAppDataDirectory" | "xdgConfigHome"
    >,
): string {
  const explicitBase = nonEmpty(options.platformAppDataDirectory)
  if (explicitBase !== null) {
    return explicitBase
  }

  const platformPath = pathForPlatform(options.platform)

  if (options.platform === "darwin") {
    return platformPath.join(
      options.homeDirectory,
      "Library",
      "Application Support",
    )
  }

  if (options.platform === "win32") {
    return (
      nonEmpty(options.roamingAppDataDirectory) ??
      platformPath.join(options.homeDirectory, "AppData", "Roaming")
    )
  }

  return (
    nonEmpty(options.xdgConfigHome) ??
    platformPath.join(options.homeDirectory, ".config")
  )
}

export function resolveRepoEduAppDataRoot(
  options: ResolveRepoEduAppDataRootOptions = {},
): string {
  const platform = options.platform ?? process.platform
  const homeDirectory = options.homeDirectory ?? homedir()
  const platformPath = pathForPlatform(platform)
  const roamingAppDataDirectory =
    "roamingAppDataDirectory" in options
      ? options.roamingAppDataDirectory
      : process.env.APPDATA
  const xdgConfigHome =
    "xdgConfigHome" in options
      ? options.xdgConfigHome
      : process.env.XDG_CONFIG_HOME
  const appDataDirectory = resolvePlatformAppDataDirectory({
    platform,
    homeDirectory,
    platformAppDataDirectory: options.platformAppDataDirectory,
    roamingAppDataDirectory,
    xdgConfigHome,
  })

  return platformPath.join(appDataDirectory, "repo-edu")
}
