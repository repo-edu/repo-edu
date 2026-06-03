import { existsSync } from "node:fs"
import { relative } from "node:path"
import {
  normalizePath,
  packageKey,
  readPackageJson,
  rootDirectory,
} from "./shared.js"
import type {
  PackageClosure,
  PackageJson,
  PnpmListNode,
  ReachedPackage,
} from "./types.js"

const firstPartyScope = "@repo-edu/"

const forbiddenReleasePackages = new Set([
  "@repo-edu/claude-coder",
  "@repo-edu/fixture-engine",
  "@anthropic-ai/claude-agent-sdk",
])

export function enumeratePackageClosureFromList(
  listRoot: PnpmListNode,
  options?: { readonly repoRoot?: string },
): PackageClosure {
  const repoRoot = options?.repoRoot ?? rootDirectory
  const equivalents = collectEquivalentDependencyNodes(listRoot)
  const reached = new Map<string, ReachedPackage>()

  function visit(
    reachedName: string,
    node: PnpmListNode,
    path: readonly string[],
  ): void {
    const packagePath = node.path
    const hasPackageDirectory =
      typeof packagePath === "string" && existsSync(packagePath)

    if (!hasPackageDirectory) {
      if (isFirstPartyPackageName(reachedName)) {
        throw new Error(
          `Reached first-party package ${reachedName} has no package directory.`,
        )
      }
      return
    }

    const packageJson = readPackageJson(packagePath)
    const packageName = packageJson.name ?? reachedName
    const version = normalizePackageVersion(node.version, packageJson)
    const firstParty = isFirstPartyPackageName(packageName)
    const key = packageKey(packageName, version, packagePath)

    if (!reached.has(key)) {
      reached.set(key, {
        reachedName,
        packageName,
        version,
        packagePath,
        firstParty,
        path,
      })
    }

    const dependencySource = dependenciesSourceForNode(
      reachedName,
      node,
      equivalents,
    )
    for (const [childName, child] of Object.entries(
      dependencySource.dependencies ?? {},
    )) {
      visit(childName, child, [...path, childName])
    }
  }

  for (const [name, node] of Object.entries(listRoot.dependencies ?? {})) {
    visit(name, node, [name])
  }

  const packages = [...reached.values()].sort(compareReachedPackage)
  const firstPartyPackages = packages.filter((pkg) => pkg.firstParty)
  const externalPackages = packages.filter((pkg) => !pkg.firstParty)

  for (const pkg of packages) {
    if (
      forbiddenReleasePackages.has(pkg.packageName) ||
      forbiddenReleasePackages.has(pkg.reachedName) ||
      packagePathBelongsToTools(repoRoot, pkg.packagePath)
    ) {
      throw new Error(
        `Forbidden dev-only package reached release closure: ${pkg.reachedName}`,
      )
    }
  }

  return { firstPartyPackages, externalPackages }
}

function collectEquivalentDependencyNodes(
  root: PnpmListNode,
): Map<string, PnpmListNode> {
  const equivalents = new Map<string, PnpmListNode>()

  function walk(name: string, node: PnpmListNode): void {
    if (!node.deduped && node.dependencies) {
      equivalents.set(dedupeKey(name, node), node)
    }
    for (const [childName, child] of Object.entries(node.dependencies ?? {})) {
      walk(childName, child)
    }
  }

  for (const [name, node] of Object.entries(root.dependencies ?? {})) {
    walk(name, node)
  }

  return equivalents
}

function dependenciesSourceForNode(
  reachedName: string,
  node: PnpmListNode,
  equivalents: ReadonlyMap<string, PnpmListNode>,
): PnpmListNode {
  if (node.dependencies || !node.deduped || !node.dedupedDependenciesCount) {
    return node
  }

  const equivalent = equivalents.get(dedupeKey(reachedName, node))
  if (!equivalent) {
    throw new Error(
      `pnpm list marked ${reachedName}@${node.version ?? "unknown"} as deduped but no dependency source was found.`,
    )
  }

  return equivalent
}

function dedupeKey(name: string, node: PnpmListNode): string {
  return `${name}\0${node.version ?? ""}\0${node.path ?? ""}`
}

function normalizePackageVersion(
  version: string | undefined,
  packageJson: PackageJson,
): string {
  if (version?.startsWith("link:") || !version) {
    return packageJson.version ?? "0.0.0"
  }
  return version
}

function isFirstPartyPackageName(packageName: string): boolean {
  return packageName.startsWith(firstPartyScope)
}

function packagePathBelongsToTools(
  repoRoot: string,
  packagePath: string,
): boolean {
  const repoRelativePath = normalizePath(relative(repoRoot, packagePath))
  return repoRelativePath.startsWith("tools/")
}

export function compareReachedPackage(
  left: Pick<ReachedPackage, "packageName" | "version" | "packagePath">,
  right: Pick<ReachedPackage, "packageName" | "version" | "packagePath">,
): number {
  return `${left.packageName}@${left.version}\0${left.packagePath}`.localeCompare(
    `${right.packageName}@${right.version}\0${right.packagePath}`,
  )
}

export function closureContainsPackage(
  closure: PackageClosure,
  packageName: string,
): boolean {
  return [...closure.firstPartyPackages, ...closure.externalPackages].some(
    (pkg) => pkg.packageName === packageName || pkg.reachedName === packageName,
  )
}
