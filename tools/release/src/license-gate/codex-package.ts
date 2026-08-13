import { readFile, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import type { ReleasePlatform } from "./types.js"

export type CodexPackageManifest = {
  readonly layoutVersion: 1
  readonly version: string
  readonly target: string
  readonly variant: "codex"
  readonly entrypoint: string
  readonly resourcesDir: string
  readonly pathDir: string
}

const codexTargetByPlatform = {
  "darwin-arm64": "aarch64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "linux-x64": "x86_64-unknown-linux-musl",
  "windows-arm64": "aarch64-pc-windows-msvc",
  "windows-x64": "x86_64-pc-windows-msvc",
} satisfies Record<ReleasePlatform, string>

export async function resolveCodexPackageRipgrep(options: {
  readonly packagePath: string
  readonly packageVersion: string
  readonly platform: ReleasePlatform
}): Promise<{
  readonly binaryPath: string
  readonly manifestRelativePath: string
}> {
  const expectedTarget = codexTargetByPlatform[options.platform]
  const targetPath = join(options.packagePath, "vendor", expectedTarget)
  const manifestPath = join(targetPath, "codex-package.json")
  const manifest = parseCodexPackageManifest(
    await readFile(manifestPath, "utf8"),
    {
      expectedTarget,
      expectedVersion: options.packageVersion,
    },
  )
  const binaryPath = join(
    targetPath,
    manifest.pathDir,
    options.platform.startsWith("windows") ? "rg.exe" : "rg",
  )
  const binaryStat = await stat(binaryPath)
  if (!binaryStat.isFile()) {
    throw new Error(
      `@openai/codex package path ${formatPackageRelativePath(options.packagePath, binaryPath)} is not a ripgrep file.`,
    )
  }

  return {
    binaryPath,
    manifestRelativePath: formatPackageRelativePath(
      options.packagePath,
      manifestPath,
    ),
  }
}

export function parseCodexPackageManifest(
  contents: string,
  options: {
    readonly expectedTarget: string
    readonly expectedVersion: string
  },
): CodexPackageManifest {
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    throw new Error("@openai/codex codex-package.json is not valid JSON.")
  }

  if (!isRecord(value)) {
    throw new Error("@openai/codex codex-package.json must be an object.")
  }
  assertManifestField(value, "layoutVersion", 1)
  assertManifestField(value, "version", options.expectedVersion)
  assertManifestField(value, "target", options.expectedTarget)
  assertManifestField(value, "variant", "codex")
  assertNonEmptyString(value, "entrypoint")
  assertSinglePathSegment(value, "resourcesDir")
  assertSinglePathSegment(value, "pathDir")

  return value as CodexPackageManifest
}

function assertManifestField(
  manifest: Record<string, unknown>,
  field: string,
  expected: string | number,
): void {
  if (manifest[field] !== expected) {
    throw new Error(
      `@openai/codex codex-package.json ${field} must be ${JSON.stringify(expected)}, received ${JSON.stringify(manifest[field])}.`,
    )
  }
}

function assertNonEmptyString(
  manifest: Record<string, unknown>,
  field: string,
): void {
  if (typeof manifest[field] !== "string" || manifest[field].length === 0) {
    throw new Error(
      `@openai/codex codex-package.json ${field} must be a non-empty string.`,
    )
  }
}

function assertSinglePathSegment(
  manifest: Record<string, unknown>,
  field: string,
): void {
  assertNonEmptyString(manifest, field)
  const value = manifest[field] as string
  if (value === "." || value === ".." || /[\\/]/.test(value)) {
    throw new Error(
      `@openai/codex codex-package.json ${field} must be one safe path segment.`,
    )
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatPackageRelativePath(packagePath: string, path: string): string {
  return relative(packagePath, path).replaceAll("\\", "/")
}
