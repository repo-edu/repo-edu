import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { enumeratePackageClosureFromList } from "./closure.js"
import { rootDirectory, runPnpmJson } from "./shared.js"
import type {
  CliReleasePlatform,
  PnpmListNode,
  ProductionDependencyViews,
  ReachedPackage,
  ReleasePlatform,
} from "./types.js"

export const repoRoot = rootDirectory
export const forbidElectronRuntimeInstallEnv =
  "REPO_EDU_RELEASE_FORBID_ELECTRON_RUNTIME_INSTALL"

export function currentReleasePlatform(): ReleasePlatform | null {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-arm64"
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "linux-arm64"
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x64"
  }
  if (process.platform === "win32" && process.arch === "arm64") {
    return "windows-arm64"
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "windows-x64"
  }
  return null
}

export function currentCliReleasePlatform(): CliReleasePlatform | null {
  const platform = currentReleasePlatform()
  if (
    platform === "darwin-arm64" ||
    platform === "linux-arm64" ||
    platform === "linux-x64"
  ) {
    return platform
  }
  return null
}

export function desktopTargetsForPlatform(
  platform: ReleasePlatform,
): readonly string[] {
  if (platform === "darwin-arm64") {
    return ["dmg", "zip"]
  }
  if (platform === "linux-arm64" || platform === "linux-x64") {
    return ["deb"]
  }
  return ["nsis"]
}

export async function writePackage(
  root: string,
  path: string,
  pkg: {
    readonly name: string
    readonly version: string
    readonly license?: string
    readonly private?: boolean
    readonly dependencies?: Record<string, string>
  },
  files?: Record<string, string>,
): Promise<string> {
  const packagePath = join(root, path)
  await mkdir(packagePath, { recursive: true })
  await writeFile(
    join(packagePath, "package.json"),
    JSON.stringify({ license: "MIT", ...pkg }, null, 2),
    "utf8",
  )
  await writeFile(join(packagePath, "index.js"), "export {}\n", "utf8")
  for (const [file, contents] of Object.entries(files ?? {})) {
    const filePath = join(packagePath, file)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, contents, "utf8")
  }
  return packagePath
}

export async function writeDesktopRuntimeFixture(
  root: string,
  options?: {
    readonly electronFiles?: Record<string, string>
  },
): Promise<void> {
  await writePackage(root, "apps/desktop", {
    name: "@repo-edu/desktop",
    version: "1.0.0",
  })
  await writePackage(
    root,
    "apps/desktop/node_modules/electron",
    {
      name: "electron",
      version: "42.4.0",
    },
    options?.electronFiles,
  )
  await writePackage(root, "apps/desktop/node_modules/electron-builder", {
    name: "electron-builder",
    version: "26.8.1",
  })
  for (const packageName of [
    "app-builder-lib",
    "app-builder-bin",
    "builder-util-runtime",
  ]) {
    await writePackage(
      root,
      `apps/desktop/node_modules/electron-builder/node_modules/${packageName}`,
      {
        name: packageName,
        version: "1.0.0",
      },
    )
  }
}

export function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

export async function enumerateRealProductionDependencies(
  packageName: string,
): Promise<ProductionDependencyViews> {
  const [listRoot] = await runPnpmJson<PnpmListNode[]>(
    [
      "--filter",
      packageName,
      "list",
      "--prod",
      "--depth",
      "Infinity",
      "--json",
    ],
    repoRoot,
  )
  assert.ok(listRoot)
  return enumeratePackageClosureFromList(listRoot, { repoRoot })
}

export function reachedPackage(
  reachedName: string,
  options?: Partial<ReachedPackage>,
): ReachedPackage {
  const packageName = options?.packageName ?? reachedName
  const version = options?.version ?? "1.0.0"
  return {
    reachedName,
    packageName,
    version,
    packagePath: options?.packagePath ?? `/repo/node_modules/${packageName}`,
    firstParty: options?.firstParty ?? false,
    packageDirectoryExists: options?.packageDirectoryExists ?? true,
    paths: options?.paths ?? [options?.path ?? [reachedName]],
    path: options?.path ?? [reachedName],
  }
}
