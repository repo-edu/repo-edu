import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { findReachedPackage } from "./closure.js"
import {
  type AdditionalNoticeFile,
  resolveAdditionalNoticeCandidates,
  resolvePackageJsonPath,
  runtimePackageRecord,
} from "./runtime-package-record.js"
import { appDirectoryByApp } from "./shared.js"
import type { NoticeEntry, ReachedPackage, ReleasePlatform } from "./types.js"

const execFileAsync = promisify(execFile)
const forbidElectronRuntimeInstallEnv =
  "REPO_EDU_RELEASE_FORBID_ELECTRON_RUNTIME_INSTALL"

export async function resolveDesktopRuntimePackageEntries(options: {
  readonly root: string
  readonly platform: ReleasePlatform
  readonly artifactTargets: readonly string[]
  readonly productionReached?: readonly ReachedPackage[]
}): Promise<NoticeEntry[]> {
  const desktopRoot = resolve(options.root, appDirectoryByApp.desktop)
  const electronBuilderRoot = dirname(
    resolvePackageJsonPath("electron-builder", desktopRoot),
  )
  const electronReached = options.productionReached
    ? findReachedPackage(options.productionReached, "electron")
    : undefined
  const subjects = [
    runtimePackageRecord("electron", {
      reachedPackage: electronReached,
      root: desktopRoot,
      source: "Desktop Electron runtime",
      preparePackage: (packagePath) =>
        ensureElectronRuntimePayload(
          packagePath,
          options.platform,
          electronChromiumNoticeCandidates(options.root, options.platform),
        ),
      additionalNoticeFiles: [
        electronChromiumNoticeCandidates(options.root, options.platform),
      ],
    }),
    runtimePackageRecord("electron-builder", {
      root: desktopRoot,
      source: "Desktop Electron Builder packaging runtime",
    }),
    ...["app-builder-lib", "app-builder-bin", "builder-util-runtime"].map(
      (packageName) =>
        runtimePackageRecord(packageName, {
          root: electronBuilderRoot,
          source: "Desktop Electron Builder transitive packaging runtime",
        }),
    ),
  ]

  if (options.artifactTargets.includes("dmg")) {
    subjects.push(
      runtimePackageRecord("dmg-builder", {
        root: electronBuilderRoot,
        source: "Desktop Electron Builder macOS DMG packaging runtime",
      }),
    )
  }
  if (options.artifactTargets.includes("nsis")) {
    subjects.push(
      runtimePackageRecord("electron-builder-squirrel-windows", {
        root: electronBuilderRoot,
        source: "Desktop Electron Builder Windows installer runtime",
      }),
    )
  }

  return Promise.all(subjects)
}

function electronChromiumNoticeCandidates(
  root: string,
  platform: ReleasePlatform,
): readonly string[] {
  const releaseDirectory = resolve(root, appDirectoryByApp.desktop, "release")
  const packagedNoticeByPlatform = {
    "darwin-arm64": [
      join(
        releaseDirectory,
        "mac-arm64",
        "RepoEdu.app",
        "Contents",
        "Resources",
        "LICENSES.chromium.html",
      ),
      join(releaseDirectory, "mac-arm64", "LICENSES.chromium.html"),
    ],
    "linux-arm64": [
      join(releaseDirectory, "linux-arm64-unpacked", "LICENSES.chromium.html"),
    ],
    "linux-x64": [
      join(releaseDirectory, "linux-unpacked", "LICENSES.chromium.html"),
    ],
    "windows-arm64": [
      join(releaseDirectory, "win-arm64-unpacked", "LICENSES.chromium.html"),
    ],
    "windows-x64": [
      join(releaseDirectory, "win-unpacked", "LICENSES.chromium.html"),
    ],
  } satisfies Record<ReleasePlatform, readonly string[]>

  return ["dist/LICENSES.chromium.html", ...packagedNoticeByPlatform[platform]]
}

async function ensureElectronRuntimePayload(
  packagePath: string,
  platform: ReleasePlatform,
  noticeCandidates: AdditionalNoticeFile,
): Promise<void> {
  if (
    resolveAdditionalNoticeCandidates(packagePath, noticeCandidates).some(
      (candidate) => existsSync(candidate),
    )
  ) {
    return
  }

  if (process.env[forbidElectronRuntimeInstallEnv] === "1") {
    throw new Error(
      `Electron runtime install is disabled by ${forbidElectronRuntimeInstallEnv}, but ${packagePath} has no materialized dist/LICENSES.chromium.html.`,
    )
  }

  const installScript = join(packagePath, "install.js")
  if (!existsSync(installScript)) {
    throw new Error(
      `Electron runtime package at ${packagePath} has no install.js to materialize Chromium notices.`,
    )
  }

  const target = electronInstallTarget(platform)
  try {
    await execFileAsync(process.execPath, [installScript], {
      cwd: packagePath,
      env: electronInstallEnvironment(target),
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch (error) {
    throw new Error(
      `Electron runtime install failed for ${platform}: ${formatExecError(error)}`,
    )
  }
}

function electronInstallTarget(platform: ReleasePlatform): {
  readonly platform: string
  readonly arch: string
} {
  switch (platform) {
    case "darwin-arm64":
      return { platform: "darwin", arch: "arm64" }
    case "linux-arm64":
      return { platform: "linux", arch: "arm64" }
    case "linux-x64":
      return { platform: "linux", arch: "x64" }
    case "windows-arm64":
      return { platform: "win32", arch: "arm64" }
    case "windows-x64":
      return { platform: "win32", arch: "x64" }
  }
}

function electronInstallEnvironment(target: {
  readonly platform: string
  readonly arch: string
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_INSTALL_PLATFORM: target.platform,
    ELECTRON_INSTALL_ARCH: target.arch,
    npm_config_platform: target.platform,
    npm_config_arch: target.arch,
  }
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD
  return env
}

function formatExecError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error)
  }

  const details: string[] = []
  if (error instanceof Error) {
    details.push(error.message)
  }

  const record = error as Record<string, unknown>
  for (const key of ["stdout", "stderr"] as const) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) {
      details.push(`${key}: ${value.trim()}`)
    }
  }

  return details.join("\n") || String(error)
}
