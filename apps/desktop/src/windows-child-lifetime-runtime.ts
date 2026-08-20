import { join } from "node:path"
import type { WindowsChildLifetimeRuntime } from "@repo-edu/host-node/windows-child-lifetime"

const launcherDirectory = "host-child-lifetime"
const launcherFileName = "windows-launcher.cjs"

export function resolveDevelopmentWindowsChildLifetimeRuntime(
  mainOutputDirectory: string,
  executablePath: string,
): WindowsChildLifetimeRuntime {
  return {
    executablePath,
    launcherEntryPath: join(
      mainOutputDirectory,
      launcherDirectory,
      launcherFileName,
    ),
    runAsNode: true,
  }
}

export function resolvePackagedWindowsChildLifetimeRuntime(
  resourcesPath: string,
  executablePath: string,
): WindowsChildLifetimeRuntime {
  return {
    executablePath,
    launcherEntryPath: join(resourcesPath, launcherDirectory, launcherFileName),
    runAsNode: true,
  }
}
