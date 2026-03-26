import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, rename, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type { Command } from "commander"

const githubRepo = "repo-edu/repo-edu"

type ReleaseAsset = {
  name: string
  browser_download_url: string
}

type ReleaseResponse = {
  tag_name: string
  assets: ReleaseAsset[]
}

function resolveAssetName(): string {
  const platform = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  const ext = process.platform === "win32" ? ".exe" : ""
  return `redu-${platform}-${arch}${ext}`
}

function resolveChecksumAssetName(assetName: string): string {
  return `${assetName}.sha256`
}

async function fetchLatestRelease(): Promise<ReleaseResponse> {
  const response = await fetch(
    `https://api.github.com/repos/${githubRepo}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" } },
  )

  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest release: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as ReleaseResponse
}

async function downloadAssetBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    )
  }

  return Buffer.from(await response.arrayBuffer())
}

function parseExpectedChecksum(
  contents: string,
  expectedFileName: string,
): string {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const [hash, rawFileName] = line.split(/\s+/, 2)
    const fileName = rawFileName?.replace(/^\*/, "")
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      continue
    }

    if (!fileName || fileName === expectedFileName) {
      return hash.toLowerCase()
    }
  }

  throw new Error(`Invalid checksum file for asset ${expectedFileName}.`)
}

function assertChecksumMatches(
  buffer: Buffer,
  expectedChecksum: string,
  assetName: string,
): void {
  const actualChecksum = createHash("sha256").update(buffer).digest("hex")
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Checksum mismatch for ${assetName}. Expected ${expectedChecksum}, got ${actualChecksum}.`,
    )
  }
}

function escapePowerShellLiteral(value: string): string {
  return value.replaceAll("'", "''")
}

async function scheduleWindowsReplace(
  downloadedPath: string,
  targetPath: string,
): Promise<string> {
  const scriptPath = join(tmpdir(), `redu-update-${Date.now()}.ps1`)

  const script = `
$ErrorActionPreference = "Stop"
$source = '${escapePowerShellLiteral(downloadedPath)}'
$target = '${escapePowerShellLiteral(targetPath)}'

for ($i = 0; $i -lt 120; $i++) {
  try {
    Move-Item -LiteralPath $source -Destination $target -Force
    Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
    exit 0
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
exit 1
`.trim()

  await writeFile(scriptPath, script, "utf8")

  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  )
  child.unref()

  return scriptPath
}

export function registerUpdateCommand(
  parent: Command,
  currentVersion: string,
): void {
  parent
    .command("update")
    .description("Update redu to the latest version")
    .option("--check", "Check for updates without installing")
    .action(async (options: { check?: boolean }) => {
      try {
        const release = await fetchLatestRelease()
        const latestVersion = release.tag_name.replace(/^v/, "")

        if (latestVersion === currentVersion) {
          process.stdout.write(`redu is up to date (${currentVersion}).\n`)
          return
        }

        process.stdout.write(
          `Update available: ${currentVersion} -> ${latestVersion}\n`,
        )

        if (options.check) {
          return
        }

        const assetName = resolveAssetName()
        const checksumAssetName = resolveChecksumAssetName(assetName)
        const asset = release.assets.find((a) => a.name === assetName)
        const checksumAsset = release.assets.find(
          (a) => a.name === checksumAssetName,
        )

        if (!asset) {
          process.stderr.write(
            `No binary found for this platform (${assetName}).\n`,
          )
          process.exitCode = 1
          return
        }

        if (!checksumAsset) {
          process.stderr.write(
            `No checksum found for this platform (${checksumAssetName}).\n`,
          )
          process.exitCode = 1
          return
        }

        const binaryPath = process.execPath
        const tempPath = join(
          tmpdir(),
          `${basename(binaryPath)}.update-${Date.now()}`,
        )

        process.stdout.write("Downloading...\n")
        const [binaryBuffer, checksumBuffer] = await Promise.all([
          downloadAssetBuffer(asset.browser_download_url),
          downloadAssetBuffer(checksumAsset.browser_download_url),
        ])

        const expectedChecksum = parseExpectedChecksum(
          checksumBuffer.toString("utf8"),
          assetName,
        )
        assertChecksumMatches(binaryBuffer, expectedChecksum, assetName)

        await writeFile(tempPath, binaryBuffer)

        if (process.platform === "win32") {
          const scriptPath = await scheduleWindowsReplace(tempPath, binaryPath)
          process.stdout.write(
            `Update staged for ${latestVersion}. It will apply after this process exits.\n`,
          )
          // Best-effort cleanup of the temp PowerShell script after a delay
          setTimeout(() => unlink(scriptPath).catch(() => {}), 90_000).unref()
        } else {
          await chmod(tempPath, 0o755)
          const backupPath = `${binaryPath}.old`
          let backedUp = false

          try {
            await rename(binaryPath, backupPath)
            backedUp = true
            await rename(tempPath, binaryPath)
            await unlink(backupPath).catch(() => {})
          } catch {
            if (backedUp) {
              await rename(backupPath, binaryPath).catch(() => {})
            }
            await unlink(tempPath).catch(() => {})
            throw new Error(
              "Failed to replace binary. You may need to run with elevated permissions.",
            )
          }

          process.stdout.write(`Updated to ${latestVersion}.\n`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`Update failed: ${message}\n`)
        process.exitCode = 1
      }
    })
}
