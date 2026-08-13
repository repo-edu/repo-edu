import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  parseCodexPackageManifest,
  resolveCodexPackageRipgrep,
} from "./codex-package.js"

const manifest = {
  layoutVersion: 1,
  version: "0.147.0",
  target: "aarch64-apple-darwin",
  variant: "codex",
  entrypoint: "bin/codex",
  resourcesDir: "codex-resources",
  pathDir: "codex-path",
}

const platformCases = [
  {
    platform: "darwin-arm64",
    target: "aarch64-apple-darwin",
    binary: "rg",
  },
  {
    platform: "windows-x64",
    target: "x86_64-pc-windows-msvc",
    binary: "rg.exe",
  },
] as const

describe("Codex package layout", () => {
  for (const fixture of platformCases) {
    it(`resolves ${fixture.binary} from the declared ${fixture.platform} path directory`, async () => {
      const packagePath = await mkdtemp(join(tmpdir(), "codex-package-test-"))
      try {
        const targetPath = join(packagePath, "vendor", fixture.target)
        await mkdir(join(targetPath, "codex-path"), { recursive: true })
        await writeFile(
          join(targetPath, "codex-package.json"),
          JSON.stringify({ ...manifest, target: fixture.target }),
        )
        await writeFile(
          join(targetPath, "codex-path", fixture.binary),
          "binary",
        )

        const resolved = await resolveCodexPackageRipgrep({
          packagePath,
          packageVersion: "0.147.0",
          platform: fixture.platform,
        })

        assert.equal(
          resolved.binaryPath,
          join(targetPath, "codex-path", fixture.binary),
        )
        assert.equal(
          resolved.manifestRelativePath,
          `vendor/${fixture.target}/codex-package.json`,
        )
      } finally {
        await rm(packagePath, { recursive: true, force: true })
      }
    })
  }

  it("rejects a package for another target", () => {
    assert.throws(
      () =>
        parseCodexPackageManifest(JSON.stringify(manifest), {
          expectedTarget: "x86_64-pc-windows-msvc",
          expectedVersion: "0.147.0",
        }),
      /target must be "x86_64-pc-windows-msvc"/,
    )
  })

  it("rejects a path directory that can escape the target", () => {
    assert.throws(
      () =>
        parseCodexPackageManifest(
          JSON.stringify({ ...manifest, pathDir: "../codex-path" }),
          {
            expectedTarget: "aarch64-apple-darwin",
            expectedVersion: "0.147.0",
          },
        ),
      /pathDir must be one safe path segment/,
    )
  })
})
