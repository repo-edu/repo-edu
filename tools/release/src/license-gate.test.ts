import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { resolveDesktopRuntimePackageEntries } from "./license-gate/runtime-assets.js"
import {
  currentReleasePlatform,
  desktopTargetsForPlatform,
  forbidElectronRuntimeInstallEnv,
  repoRoot,
  restoreEnv,
} from "./license-gate/test-support.js"
import {
  runLicenseGate,
  validateLicenseGateArtifactTargets,
} from "./license-gate.js"

describe("artifact target validation", () => {
  it("accepts only the exact app and platform release target sets", () => {
    assert.doesNotThrow(() =>
      validateLicenseGateArtifactTargets({
        app: "desktop",
        platform: "linux-x64",
        artifactTargets: ["deb"],
      }),
    )
    assert.doesNotThrow(() =>
      validateLicenseGateArtifactTargets({
        app: "desktop",
        platform: "windows-x64",
        artifactTargets: ["nsis"],
      }),
    )
    assert.doesNotThrow(() =>
      validateLicenseGateArtifactTargets({
        app: "cli",
        platform: "linux-x64",
        artifactTargets: ["binary"],
      }),
    )

    assert.throws(
      () =>
        validateLicenseGateArtifactTargets({
          app: "desktop",
          platform: "linux-x64",
          artifactTargets: ["AppImage"],
        }),
      /Unsupported artifact targets/,
    )
    assert.throws(
      () =>
        validateLicenseGateArtifactTargets({
          app: "cli",
          platform: "linux-x64",
          artifactTargets: ["binary", "zip"],
        }),
      /Unsupported artifact targets/,
    )
    assert.throws(
      () =>
        validateLicenseGateArtifactTargets({
          app: "cli",
          platform: "windows-x64",
          artifactTargets: ["binary"],
        }),
      /Unsupported release platform for cli/,
    )
  })
})

describe("ripgrep notice evidence", () => {
  async function withNetworkDisabled(run: () => Promise<void>): Promise<void> {
    const originalFetch = globalThis.fetch
    const originalGuard = process.env[forbidElectronRuntimeInstallEnv]
    globalThis.fetch = (async () => {
      throw new Error("release gate must not fetch ripgrep notice evidence")
    }) as typeof fetch
    process.env[forbidElectronRuntimeInstallEnv] = "1"
    try {
      await run()
    } finally {
      globalThis.fetch = originalFetch
      restoreEnv(forbidElectronRuntimeInstallEnv, originalGuard)
    }
  }

  it("generates a desktop gate manifest with committed ripgrep notices only", async () => {
    const platform = currentReleasePlatform()
    if (!platform) {
      return
    }

    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-gate-"))
    const manifestPath = join(root, "notices.txt")
    try {
      await resolveDesktopRuntimePackageEntries({
        root: repoRoot,
        platform,
        artifactTargets: desktopTargetsForPlatform(platform),
      })

      await withNetworkDisabled(() =>
        runLicenseGate({
          app: "desktop",
          platform,
          artifactTargets: desktopTargetsForPlatform(platform),
          manifestOut: manifestPath,
          root: repoRoot,
        }),
      )

      const manifest = await readFile(manifestPath, "utf8")
      assert.match(manifest, /ripgrep vendored by @openai\/codex/)
      assert.match(manifest, /vendored vendor\/.*\/path\/rg/)
      assert.match(manifest, /root @openai\/codex 0\.128\.0 bin\/rg/)
      assert.doesNotMatch(
        manifest,
        /root @openai\/codex 0\.128\.0-darwin-arm64/,
      )
      assert.match(manifest, /notice text from committed ripgrep 15\.1\.0/)
      assert.match(manifest, /This project is dual-licensed/)
      assert.match(manifest, /The MIT License \(MIT\)/)
      assert.match(
        manifest,
        /unencumbered software released into the public domain/,
      )
      assert.match(
        manifest,
        /PCRE2 linked by ripgrep vendored by @openai\/codex/,
      )
      assert.match(manifest, /reports PCRE2 10\.45/)
      assert.match(
        manifest,
        /PCRE2 linked by ripgrep vendored by @openai\/codex[\s\S]*SPDX License: BSD-3-Clause WITH PCRE2-exception/,
      )
      assert.match(
        manifest,
        /notice text from committed PCRE2 10\.45 source-tag LICENCE\.txt/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
