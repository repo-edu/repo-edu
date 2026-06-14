import { execFile } from "node:child_process"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import type { LicenseGateApp, PackageJson } from "./types.js"

export const rootDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
)

const execFileAsync = promisify(execFile)

export const appDirectoryByApp = {
  desktop: "apps/desktop",
  cli: "apps/cli",
} satisfies Record<LicenseGateApp, string>

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/")
}

export function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function packageKey(
  name: string,
  version: string,
  packagePath: string,
): string {
  return `${name}@${version}\0${packagePath}`
}

export function canonicalPackagePath(packagePath: string): string {
  return existsSync(packagePath) ? realpathSync(packagePath) : packagePath
}

export function formatEvidencePath(path: string, root: string): string {
  const absolutePath = resolve(path)
  const relativePath = relative(resolve(root), absolutePath)
  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return normalizePath(relativePath)
  }
  return normalizePath(path)
}

export function packageMetadataEvidence(options: {
  readonly name: string
  readonly version: string
  readonly licenseExpression: string
  readonly packageJson?: PackageJson
  readonly context: string
}): string {
  const context = options.context.trim().replace(/\.$/, "")
  const lines = [
    `${context}.`,
    `Metadata-only license evidence for ${options.name}@${options.version}.`,
    `Package metadata declares SPDX license: ${options.licenseExpression}.`,
  ]
  const author = formatPackageAuthor(options.packageJson?.author)
  if (author) {
    lines.push(`Package author: ${author}.`)
  }
  if (options.packageJson?.homepage) {
    lines.push(`Package homepage: ${options.packageJson.homepage}.`)
  }
  if (options.packageJson?.description) {
    lines.push(`Package description: ${options.packageJson.description}.`)
  }
  return lines.join("\n")
}

export function resolveRepoRelativePath(root: string, path: string): string {
  return resolve(root, path)
}

export function readPackageJson(packagePath: string): PackageJson {
  return JSON.parse(readFileSync(join(packagePath, "package.json"), "utf8"))
}

export async function runPnpmJson<TValue>(
  args: readonly string[],
  cwd: string,
): Promise<TValue> {
  const { stdout } = await execFileAsync("pnpm", args, {
    cwd,
    maxBuffer: 1024 * 1024 * 128,
    shell: process.platform === "win32",
  })
  return JSON.parse(stdout) as TValue
}

export async function readRequiredTextFiles(
  paths: readonly string[],
): Promise<string[]> {
  const texts: string[] = []
  for (const path of paths) {
    if (!existsSync(path)) {
      throw new Error(`Required notice file is missing: ${path}`)
    }

    const text = await readFile(path, "utf8")
    if (text.trim().length === 0) {
      throw new Error(`Required notice file is empty: ${path}`)
    }
    texts.push(text)
  }
  return texts
}

export async function readRequiredTextFile(path: string): Promise<string> {
  const [text] = await readRequiredTextFiles([path])
  if (text === undefined) {
    throw new Error(`Required notice file is missing: ${path}`)
  }
  return text
}

function formatPackageAuthor(
  author: string | { readonly name?: string } | undefined,
): string | undefined {
  if (typeof author === "string" && author.trim().length > 0) {
    return author.trim()
  }
  if (
    typeof author === "object" &&
    typeof author.name === "string" &&
    author.name.trim().length > 0
  ) {
    return author.name.trim()
  }
  return undefined
}
