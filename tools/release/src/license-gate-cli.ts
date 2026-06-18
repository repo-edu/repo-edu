#!/usr/bin/env tsx

import {
  type CliReleasePlatform,
  type DesktopReleasePlatform,
  type LicenseGateApp,
  type LicenseGateOptions,
  runLicenseGate,
} from "./license-gate.js"

const apps = new Set<LicenseGateApp>(["desktop", "cli"])
const desktopPlatforms = new Set<DesktopReleasePlatform>([
  "darwin-arm64",
  "linux-arm64",
  "linux-x64",
  "windows-arm64",
  "windows-x64",
])
const cliPlatforms = new Set<CliReleasePlatform>([
  "darwin-arm64",
  "linux-arm64",
  "linux-x64",
])
const allowedOptions = new Set([
  "app",
  "platform",
  "artifact-targets",
  "manifest-out",
])

function parseArgs(argv: readonly string[]): LicenseGateOptions {
  const values = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const inlineValueIndex = arg.indexOf("=")
    if (inlineValueIndex !== -1) {
      const key = arg.slice(2, inlineValueIndex)
      assertAllowedOption(key)
      values.set(key, arg.slice(inlineValueIndex + 1))
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`)
    }
    const key = arg.slice(2)
    assertAllowedOption(key)
    values.set(key, next)
    index += 1
  }

  const app = values.get("app")
  const platform = values.get("platform")
  const artifactTargets = values.get("artifact-targets")
  const manifestOut = values.get("manifest-out")

  if (!apps.has(app as LicenseGateApp)) {
    throw new Error("--app must be desktop or cli")
  }
  const parsedApp = app as LicenseGateApp
  if (!artifactTargets) {
    throw new Error("--artifact-targets is required")
  }
  if (!manifestOut) {
    throw new Error("--manifest-out is required")
  }

  const parsedArtifactTargets = artifactTargets
    .split(",")
    .map((target) => target.trim())
    .filter((target) => target.length > 0)

  if (parsedApp === "desktop") {
    if (!desktopPlatforms.has(platform as DesktopReleasePlatform)) {
      throw new Error("--platform is not a supported desktop release platform")
    }
    return {
      app: parsedApp,
      platform: platform as DesktopReleasePlatform,
      artifactTargets: parsedArtifactTargets,
      manifestOut,
    }
  }

  if (!cliPlatforms.has(platform as CliReleasePlatform)) {
    throw new Error("--platform is not a supported cli release platform")
  }

  return {
    app: parsedApp,
    platform: platform as CliReleasePlatform,
    artifactTargets: parsedArtifactTargets,
    manifestOut,
  }
}

function assertAllowedOption(key: string): void {
  if (!allowedOptions.has(key)) {
    throw new Error(`Unknown option: --${key}`)
  }
}

try {
  await runLicenseGate(parseArgs(process.argv.slice(2)))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`license-gate: ${message}\n`)
  process.exitCode = 1
}
