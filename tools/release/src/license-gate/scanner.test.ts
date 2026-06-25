import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  assertScannerParity,
  scanPackageNotices,
  scanPackageNoticesFromStart,
} from "./scanner.js"
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
    const trpcElectron = notices.find((entry) => entry.name === "trpc-electron")

    assert.ok(trpcElectron)
    assert.equal(trpcElectron.licenseText, undefined)
    assert.match(trpcElectron.licenseEvidence ?? "", /Metadata-only/)
    assert.doesNotMatch(
      trpcElectron.licenseEvidence ?? "",
      /<year>|<copyright holders>/,
    )
    assert.equal(trpcElectron.source.includes(repoRoot), false)
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

  it("keeps the Electron subtree and Codex platform optional misses benign", () => {
    assert.doesNotThrow(() =>
      assertScannerParity({
        scannerPackages: [],
        thirdParty: [
          reachedPackage("boolean", {
            path: ["trpc-electron", "electron", "@electron/get", "boolean"],
          }),
          reachedPackage("@openai/codex-linux-x64", {
            packageName: "@openai/codex-linux-x64",
            version: "0.128.0-linux-x64",
            packageDirectoryExists: false,
          }),
        ],
      }),
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
              path: [
                "trpc-electron",
                "electron",
                "@electron/get",
                "global-agent",
                "gopd",
              ],
              paths: [
                [
                  "trpc-electron",
                  "electron",
                  "@electron/get",
                  "global-agent",
                  "gopd",
                ],
                ["@repo-edu/integrations-git", "@gitbeaker/rest", "gopd"],
              ],
            }),
          ],
        }),
      /missed production package/,
    )
  })
})
