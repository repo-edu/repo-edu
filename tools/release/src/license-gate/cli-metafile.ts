import { builtinModules } from "node:module"
import { resolve } from "node:path"
import {
  appDirectoryByApp,
  isObjectRecord,
  normalizePath,
  packageKey,
  rootDirectory,
} from "./shared.js"
import type { PackageClosure } from "./types.js"

type BunMetafileImport = {
  readonly path?: string
  readonly external?: boolean
}

type BunMetafileLike = {
  readonly inputs?: Record<string, unknown>
  readonly outputs?: Record<string, unknown>
}

type DesktopBundleInputManifest = {
  readonly version?: number
  readonly targets?: Record<
    string,
    {
      readonly inputs?: readonly unknown[]
    }
  >
}

type BunMetafileNarrowingOptions = {
  readonly repoRoot?: string
  readonly appSourceDirectories?: readonly string[]
}

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
])

export function narrowCliClosureWithBunMetafile(
  closure: PackageClosure,
  metafile: unknown,
  options?: BunMetafileNarrowingOptions,
): PackageClosure {
  const repoRoot = options?.repoRoot ?? rootDirectory
  const appSourceDirectories = (
    options?.appSourceDirectories ?? [resolve(repoRoot, appDirectoryByApp.cli)]
  ).map((directory) => normalizePath(directory))
  const fileInputs = collectMetafileFileInputs(metafile, repoRoot)
  const unresolvedImports = collectExternalMetafileImports(metafile)
  const allPackages = [
    ...closure.firstPartyPackages,
    ...closure.externalPackages,
  ]
  const packageByPath = allPackages
    .map((pkg) => ({
      package: pkg,
      normalizedPath: normalizePath(pkg.packagePath),
    }))
    .sort(
      (left, right) => right.normalizedPath.length - left.normalizedPath.length,
    )

  const usedPackageKeys = new Set<string>()
  for (const input of fileInputs) {
    const normalizedInput = normalizePath(input)
    const owner = packageByPath.find(({ normalizedPath }) =>
      isPathInside(normalizedInput, normalizedPath),
    )
    if (owner) {
      usedPackageKeys.add(
        packageKey(
          owner.package.packageName,
          owner.package.version,
          owner.package.packagePath,
        ),
      )
    }
  }

  const unresolved = [...unresolvedImports].filter(
    (specifier) => !isExplicitlyOwnedMetafileExternal(specifier),
  )
  if (unresolved.length > 0) {
    throw new Error(
      `Bun metafile contains external package imports that are not bundled or explicitly owned by runtime assets: ${unresolved.join(", ")}`,
    )
  }

  if (fileInputs.size === 0) {
    throw new Error("Bun metafile contains no bundled file inputs.")
  }

  const unmappedPackageInputs = [...fileInputs]
    .map(normalizePath)
    .filter((input) => {
      const hasOwner = packageByPath.some(({ normalizedPath }) =>
        isPathInside(input, normalizedPath),
      )
      if (hasOwner) {
        return false
      }
      if (
        appSourceDirectories.some((directory) => isPathInside(input, directory))
      ) {
        return false
      }
      return input.includes("/node_modules/") || input.includes("/packages/")
    })

  if (unmappedPackageInputs.length > 0) {
    throw new Error(
      `Bun metafile contains package inputs outside the release closure: ${unmappedPackageInputs.join(", ")}`,
    )
  }

  return {
    firstPartyPackages: closure.firstPartyPackages.filter((pkg) =>
      usedPackageKeys.has(
        packageKey(pkg.packageName, pkg.version, pkg.packagePath),
      ),
    ),
    externalPackages: closure.externalPackages.filter((pkg) =>
      usedPackageKeys.has(
        packageKey(pkg.packageName, pkg.version, pkg.packagePath),
      ),
    ),
  }
}

