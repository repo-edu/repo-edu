#Requires -Version 5.1
<#
.SYNOPSIS
  Install the redu CLI on Windows.
.DESCRIPTION
  Downloads the latest redu binary from GitHub Releases and installs it
  to a user-local directory. Verifies the SHA-256 checksum before installing.
  Optionally adds the directory to the user PATH.
.PARAMETER Version
  Specific version tag to install (e.g. v0.1.0). Defaults to latest.
.PARAMETER InstallDir
  Installation directory. Defaults to $env:LOCALAPPDATA\redu.
#>
param(
  [string]$Version,
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$Repo = "repo-edu/repo-edu"

if (-not $InstallDir) {
  $InstallDir = Join-Path $env:LOCALAPPDATA "redu"
}

function Resolve-LatestVersion {
  if ($Version) { return $Version }

  $response = Invoke-RestMethod `
    -Uri "https://api.github.com/repos/$Repo/releases/latest" `
    -Headers @{ Accept = "application/vnd.github+json" }

  if (-not $response.tag_name) {
    throw "Failed to resolve latest version."
  }

  return $response.tag_name
}

function Resolve-Arch {
  $arch = $env:PROCESSOR_ARCHITECTURE
  switch ($arch) {
    # Note: only x64 is currently built in CI. ARM64 will fail to find an asset.
    "AMD64"   { return "x64" }
    "ARM64"   { return "arm64" }
    default   { throw "Unsupported architecture: $arch" }
  }
}

function Assert-Checksum {
  param(
    [string]$FilePath,
    [string]$ExpectedHash
  )

  $actualHash = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLower()
  if ($actualHash -ne $ExpectedHash.ToLower()) {
    Remove-Item -Path $FilePath -Force -ErrorAction SilentlyContinue
    throw "Checksum mismatch! Expected $ExpectedHash, got $actualHash."
  }
}

function Install-Redu {
  $tag = Resolve-LatestVersion
  $arch = Resolve-Arch
  $asset = "redu-windows-$arch.exe"
  $checksumAsset = "$asset.sha256"
  $baseUrl = "https://github.com/$Repo/releases/download/$tag"
  $destination = Join-Path $InstallDir "redu.exe"

  Write-Host "Installing redu $tag (windows/$arch)..."

  if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  }

  $tmpBinary = Join-Path $InstallDir "redu.exe.tmp.$PID"
  $tmpChecksum = Join-Path $InstallDir "redu.sha256.tmp.$PID"

  try {
    Invoke-WebRequest -Uri "$baseUrl/$asset" -OutFile $tmpBinary -UseBasicParsing
    Invoke-WebRequest -Uri "$baseUrl/$checksumAsset" -OutFile $tmpChecksum -UseBasicParsing

    # Extract expected hash from checksum file (format: "hash  filename")
    $checksumContent = (Get-Content -Path $tmpChecksum -Raw).Trim()
    $expectedHash = ($checksumContent -split '\s+')[0]

    Assert-Checksum -FilePath $tmpBinary -ExpectedHash $expectedHash

    Move-Item -LiteralPath $tmpBinary -Destination $destination -Force
  } finally {
    Remove-Item -Path $tmpBinary -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tmpChecksum -Force -ErrorAction SilentlyContinue
  }

  # Add to user PATH if not already present
  $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
  if ($currentPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable(
      "PATH",
      "$currentPath;$InstallDir",
      "User"
    )
    Write-Host "Added $InstallDir to user PATH. Restart your terminal for it to take effect."
  }

  Write-Host "Installed redu to $destination"

  & $destination --version
}

Install-Redu
