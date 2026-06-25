import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { noticeEntryId } from "./notices.js"
import {
  canonicalPackagePath,
  packageMetadataEvidence,
  readPackageJson,
  readRequiredTextFile,
} from "./shared.js"
import type { NoticeEntry, PackageJson, ReachedPackage } from "./types.js"

export type AdditionalNoticeFile = string | readonly string[]

export async function runtimePackageRecord(
  packageName: string,
  options: {
    readonly root: string
    readonly source: string
    readonly reachedPackage?: ReachedPackage
    readonly additionalNoticeFiles?: readonly AdditionalNoticeFile[]
    readonly preparePackage?: (packagePath: string) => Promise<void>
    readonly displayName?: string
  },
): Promise<NoticeEntry> {
  const packageJsonPath = options.reachedPackage
    ? join(options.reachedPackage.packagePath, "package.json")
    : resolvePackageJsonPath(packageName, options.root)
  const packagePath = canonicalPackagePath(dirname(packageJsonPath))
  const packageJson = readPackageJson(packagePath)
  if (options.preparePackage) {
    await options.preparePackage(packagePath)
  }
  // `displayName` lets an aliased package carry its dependency-key identity
  // instead of the published `package.json` name, which for the platform-
  // specific `@openai/codex` optional collides with the launcher entry.
  const name = options.displayName ?? packageJson.name ?? packageName
  const version = packageJson.version ?? "0.0.0"
  const licenseExpression = readPackageLicense(packageJson, name)
  const licenseFile = findPackageLicenseFile(packagePath)
  const licenseText = licenseFile
    ? await readRequiredTextFile(licenseFile)
    : undefined
  const licenseEvidence = licenseFile
    ? undefined
    : packageMetadataEvidence({
        name,
        version,
        licenseExpression,
        packageJson,
        context: `${options.source} found no dedicated package license file in the installed runtime package.`,
      })
  const additionalText =
    options.additionalNoticeFiles && options.additionalNoticeFiles.length > 0
      ? (
          await readAdditionalNoticeFiles(
            packagePath,
            options.additionalNoticeFiles,
          )
        ).join("\n\n")
      : undefined

  return {
    id: noticeEntryId({ name, version, packagePath }),
    kind: "runtime-asset",
    name,
    version,
    licenseExpression,
    source: options.source,
    licenseText,
    licenseEvidence,
    additionalText,
  }
}

async function readAdditionalNoticeFiles(
  packagePath: string,
  files: readonly AdditionalNoticeFile[],
): Promise<string[]> {
  const texts: string[] = []
  for (const file of files) {
    const candidates = resolveAdditionalNoticeCandidates(packagePath, file)
    const path = candidates.find((candidate) => existsSync(candidate))
    if (!path) {
      throw new Error(
        `Required notice file is missing. Checked: ${candidates.join(", ")}`,
      )
    }

    const text = await readFile(path, "utf8")
    if (text.trim().length === 0) {
      throw new Error(`Required notice file is empty: ${path}`)
    }
    texts.push(text)
  }
  return texts
}

export function resolveAdditionalNoticeCandidates(
  packagePath: string,
  file: AdditionalNoticeFile,
): string[] {
  return (Array.isArray(file) ? file : [file]).map((candidate) =>
    resolve(packagePath, candidate),
  )
}

function readPackageLicense(packageJson: PackageJson, name: string): string {
  if (typeof packageJson.license === "string" && packageJson.license.trim()) {
    return packageJson.license.trim()
  }
  throw new Error(`Runtime package ${name} has no package license field.`)
}

function findPackageLicenseFile(packagePath: string): string | undefined {
  for (const fileName of [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "LICENCE",
    "COPYING",
  ]) {
    const path = join(packagePath, fileName)
    if (existsSync(path)) {
      return path
    }
  }
  return undefined
}

export async function fileSha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
}

export function resolvePackageJsonPath(
  packageName: string,
  fromRoot: string,
): string {
  try {
    return createRequire(join(fromRoot, "package.json")).resolve(
      `${packageName}/package.json`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not resolve release runtime package ${packageName} from ${fromRoot}: ${message}`,
    )
  }
}
