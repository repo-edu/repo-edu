#!/usr/bin/env tsx

import {
  type LicenseGateApp,
  type ReleasePlatform,
  runLicenseGate,
} from "./license-gate.js"

type ParsedArgs = {
  readonly app: LicenseGateApp
  readonly platform: ReleasePlatform
  readonly artifactTargets: readonly string[]
  readonly manifestOut: string
}

const apps = new Set<LicenseGateApp>(["desktop", "cli"])
const platforms = new Set<ReleasePlatform>([
  "darwin-arm64",
  "linux-arm64",
  "linux-x64",
  "windows-arm64",
  "windows-x64",
])
const allowedOptions = new Set([
  "app",
  "platform",
  "artifact-targets",
  "manifest-out",
])

function parseArgs(argv: readonly string[]): ParsedArgs {
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
  if (!platforms.has(platform as ReleasePlatform)) {
    throw new Error("--platform is not a supported release platform")
  }
  if (!artifactTargets) {
    throw new Error("--artifact-targets is required")
  }
  if (!manifestOut) {
    throw new Error("--manifest-out is required")
  }

  return {
    app: app as LicenseGateApp,
    platform: platform as ReleasePlatform,
    artifactTargets: artifactTargets
      .split(",")
      .map((target) => target.trim())
      .filter((target) => target.length > 0),
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
