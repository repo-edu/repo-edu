import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { classifyLicenseExpression } from "./policy.js"
import { scanPackageNotices, scanPackageNoticesFromStart } from "./scanner.js"
import {
  assertScannerParity,
  completeScannerPackageNotices,
} from "./scanner-coverage.js"
import { packageKey } from "./shared.js"
import { reachedPackage, repoRoot, writePackage } from "./test-support.js"

describe("scanner package notices", () => {
  it("preserves compound SPDX expressions and excludes private first-party packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      await writePackage(root, "", {
        name: "@repo-edu/scanner-fixture",
        version: "1.0.0",
        private: true,
        dependencies: {
          compound: "1.0.0",
        },
      })
      await writePackage(
        root,
        "node_modules/compound",
        {
          name: "compound",
          version: "1.0.0",
          license: "MIT AND GPL-3.0-only",
        },
        {
          LICENSE: "Compound fixture license text\n",
          "README.md": "Installation instructions\n",
          NOTICE: "Additional attribution\n",
        },
      )

      const notices = await scanPackageNoticesFromStart(root)
      assert.deepEqual(
        notices.map((entry) => entry.name),
        ["compound"],
      )
      assert.equal(notices[0]?.licenseExpression, "MIT AND GPL-3.0-only")
      assert.equal(notices[0]?.licenseText, "Compound fixture license text")
      assert.equal(notices[0]?.licenseEvidence, undefined)
      assert.equal(notices[0]?.noticeText, "Additional attribution\n")
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("rejects an empty dedicated license file instead of substituting metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      await writePackage(root, "", {
        name: "@repo-edu/scanner-fixture",
        version: "1.0.0",
        private: true,
        dependencies: {
          noText: "1.0.0",
        },
      })
      await writePackage(
        root,
        "node_modules/noText",
        { name: "noText", version: "1.0.0" },
        { LICENSE: " \n" },
      )

      await assert.rejects(
        () => scanPackageNoticesFromStart(root),
        /unusable licenseText/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  for (const app of ["cli", "desktop"] as const) {
    it(`scans the real ${app} graph without first-party packages`, async () => {
      const notices = await scanPackageNotices(app, repoRoot)
      assert.ok(notices.length > 0)
      assert.equal(
        notices.some((entry) => entry.name.startsWith("@repo-edu/")),
        false,
      )
      assert.ok(
        notices.every(
          (entry) =>
            ((entry.licenseText ?? entry.licenseEvidence)?.trim().length ?? 0) >
            0,
        ),
      )
      assert.equal(
        notices.some((entry) => entry.source.includes(repoRoot)),
        false,
      )
      assert.equal(
        notices.some((entry) =>
          /<year>|<copyright holders>/.test(
            `${entry.licenseText ?? ""}\n${entry.licenseEvidence ?? ""}`,
          ),
        ),
        false,
      )
    })
  }

  for (const { version, files } of [
    { version: "1.0.0", files: {} },
    { version: "2.0.0", files: { README: "Apache-2.0" } },
    {
      version: "3.0.0",
      files: {
        "readme.MD": "Installation instructions. Licensed under Apache-2.0.",
      },
    },
  ]) {
    it(`uses declared metadata without version approval for a package at ${version}`, async () => {
      const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
      try {
        await writePackage(root, "", {
          name: "@repo-edu/scanner-fixture",
          version: "1.0.0",
          private: true,
          dependencies: { "metadata-only": version },
        })
        await writePackage(
          root,
          "node_modules/metadata-only",
          {
            name: "metadata-only",
            version,
            license: "Apache-2.0",
          },
          { ...files, NOTICE: "Package attribution\n" },
        )

        const [entry] = await scanPackageNoticesFromStart(root)
        assert.ok(entry)
        assert.equal(entry.version, version)
        assert.equal(entry.licenseExpression, "Apache-2.0")
        assert.equal(entry.licenseText, undefined)
        assert.equal(entry.noticeText, "Package attribution\n")
        assert.match(entry.licenseEvidence ?? "", /Metadata-only/)
        assert.match(entry.licenseEvidence ?? "", /Apache-2\.0/)
        assert.match(entry.source, /node_modules\/metadata-only\/package\.json/)
        assert.equal(entry.source.includes(root), false)
        assert.equal(
          classifyLicenseExpression(entry.licenseExpression).ok,
          true,
        )
      } finally {
        await rm(root, { force: true, recursive: true })
      }
    })
  }

  for (const license of [undefined, "", "UNKNOWN", "MIT*"]) {
    it(`rejects missing or guessed metadata (${String(license)}) even with a permissive README`, async () => {
      const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
      try {
        await writePackage(
          root,
          "",
          {
            name: "unreliable-metadata",
            version: "1.0.0",
            license,
          },
          { "README.md": "MIT" },
        )

        await assert.rejects(
          () => scanPackageNoticesFromStart(root),
          /no license expression|unknown or guessed license/,
        )
      } finally {
        await rm(root, { force: true, recursive: true })
      }
    })
  }

  for (const [license, allowed] of [
    ["MIT OR GPL-3.0-only", true],
    ["LGPL-2.1-only", true],
    ["GPL-3.0-only", false],
    ["MIT AND GPL-3.0-only", false],
    ["UNLICENSED", false],
    ["LicenseRef-Proprietary", false],
    ["SEE LICENSE IN LICENSE.txt", false],
    ["not-a-license", false],
  ] as const) {
    it(`applies the same policy to metadata-only ${license}`, async () => {
      const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
      try {
        await writePackage(
          root,
          "",
          {
            name: "metadata-policy",
            version: "1.0.0",
            license,
          },
          { "README.md": "MIT" },
        )

        const [entry] = await scanPackageNoticesFromStart(root)
        assert.ok(entry)
        assert.equal(entry.licenseExpression, license)
        assert.equal(entry.licenseText, undefined)
        assert.match(entry.licenseEvidence ?? "", /Metadata-only/)
        assert.equal(
          classifyLicenseExpression(entry.licenseExpression).ok,
          allowed,
        )
      } finally {
        await rm(root, { force: true, recursive: true })
      }
    })
  }

  it("scans production closure packages omitted from package-manifest traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const supportsColorPath = await writePackage(
        root,
        "node_modules/supports-color",
        {
          name: "supports-color",
          version: "7.2.0",
        },
        { LICENSE: "supports-color fixture license text\n" },
      )
      const hasFlagPath = await writePackage(
        root,
        "node_modules/has-flag",
        {
          name: "has-flag",
          version: "4.0.0",
        },
        { LICENSE: "has-flag fixture license text\n" },
      )
      const dependencyPath = [
        "electron-updater",
        "builder-util-runtime",
        "debug",
        "supports-color",
      ]

      const notices = await completeScannerPackageNotices({
        scannerPackages: [],
        thirdParty: [
          reachedPackage("supports-color", {
            version: "7.2.0",
            packagePath: supportsColorPath,
            path: dependencyPath,
          }),
          reachedPackage("has-flag", {
            version: "4.0.0",
            packagePath: hasFlagPath,
            path: [...dependencyPath, "has-flag"],
          }),
        ],
        sourceRoot: root,
      })

      assert.deepEqual(
        notices.map((entry) => entry.name),
        ["has-flag", "supports-color"],
      )
      assert.ok(notices.every((entry) => entry.source.includes(root) === false))
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})

