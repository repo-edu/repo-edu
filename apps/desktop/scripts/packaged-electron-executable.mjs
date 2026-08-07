import { access } from "node:fs/promises"
import { join, resolve } from "node:path"

const desktopDir = resolve(import.meta.dirname, "..")

async function firstAccessiblePath(paths) {
  for (const path of paths) {
    try {
      await access(path)
      return path
    } catch {
      // Keep searching candidate packaged app paths.
    }
  }
  return undefined
}

function orderedByHostArch(primary, secondary) {
  return process.arch === "arm64" ? [primary, secondary] : [secondary, primary]
}

export function packagedElectronExecutableCandidates() {
  const releaseDir = resolve(desktopDir, "release")
  switch (process.platform) {
    case "darwin":
      return orderedByHostArch(
        join(
          releaseDir,
          "mac-arm64",
          "RepoEdu.app",
          "Contents",
          "MacOS",
          "RepoEdu",
        ),
        join(
          releaseDir,
          "mac",
          "RepoEdu.app",
          "Contents",
          "MacOS",
          "RepoEdu",
        ),
      )
    case "linux":
      return orderedByHostArch(
        join(releaseDir, "linux-arm64-unpacked", "repo-edu"),
        join(releaseDir, "linux-unpacked", "repo-edu"),
      )
    case "win32":
      return orderedByHostArch(
        join(releaseDir, "win-arm64-unpacked", "RepoEdu.exe"),
        join(releaseDir, "win-unpacked", "RepoEdu.exe"),
      )
    default:
      return []
  }
}

export async function findPackagedElectronExecutable() {
  return await firstAccessiblePath(packagedElectronExecutableCandidates())
}
