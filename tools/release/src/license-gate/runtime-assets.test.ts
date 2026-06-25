import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { formatNoticeManifest, mergeNoticeEntries } from "./notices.js"
import {
  resolveCliRuntimeNoticeEntries,
  resolveDesktopRuntimePackageEntries,
} from "./runtime-assets.js"
import { scanPackageNotices } from "./scanner.js"
import {
  currentCliReleasePlatform,
  currentReleasePlatform,
  desktopTargetsForPlatform,
  enumerateRealProductionDependencies,
  forbidElectronRuntimeInstallEnv,
  repoRoot,
  restoreEnv,
  writeDesktopRuntimeFixture,
  writePackage,
} from "./test-support.js"

describe("runtime notice records", () => {
  it("resolves explicit desktop and CLI runtime records", async () => {
    const platform = currentReleasePlatform()
    if (!platform) {
      return
    }

    const desktopEntries = await resolveDesktopRuntimePackageEntries({
      root: repoRoot,
      platform,
      artifactTargets: desktopTargetsForPlatform(platform),
    })
    assert.deepEqual(
      desktopEntries
        .map((entry) => entry.name)
        .filter((name) =>
          [
            "electron",
            "electron-builder",
            "app-builder-lib",
            "app-builder-bin",
            "builder-util-runtime",
          ].includes(name),
        )
        .sort(),
      [
        "app-builder-bin",
        "app-builder-lib",
        "builder-util-runtime",
        "electron",
        "electron-builder",
      ],
    )
    assert.match(
      desktopEntries.find((entry) => entry.name === "electron")
        ?.additionalText ?? "",
      /Chromium|copyright/i,
    )

    const cliPlatform = currentCliReleasePlatform()
    if (!cliPlatform) {
      return
    }

    const cliEntries = await resolveCliRuntimeNoticeEntries(
      repoRoot,
      cliPlatform,
    )
    assert.ok(cliEntries.some((entry) => entry.name === "bun"))
    assert.ok(cliEntries.some((entry) => /^@oven\/bun-/.test(entry.name)))

    const linkedSubjects = cliEntries.filter(
      (entry) =>
        entry.name.includes("JavaScriptCore") || entry.name.includes("tinycc"),
    )
    assert.equal(linkedSubjects.length, 2)
    for (const subject of linkedSubjects) {
      assert.equal(subject.licenseExpression, "LGPL-2.1-only")
      assert.match(subject.licenseText ?? "", /Lesser General Public License/i)
    }

    const cliRuntimeManifest = formatNoticeManifest({
      app: "cli",
      platform: cliPlatform,
      artifactTargets: ["binary"],
      runtimeDecisions: [],
      entries: cliEntries,
    })
    assert.match(cliRuntimeManifest, /License Text:/)
    assert.match(cliRuntimeManifest, /License Evidence:/)
    assert.doesNotMatch(cliRuntimeManifest, /<year>|<copyright holders>/)
  })

  it("materializes Electron lazy runtime notices through package install", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      await writeDesktopRuntimeFixture(root, {
        electronFiles: {
          "install.js": `
const fs = require("node:fs")
const path = require("node:path")
const dist = path.join(__dirname, "dist")
fs.mkdirSync(dist, { recursive: true })
fs.writeFileSync(path.join(dist, "LICENSES.chromium.html"), \`Chromium notice for \${process.env.ELECTRON_INSTALL_PLATFORM}/\${process.env.ELECTRON_INSTALL_ARCH}\\n\`)
fs.writeFileSync(path.join(dist, "install-env.json"), JSON.stringify({
  platform: process.env.ELECTRON_INSTALL_PLATFORM,
  arch: process.env.ELECTRON_INSTALL_ARCH,
  npmPlatform: process.env.npm_config_platform,
  npmArch: process.env.npm_config_arch,
}))
fs.writeFileSync(path.join(dist, "version"), "42.4.0\\n")
fs.writeFileSync(path.join(__dirname, "path.txt"), "electron\\n")
`.trimStart(),
        },
      })

      const entries = await resolveDesktopRuntimePackageEntries({
        root,
        platform: "linux-arm64",
        artifactTargets: ["deb"],
      })
      const electronEntry = entries.find((entry) => entry.name === "electron")
      assert.match(electronEntry?.additionalText ?? "", /Chromium notice/)

      const installEnv = JSON.parse(
        await readFile(
          join(
            root,
            "apps/desktop/node_modules/electron/dist/install-env.json",
          ),
          "utf8",
        ),
      )
      assert.deepEqual(installEnv, {
        platform: "linux",
        arch: "arm64",
        npmPlatform: "linux",
        npmArch: "arm64",
      })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("uses packaged Electron notices before running runtime install", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    const originalGuard = process.env[forbidElectronRuntimeInstallEnv]
    try {
      await writeDesktopRuntimeFixture(root, {
        electronFiles: {
          "install.js": "throw new Error('installer should not run')\n",
        },
      })
      const packagedNotice = join(
        root,
        "apps/desktop/release/linux-unpacked/LICENSES.chromium.html",
      )
      await mkdir(dirname(packagedNotice), { recursive: true })
      await writeFile(packagedNotice, "Packaged Chromium notice\n", "utf8")

      process.env[forbidElectronRuntimeInstallEnv] = "1"
      const entries = await resolveDesktopRuntimePackageEntries({
        root,
        platform: "linux-x64",
        artifactTargets: ["deb"],
      })
      const electronEntry = entries.find((entry) => entry.name === "electron")
      assert.match(electronEntry?.additionalText ?? "", /Packaged Chromium/)
    } finally {
      restoreEnv(forbidElectronRuntimeInstallEnv, originalGuard)
      await rm(root, { force: true, recursive: true })
    }
  })

  it("fails closed when Electron runtime install is disabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    const originalGuard = process.env[forbidElectronRuntimeInstallEnv]
    try {
      await writeDesktopRuntimeFixture(root, {
        electronFiles: {
          "install.js": "throw new Error('installer should not run')\n",
        },
      })

      process.env[forbidElectronRuntimeInstallEnv] = "1"
      await assert.rejects(
        () =>
          resolveDesktopRuntimePackageEntries({
            root,
            platform: "linux-arm64",
            artifactTargets: ["deb"],
          }),
        /Electron runtime install is disabled/,
      )
    } finally {
      restoreEnv(forbidElectronRuntimeInstallEnv, originalGuard)
      await rm(root, { force: true, recursive: true })
    }
  })

  it("records the Bun optional package that supplied the installed binary", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      await writePackage(root, "", {
        name: "@repo-edu/bun-runtime-fixture",
        version: "1.0.0",
      })
      await writePackage(
        root,
        "node_modules/bun",
        {
          name: "bun",
          version: "1.3.11",
        },
        {
          "bin/bun.exe": "baseline binary\n",
        },
      )
      await writePackage(
        root,
        "node_modules/bun/node_modules/@oven/bun-linux-x64",
        {
          name: "@oven/bun-linux-x64",
          version: "1.3.11",
        },
        {
          "bin/bun": "avx2 binary\n",
        },
      )
      await writePackage(
        root,
        "node_modules/bun/node_modules/@oven/bun-linux-x64-baseline",
        {
          name: "@oven/bun-linux-x64-baseline",
          version: "1.3.11",
        },
        {
          "bin/bun": "baseline binary\n",
        },
      )

      const cliEntries = await resolveCliRuntimeNoticeEntries(root, "linux-x64")
      assert.ok(
        cliEntries.some(
          (entry) => entry.name === "@oven/bun-linux-x64-baseline",
        ),
      )
      assert.equal(
        cliEntries.some((entry) => entry.name === "@oven/bun-linux-x64"),
        false,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("records the Bun optional package whose binary was moved into bun/bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      await writePackage(root, "", {
        name: "@repo-edu/bun-runtime-fixture",
        version: "1.0.0",
      })
      await writePackage(
        root,
        "node_modules/bun",
        {
          name: "bun",
          version: "1.3.11",
        },
        {
          "bin/bun.exe": "baseline binary\n",
        },
      )
      await writePackage(
        root,
        "node_modules/bun/node_modules/@oven/bun-linux-x64",
        {
          name: "@oven/bun-linux-x64",
          version: "1.3.11",
        },
        {
          "bin/bun": "avx2 binary\n",
        },
      )
      await writePackage(
        root,
        "node_modules/bun/node_modules/@oven/bun-linux-x64-baseline",
        {
          name: "@oven/bun-linux-x64-baseline",
          version: "1.3.11",
        },
      )

      const cliEntries = await resolveCliRuntimeNoticeEntries(root, "linux-x64")
      assert.ok(
        cliEntries.some(
          (entry) => entry.name === "@oven/bun-linux-x64-baseline",
        ),
      )
      assert.equal(
        cliEntries.some((entry) => entry.name === "@oven/bun-linux-x64"),
        false,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("fails closed when the installed Bun version is not attested", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      await writePackage(root, "", {
        name: "@repo-edu/bun-unattested-fixture",
        version: "1.0.0",
      })
      await writePackage(root, "node_modules/bun", {
        name: "bun",
        version: "9.9.9",
      })

      await assert.rejects(
        () => resolveCliRuntimeNoticeEntries(root, "linux-x64"),
        /Bun runtime version 9\.9\.9 is not attested/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("merges scanner and runtime records through canonical package identity", async () => {
    const platform = currentReleasePlatform()
    if (!platform) {
      return
    }

    const dependencies =
      await enumerateRealProductionDependencies("@repo-edu/desktop")
    const scannerEntries = await scanPackageNotices("desktop", repoRoot)
    const runtimeEntries = await resolveDesktopRuntimePackageEntries({
      root: repoRoot,
      platform,
      artifactTargets: desktopTargetsForPlatform(platform),
      productionReached: dependencies.productionReached,
    })
    const mergedEntries = mergeNoticeEntries([
      ...scannerEntries,
      ...runtimeEntries,
    ])

    const electronEntries = mergedEntries.filter(
      (entry) => entry.name === "electron",
    )
    assert.equal(electronEntries.length, 1)
    assert.match(
      electronEntries[0]?.additionalText ?? "",
      /Chromium|copyright/i,
    )
    assert.equal(
      mergedEntries.some((entry) => entry.source.includes(repoRoot)),
      false,
    )
    assert.equal(
      mergedEntries.filter((entry) => entry.name === "builder-util-runtime")
        .length,
      1,
    )
  })
})