export function assertDesktopBundleInputsCovered(
  closure: PackageClosure,
  manifest: unknown,
  options?: BunMetafileNarrowingOptions,
): void {
  const repoRoot = options?.repoRoot ?? rootDirectory
  const appSourceDirectories = (
    options?.appSourceDirectories ?? [
      resolve(repoRoot, appDirectoryByApp.desktop),
    ]
  ).map((directory) => normalizePath(directory))
  const fileInputs = collectDesktopBundleManifestFileInputs(manifest, repoRoot)

  if (fileInputs.size === 0) {
    throw new Error("Desktop bundle manifest contains no file inputs.")
  }

  const allPackages = [
    ...closure.firstPartyPackages,
    ...closure.externalPackages,
  ]
  const packageByPath = allPackages
    .map((pkg) => ({
      package: pkg,
      normalizedPath: normalizePath(pkg.packagePath),
    }))
    .sort(
      (left, right) => right.normalizedPath.length - left.normalizedPath.length,
    )

  const uncoveredInputs = [...fileInputs].map(normalizePath).filter((input) => {
    if (
      appSourceDirectories.some((directory) => isPathInside(input, directory))
    ) {
      return false
    }

    const hasOwner = packageByPath.some(({ normalizedPath }) =>
      isPathInside(input, normalizedPath),
    )
    if (hasOwner) {
      return false
    }

    return input.includes("/node_modules/") || input.includes("/packages/")
  })

  if (uncoveredInputs.length > 0) {
    throw new Error(
      `Desktop bundle manifest contains package inputs outside the release closure: ${uncoveredInputs.join(", ")}`,
    )
  }
}

function collectMetafileFileInputs(
  metafile: unknown,
  repoRoot: string,
): Set<string> {
  const inputs = new Set<string>()
  const typedMetafile = metafile as BunMetafileLike

  for (const key of Object.keys(typedMetafile.inputs ?? {})) {
    if (looksLikeFilePath(key)) {
      inputs.add(resolve(repoRoot, key))
    }
  }

  walkJson(metafile, (value, key) => {
    if (
      typeof value === "string" &&
      (key === "path" || key === "input" || key === "file") &&
      looksLikeFilePath(value)
    ) {
      inputs.add(resolve(repoRoot, value))
    }
  })

  return inputs
}

function collectExternalMetafileImports(metafile: unknown): Set<string> {
  const imports = new Set<string>()
  walkJson(metafile, (value) => {
    if (!isObjectRecord(value)) {
      return
    }
    const importRecord = value as BunMetafileImport
    if (
      importRecord.external &&
      typeof importRecord.path === "string" &&
      looksLikePackageSpecifier(importRecord.path)
    ) {
      imports.add(importRecord.path)
    }
  })
  return imports
}

function collectDesktopBundleManifestFileInputs(
  manifest: unknown,
  repoRoot: string,
): Set<string> {
  const inputs = new Set<string>()
  const typedManifest = manifest as DesktopBundleInputManifest

  for (const target of Object.values(typedManifest.targets ?? {})) {
    for (const input of target.inputs ?? []) {
      if (typeof input === "string" && looksLikeFilePath(input)) {
        inputs.add(resolve(repoRoot, stripViteQuery(input)))
      }
    }
  }

  return inputs
}

function stripViteQuery(path: string): string {
  const queryStart = path.search(/[?#]/)
  return queryStart === -1 ? path : path.slice(0, queryStart)
}

function walkJson(
  value: unknown,
  visitor: (value: unknown, key: string | null) => void,
  key: string | null = null,
): void {
  visitor(value, key)
  if (Array.isArray(value)) {
    for (const item of value) {
      walkJson(item, visitor)
    }
  } else if (isObjectRecord(value)) {
    for (const [childKey, childValue] of Object.entries(value)) {
      walkJson(childValue, visitor, childKey)
    }
  }
}

function looksLikeFilePath(value: string): boolean {
  return (
    value.startsWith(".") ||
    value.startsWith("/") ||
    value.includes("/") ||
    /^[A-Za-z]:[\\/]/.test(value)
  )
}

function looksLikePackageSpecifier(value: string): boolean {
  return (
    !value.startsWith(".") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/.test(value) &&
    !nodeBuiltins.has(value)
  )
}

function isExplicitlyOwnedMetafileExternal(specifier: string): boolean {
  return (
    nodeBuiltins.has(specifier) ||
    specifier === "bun" ||
    specifier.startsWith("bun:")
  )
}

function isPathInside(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}/`)
}