describe("scanner parity guard", () => {
  it("allows unique package identity matches when scanner and pnpm paths differ", () => {
    assert.doesNotThrow(() =>
      assertScannerParity({
        scannerPackages: [
          {
            id: packageKey("left", "1.0.0", "/scanner/left"),
            packageName: "left",
            packagePath: "/scanner/left",
            kind: "package",
            name: "left",
            version: "1.0.0",
            licenseExpression: "MIT",
            source: "scanner",
            licenseText: "MIT text",
          },
        ],
        thirdParty: [
          reachedPackage("left", {
            packagePath: "/pnpm/left",
          }),
        ],
      }),
    )
  })

  it("requires a path match only when duplicate name/version instances exist", () => {
    assert.throws(
      () =>
        assertScannerParity({
          scannerPackages: [
            {
              id: packageKey("left", "1.0.0", "/scanner/a"),
              packageName: "left",
              packagePath: "/scanner/a",
              kind: "package",
              name: "left",
              version: "1.0.0",
              licenseExpression: "MIT",
              source: "scanner",
              licenseText: "MIT text",
            },
          ],
          thirdParty: [
            reachedPackage("left", { packagePath: "/pnpm/a" }),
            reachedPackage("left", { packagePath: "/pnpm/b" }),
          ],
        }),
      /missed production package/,
    )
  })

  it("keeps Codex platform optional misses benign", () => {
    assert.doesNotThrow(() =>
      assertScannerParity({
        scannerPackages: [],
        thirdParty: [
          reachedPackage("@openai/codex-linux-x64", {
            packageName: "@openai/codex-linux-x64",
            version: "0.128.0-linux-x64",
            packageDirectoryExists: false,
          }),
        ],
      }),
    )
  })

  it("exempts only absent platform packages declared optional by their reached Koffi parent", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const koffiPath = await writePackage(
        root,
        "node_modules/koffi",
        {
          name: "koffi",
          version: "3.3.1",
          optionalDependencies: {
            "@koromix/koffi-android-arm64": "3.3.1",
            "@koromix/koffi-android-x64": "3.3.1",
            "@koromix/koffi-linux-x64": "3.3.1",
          },
        },
        { LICENSE: "Koffi fixture license text\n" },
      )
      const koffi = reachedPackage("koffi", {
        version: "3.3.1",
        packagePath: koffiPath,
        path: ["@repo-edu/host-node", "koffi"],
      })
      const absentPackages = [
        "@koromix/koffi-android-arm64",
        "@koromix/koffi-android-x64",
        "@koromix/koffi-linux-x64",
      ].map((name) =>
        reachedPackage(name, {
          version: "3.3.1",
          packageDirectoryExists: false,
          path: [...koffi.path, name],
        }),
      )
      const scannerPackages = await completeScannerPackageNotices({
        scannerPackages: [],
        thirdParty: [koffi, ...absentPackages],
        sourceRoot: root,
      })
      assert.deepEqual(
        scannerPackages.map((entry) => entry.name),
        ["koffi"],
      )

      const name = "@koromix/koffi-android-arm64"
      for (const unexpected of [
        reachedPackage(name, { path: [...koffi.path, name] }),
        reachedPackage("@koromix/koffi-undeclared-x64", {
          packageDirectoryExists: false,
          path: [...koffi.path, "@koromix/koffi-undeclared-x64"],
        }),
        reachedPackage(name, {
          packageDirectoryExists: false,
          path: ["other-runtime", name],
        }),
        reachedPackage(name, {
          packageDirectoryExists: false,
          paths: [
            [...koffi.path, name],
            ["other-runtime", name],
          ],
        }),
        reachedPackage(name, {
          packageDirectoryExists: false,
          path: ["unrelated-parent", "koffi", name],
        }),
      ]) {
        assert.throws(
          () =>
            assertScannerParity({
              scannerPackages,
              thirdParty: [koffi, unexpected],
            }),
          /missed production package/,
        )
      }
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("requires explicit runtime evidence for the installed Koffi package", () => {
    const packagePath = "/repo/node_modules/@koromix/koffi-win32-x64"
    const thirdParty = [
      reachedPackage("@koromix/koffi-win32-x64", {
        packagePath,
        path: ["@repo-edu/host-node", "koffi", "@koromix/koffi-win32-x64"],
      }),
    ]

    assert.throws(
      () => assertScannerParity({ scannerPackages: [], thirdParty }),
      /missed production package/,
    )
    assert.doesNotThrow(() =>
      assertScannerParity({
        scannerPackages: [],
        thirdParty,
        runtimePackages: [
          {
            id: packageKey("@koromix/koffi-win32-x64", "1.0.0", packagePath),
            kind: "runtime-asset",
            name: "@koromix/koffi-win32-x64",
            version: "1.0.0",
            licenseExpression: "MIT",
            source: "runtime",
            licenseEvidence: "metadata",
          },
        ],
      }),
    )
  })

  it("does not exempt a Koffi-named package outside Koffi", () => {
    assert.throws(
      () =>
        assertScannerParity({
          scannerPackages: [],
          thirdParty: [
            reachedPackage("@koromix/koffi-win32-x64", {
              packageDirectoryExists: false,
              path: ["other-runtime", "@koromix/koffi-win32-x64"],
            }),
          ],
        }),
      /missed production package/,
    )
  })

  it("does not exempt arbitrary scanner misses merely containing electron", () => {
    assert.throws(
      () =>
        assertScannerParity({
          scannerPackages: [],
          thirdParty: [
            reachedPackage("left-pad", {
              path: ["some-electron-wrapper", "left-pad"],
            }),
          ],
        }),
      /missed production package/,
    )
  })

  it("does not exempt a scanner miss that also reaches a shipped path", () => {
    assert.throws(
      () =>
        assertScannerParity({
          scannerPackages: [],
          thirdParty: [
            reachedPackage("gopd", {
              path: ["electron", "@electron/get", "global-agent", "gopd"],
              paths: [
                ["electron", "@electron/get", "global-agent", "gopd"],
                ["@repo-edu/integrations-git", "@gitbeaker/rest", "gopd"],
              ],
            }),
          ],
        }),
      /missed production package/,
    )
  })
})
