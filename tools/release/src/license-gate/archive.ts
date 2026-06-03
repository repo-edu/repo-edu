import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js"
import { extract as extractTar } from "tar"
import { normalizePath } from "./shared.js"
import type { ReleasePlatform } from "./types.js"

export type DotSlashManifest = {
  readonly name: string
  readonly platforms: Record<
    string,
    {
      readonly size: number
      readonly hash: string
      readonly digest: string
      readonly format: "tar.gz" | "zip"
      readonly path: string
      readonly providers: readonly { readonly url: string }[]
    }
  >
}

export function resolveOpenAiCodexDotslashManifest(
  packagePath: string,
  packageVersion: string,
): string {
  const baseVersion = packageVersion.replace(
    /-(darwin|linux|win32)-(arm64|x64)$/,
    "",
  )
  const candidates = [
    join(packagePath, "bin/rg"),
    resolve(packagePath, "../../@openai/codex/bin/rg"),
    resolve(packagePath, "../codex/bin/rg"),
    join(
      nearestPnpmStore(packagePath),
      `@openai+codex@${baseVersion}`,
      "node_modules/@openai/codex/bin/rg",
    ),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `Could not locate @openai/codex bin/rg DotSlash manifest from ${packagePath}.`,
  )
}

function nearestPnpmStore(packagePath: string): string {
  const normalized = normalizePath(packagePath)
  const marker = "/node_modules/.pnpm/"
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex === -1) {
    return resolve(packagePath, "../../..")
  }

  return normalized.slice(0, markerIndex + marker.length - 1)
}

export function parseDotslashManifest(contents: string): DotSlashManifest {
  const jsonStart = contents.indexOf("{")
  if (jsonStart === -1) {
    throw new Error("DotSlash manifest does not contain JSON.")
  }
  return JSON.parse(contents.slice(jsonStart)) as DotSlashManifest
}

export function extractRipgrepVersion(
  record: DotSlashManifest["platforms"][string],
  providerUrl: string,
): string {
  const pathVersion = /(?:^|\/)ripgrep-([0-9]+\.[0-9]+\.[0-9]+)(?:[-/]|$)/.exec(
    record.path,
  )?.[1]
  const urlVersion = /\/download\/([^/]+)\//.exec(providerUrl)?.[1]
  const versions = [pathVersion, urlVersion].filter(
    (version): version is string => typeof version === "string",
  )
  const uniqueVersions = new Set(versions)

  if (uniqueVersions.size !== 1) {
    throw new Error(
      `Could not derive a single ripgrep version from DotSlash path ${record.path} and provider ${providerUrl}.`,
    )
  }

  const version = versions[0]
  if (!version) {
    throw new Error(
      `Could not derive ripgrep version from DotSlash path ${record.path} and provider ${providerUrl}.`,
    )
  }
  return version
}

export async function fetchVerifiedArchive(
  url: string,
  record: DotSlashManifest["platforms"][string],
): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    )
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length !== record.size) {
    throw new Error(
      `Archive size mismatch for ${url}: expected ${record.size}, got ${bytes.length}.`,
    )
  }
  if (record.hash !== "sha256") {
    throw new Error(`Unsupported DotSlash hash ${record.hash} for ${url}.`)
  }
  const digest = createHash("sha256").update(bytes).digest("hex")
  if (digest !== record.digest) {
    throw new Error(
      `Archive digest mismatch for ${url}: expected ${record.digest}, got ${digest}.`,
    )
  }

  return bytes
}

export async function readArchiveTextFiles(
  archiveBytes: Buffer,
  format: "tar.gz" | "zip",
  paths: readonly string[],
): Promise<string[]> {
  if (format === "zip") {
    return readZipTextFiles(archiveBytes, paths)
  }
  return readTarGzTextFiles(archiveBytes, paths)
}

async function readZipTextFiles(
  archiveBytes: Buffer,
  paths: readonly string[],
): Promise<string[]> {
  const archiveBuffer = new ArrayBuffer(archiveBytes.byteLength)
  new Uint8Array(archiveBuffer).set(archiveBytes)
  const zipReader = new ZipReader(new BlobReader(new Blob([archiveBuffer])))
  try {
    const entries = await zipReader.getEntries()
    const textByPath = new Map<string, string>()
    for (const entry of entries) {
      if (!entry.filename || !paths.includes(entry.filename)) {
        continue
      }
      if (!("getData" in entry)) {
        continue
      }
      const text = await entry.getData(new TextWriter())
      if (typeof text === "string") {
        textByPath.set(entry.filename, text)
      }
    }
    return paths.map((path) => {
      const text = textByPath.get(path)
      if (!text) {
        throw new Error(`Archive is missing ${path}.`)
      }
      return text
    })
  } finally {
    await zipReader.close()
  }
}

async function readTarGzTextFiles(
  archiveBytes: Buffer,
  paths: readonly string[],
): Promise<string[]> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "repo-edu-license-"))
  const archivePath = join(tempDirectory, "archive.tar.gz")
  try {
    await writeFile(archivePath, archiveBytes)
    await extractTar({
      file: archivePath,
      cwd: tempDirectory,
      gzip: true,
      strict: true,
      preservePaths: false,
    })
    return Promise.all(
      paths.map((path) => readFile(join(tempDirectory, path), "utf8")),
    )
  } finally {
    await rm(tempDirectory, { force: true, recursive: true })
  }
}

export function dotslashPlatformKey(platform: ReleasePlatform): string {
  switch (platform) {
    case "darwin-arm64":
      return "macos-aarch64"
    case "linux-arm64":
      return "linux-aarch64"
    case "linux-x64":
      return "linux-x86_64"
    case "windows-arm64":
      return "windows-aarch64"
    case "windows-x64":
      return "windows-x86_64"
  }
}
