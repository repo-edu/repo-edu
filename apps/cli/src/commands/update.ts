import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, rename, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
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

type FileReplacement = {
  readonly sourcePath: string
  readonly targetPath: string
  readonly backupPath: string
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

function resolveNoticeAssetName(assetName: string): string {
  return `${assetName}.third-party-notices.txt`
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

function powerShellReplacementRecord(replacement: FileReplacement): string {
  return `@{ Source = '${escapePowerShellLiteral(replacement.sourcePath)}'; Target = '${escapePowerShellLiteral(replacement.targetPath)}'; Backup = '${escapePowerShellLiteral(replacement.backupPath)}' }`
}

async function scheduleWindowsReplace(
  replacements: readonly FileReplacement[],
): Promise<string> {
  const scriptPath = join(tmpdir(), `redu-update-${Date.now()}.ps1`)

  const script = `
$ErrorActionPreference = "Stop"
$replacements = @(
${replacements.map((replacement) => `  ${powerShellReplacementRecord(replacement)}`).join(",\n")}
)

function Restore-Replacements {
  param($Items)

  foreach ($item in $Items) {
    if (Test-Path -LiteralPath $item.Backup) {
      Remove-Item -LiteralPath $item.Target -Force -ErrorAction SilentlyContinue
      Move-Item -LiteralPath $item.Backup -Destination $item.Target -Force
    }
  }
}

$backupsReady = $false
for ($i = 0; $i -lt 120; $i++) {
  try {
    foreach ($item in $replacements) {
      Remove-Item -LiteralPath $item.Backup -Force -ErrorAction SilentlyContinue
      if (Test-Path -LiteralPath $item.Target) {
        Move-Item -LiteralPath $item.Target -Destination $item.Backup -Force
      }
    }
    $backupsReady = $true
    break
  } catch {
    Restore-Replacements $replacements
    Start-Sleep -Milliseconds 500
  }
}

if (-not $backupsReady) {
  Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
  exit 1
}

try {
  foreach ($item in $replacements) {
    Move-Item -LiteralPath $item.Source -Destination $item.Target -Force
  }
  foreach ($item in $replacements) {
    Remove-Item -LiteralPath $item.Backup -Force -ErrorAction SilentlyContinue
  }
} catch {
  foreach ($item in $replacements) {
    Remove-Item -LiteralPath $item.Target -Force -ErrorAction SilentlyContinue
  }
  Restore-Replacements $replacements
  Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
  exit 1
}

Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
exit 0
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

async function replaceFilesWithBackups(
  replacements: readonly FileReplacement[],
): Promise<void> {
  const backedUp: FileReplacement[] = []
  const installed: FileReplacement[] = []

  try {
    for (const replacement of replacements) {
      await unlink(replacement.backupPath).catch(() => {})
      try {
        await rename(replacement.targetPath, replacement.backupPath)
        backedUp.push(replacement)
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error
        }
      }
    }

    for (const replacement of replacements) {
      await rename(replacement.sourcePath, replacement.targetPath)
      installed.push(replacement)
    }

    await Promise.all(
      backedUp.map((replacement) =>
        unlink(replacement.backupPath).catch(() => {}),
      ),
    )
  } catch (error) {
    await Promise.all(
      installed.map((replacement) =>
        unlink(replacement.targetPath).catch(() => {}),
      ),
    )
    for (const replacement of [...backedUp].reverse()) {
      await rename(replacement.backupPath, replacement.targetPath).catch(
        () => {},
      )
    }
    await Promise.all(
      replacements.map((replacement) =>
        unlink(replacement.sourcePath).catch(() => {}),
      ),
    )
    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  )
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
        const noticeAssetName = resolveNoticeAssetName(assetName)
        const asset = release.assets.find((a) => a.name === assetName)
        const checksumAsset = release.assets.find(
          (a) => a.name === checksumAssetName,
        )
        const noticeAsset = release.assets.find(
          (a) => a.name === noticeAssetName,
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

        if (!noticeAsset) {
          process.stderr.write(
            `No third-party notice file found for this platform (${noticeAssetName}).\n`,
          )
          process.exitCode = 1
          return
        }

        const binaryPath = process.execPath
        const targetDirectory = dirname(binaryPath)
        const noticePath = join(targetDirectory, "redu.third-party-notices.txt")
        const updateId = Date.now()
        const tempPath = join(
          targetDirectory,
          `${basename(binaryPath)}.update-${updateId}`,
        )
        const tempNoticePath = join(
          targetDirectory,
          `redu.third-party-notices.update-${updateId}.txt`,
        )
        const replacements = [
          {
            sourcePath: tempPath,
            targetPath: binaryPath,
            backupPath: `${binaryPath}.old-${updateId}`,
          },
          {
            sourcePath: tempNoticePath,
            targetPath: noticePath,
            backupPath: `${noticePath}.old-${updateId}`,
          },
        ]

        process.stdout.write("Downloading...\n")
        const [binaryBuffer, checksumBuffer, noticeBuffer] = await Promise.all([
          downloadAssetBuffer(asset.browser_download_url),
          downloadAssetBuffer(checksumAsset.browser_download_url),
          downloadAssetBuffer(noticeAsset.browser_download_url),
        ])

        const checksumText = checksumBuffer.toString("utf8")
        const expectedBinaryChecksum = parseExpectedChecksum(
          checksumText,
          assetName,
        )
        const expectedNoticeChecksum = parseExpectedChecksum(
          checksumText,
          noticeAssetName,
        )
        assertChecksumMatches(binaryBuffer, expectedBinaryChecksum, assetName)
        assertChecksumMatches(
          noticeBuffer,
          expectedNoticeChecksum,
          noticeAssetName,
        )

        await Promise.all([
          writeFile(tempPath, binaryBuffer),
          writeFile(tempNoticePath, noticeBuffer),
        ])

        if (process.platform === "win32") {
          const scriptPath = await scheduleWindowsReplace(replacements)
          process.stdout.write(
            `Update staged for ${latestVersion}. It will apply after this process exits.\n`,
          )
          // Best-effort cleanup of the temp PowerShell script after a delay
          setTimeout(() => unlink(scriptPath).catch(() => {}), 90_000).unref()
        } else {
          await chmod(tempPath, 0o755)

          try {
            await replaceFilesWithBackups(replacements)
          } catch {
            throw new Error(
              "Failed to replace binary and notice file. You may need to run with elevated permissions.",
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
