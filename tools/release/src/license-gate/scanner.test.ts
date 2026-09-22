import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
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
        { LICENSE: "Compound fixture license text\n" },
      )

      const notices = await scanPackageNoticesFromStart(root)
      assert.deepEqual(
        notices.map((entry) => entry.name),
        ["compound"],
      )
      assert.equal(notices[0]?.licenseExpression, "MIT AND GPL-3.0-only")
      assert.equal(notices[0]?.licenseText, "Compound fixture license text")
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("fails closed when scanner-owned notice text is missing", async () => {
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
      await writePackage(root, "node_modules/noText", {
        name: "noText",
        version: "1.0.0",
      })

      await assert.rejects(
        () => scanPackageNoticesFromStart(root),
        /unusable licenseText|no scanner-owned license file/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("scans the real CLI graph without first-party packages", async () => {
    const notices = await scanPackageNotices("cli", repoRoot)
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

  it("uses explicit metadata evidence for real checker clarifications", async () => {
    const notices = await scanPackageNotices("desktop", repoRoot)
    const codex = notices.find((entry) => entry.name === "@openai/codex")

    assert.ok(codex)
    assert.equal(codex.licenseText, undefined)
    assert.match(codex.licenseEvidence ?? "", /Metadata-only/)
    assert.doesNotMatch(
      codex.licenseEvidence ?? "",
      /<year>|<copyright holders>/,
    )
    assert.equal(codex.source.includes(repoRoot), false)
    assert.equal(
      notices.some((entry) => entry.name === "trpc-electron"),
      false,
    )
  })

  it("uses metadata evidence for Codex 0.155.1 instead of its README", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      await writePackage(root, "", {
        name: "@repo-edu/scanner-fixture",
        version: "1.0.0",
        private: true,
        dependencies: { "@openai/codex": "0.155.1" },
      })
      await writePackage(
        root,
        "node_modules/@openai/codex",
        {
          name: "@openai/codex",
          version: "0.155.1",
          license: "Apache-2.0",
        },
        {
          "README.md":
            "Codex CLI installation instructions.\nThis repository is licensed under the [Apache-2.0 License](LICENSE).\n",
        },
      )

      const [codex] = await scanPackageNoticesFromStart(root)
      assert.ok(codex)
      assert.equal(codex.licenseExpression, "Apache-2.0")
      assert.equal(codex.licenseText, undefined)
      assert.match(codex.licenseEvidence ?? "", /Metadata-only/)
      assert.match(codex.source, /metadata clarification/)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

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
