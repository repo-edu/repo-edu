import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
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
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 128,
  })
  return JSON.parse(stdout) as TValue
}

export async function readGlobbedTextFiles(
  directory: string,
  fileName: string,
): Promise<string[]> {
  if (!existsSync(directory)) {
    return []
  }
  const texts: string[] = []

  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile() && entry.name === fileName) {
        texts.push(await readFile(path, "utf8"))
      }
    }
  }

  await walk(directory)
  return texts
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
