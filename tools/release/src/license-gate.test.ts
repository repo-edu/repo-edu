import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  packageKey,
  resolveRepoRelativePath,
  runPnpmJson,
} from "./license-gate/shared.js"
import {
  assertNoForbiddenProductionDependencies,
  assertScannerParity,
  classifyLicenseExpression,
  enumeratePackageClosureFromList,
  extractRipgrepVersion,
  findReachedPackageByReachedName,
  formatNoticeManifest,
  manifestFileName,
  mergeNoticeEntries,
  noticeSidecarName,
  type PnpmListNode,
  type ProductionDependencyViews,
  parseDotslashManifest,
  type ReachedPackage,
  type ReleasePlatform,
  readRequiredTextFiles,
  resolveCliRuntimeNoticeEntries,
  resolveDesktopRuntimePackageEntries,
  runLicenseGate,
  scanPackageNotices,
  scanPackageNoticesFromStart,
  validateLicenseGateArtifactTargets,
} from "./license-gate.js"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

function currentReleasePlatform(): ReleasePlatform | null {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-arm64"
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "linux-arm64"
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x64"
  }
  if (process.platform === "win32" && process.arch === "arm64") {
    return "windows-arm64"
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "windows-x64"
  }
  return null
}

function desktopTargetsForPlatform(
  platform: ReleasePlatform,
): readonly string[] {
  if (platform === "darwin-arm64") {
    return ["dmg", "zip"]
  }
  if (platform === "linux-arm64" || platform === "linux-x64") {
    return ["AppImage", "deb"]
  }
  return ["nsis"]
}

async function writePackage(
  root: string,
  path: string,
  pkg: {
    readonly name: string
    readonly version: string
    readonly license?: string
    readonly private?: boolean
    readonly dependencies?: Record<string, string>
  },
  files?: Record<string, string>,
): Promise<string> {
  const packagePath = join(root, path)
  await mkdir(packagePath, { recursive: true })
  await writeFile(
    join(packagePath, "package.json"),
    JSON.stringify({ license: "MIT", ...pkg }, null, 2),
    "utf8",
  )
  await writeFile(join(packagePath, "index.js"), "export {}\n", "utf8")
  for (const [file, contents] of Object.entries(files ?? {})) {
    const filePath = join(packagePath, file)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, contents, "utf8")
  }
  return packagePath
}

async function enumerateRealProductionDependencies(
  packageName: string,
): Promise<ProductionDependencyViews> {
  const [listRoot] = await runPnpmJson<PnpmListNode[]>(
    [
      "--filter",
      packageName,
      "list",
      "--prod",
      "--depth",
      "Infinity",
      "--json",
    ],
    repoRoot,
  )
  assert.ok(listRoot)
  return enumeratePackageClosureFromList(listRoot, { repoRoot })
}

function reachedPackage(
  reachedName: string,
  options?: Partial<ReachedPackage>,
): ReachedPackage {
  const packageName = options?.packageName ?? reachedName
  const version = options?.version ?? "1.0.0"
  return {
    reachedName,
    packageName,
    version,
    packagePath: options?.packagePath ?? `/repo/node_modules/${packageName}`,
    firstParty: options?.firstParty ?? false,
    packageDirectoryExists: options?.packageDirectoryExists ?? true,
    paths: options?.paths ?? [options?.path ?? [reachedName]],
    path: options?.path ?? [reachedName],
  }
}

describe("license policy", () => {
  it("allows explicit permissive and weak-copyleft SPDX expressions", () => {
    assert.equal(classifyLicenseExpression("MIT").ok, true)
    assert.equal(classifyLicenseExpression("LGPL-2.1-only").ok, true)
    assert.equal(classifyLicenseExpression("MIT OR GPL-3.0-only").ok, true)
    assert.equal(
      classifyLicenseExpression("BSD-3-Clause WITH PCRE2-exception").ok,
      true,
    )

    const strongCopyleft = classifyLicenseExpression("MIT AND GPL-3.0-only")
    assert.equal(strongCopyleft.ok, false)
    assert.match(strongCopyleft.reason, /GPL-3\.0-only/)

    const unconfiguredException = classifyLicenseExpression(
      "MIT WITH LLVM-exception",
    )
    assert.equal(unconfiguredException.ok, false)
    assert.match(unconfiguredException.reason, /does not satisfy/)

    const invalid = classifyLicenseExpression("MIT OR Not-A-License")
    assert.equal(invalid.ok, false)
    assert.match(invalid.reason, /invalid SPDX/)

    const unknown = classifyLicenseExpression("SEE LICENSE IN LICENSE.md")
    assert.equal(unknown.ok, false)
    assert.match(unknown.reason, /unknown|non-redistributable/)
  })
})

describe("production dependency enumeration", () => {
  it("exposes productionReached and thirdParty without unsaved root tooling", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const applicationPath = await writePackage(root, "packages/application", {
        name: "@repo-edu/application",
        version: "1.0.0",
      })
      const domainPath = await writePackage(root, "packages/domain", {
        name: "@repo-edu/domain",
        version: "1.0.0",
      })
      const leftPath = await writePackage(root, "node_modules/left", {
        name: "left",
        version: "1.0.0",
      })
      const sharedPath = await writePackage(root, "node_modules/shared", {
        name: "shared",
        version: "2.0.0",
      })
      const aliasPath = await writePackage(root, "node_modules/alias-target", {
        name: "real-package",
        version: "3.0.0",
      })
      const claudeCoderPath = await writePackage(
        root,
        "packages/claude-coder",
        {
          name: "@repo-edu/claude-coder",
          version: "1.0.0",
        },
      )

      const list: PnpmListNode = {
        name: "@repo-edu/desktop",
        version: "1.0.0",
        path: join(root, "apps/desktop"),
        dependencies: {
          "@repo-edu/application": {
            version: "link:../../packages/application",
            path: applicationPath,
            dependencies: {
              "@repo-edu/domain": {
                version: "link:../../packages/domain",
                path: domainPath,
              },
            },
          },
          left: {
            version: "1.0.0",
            path: leftPath,
            dependencies: {
              shared: {
                version: "2.0.0",
                path: sharedPath,
                dependencies: {},
              },
            },
          },
          "alias-package": {
            version: "3.0.0",
            path: aliasPath,
          },
          "optional-missing": {
            version: "5.0.0",
            path: join(root, "node_modules/optional-missing"),
          },
        },
        unsavedDependencies: {
          "@repo-edu/claude-coder": {
            version: "link:../../packages/claude-coder",
            path: claudeCoderPath,
          },
        },
      }

      const views = enumeratePackageClosureFromList(list, { repoRoot: root })
      assert.deepEqual(
        views.productionReached
          .filter((pkg) => pkg.firstParty)
          .map((pkg) => pkg.packageName)
          .sort(),
        ["@repo-edu/application", "@repo-edu/domain"],
      )
      assert.deepEqual(views.thirdParty.map((pkg) => pkg.reachedName).sort(), [
        "alias-package",
        "left",
        "optional-missing",
        "shared",
      ])
      assert.equal(
        views.thirdParty.find((pkg) => pkg.reachedName === "alias-package")
          ?.packageName,
        "real-package",
      )
      assert.equal(
        views.thirdParty.find((pkg) => pkg.reachedName === "optional-missing")
          ?.packageDirectoryExists,
        false,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("fails closed when production reaches forbidden dev-only packages", () => {
    assert.throws(
      () =>
        assertNoForbiddenProductionDependencies([
          reachedPackage("@repo-edu/claude-coder", {
            firstParty: true,
            packageName: "@repo-edu/claude-coder",
          }),
        ]),
      /Forbidden dev-only package/,
    )
    assert.throws(
      () =>
        assertNoForbiddenProductionDependencies([
          reachedPackage("@repo-edu/test-fixtures", {
            firstParty: true,
            packageName: "@repo-edu/test-fixtures",
          }),
        ]),
      /Forbidden dev-only package/,
    )
  })

  it("records each package once and terminates on a cyclic production graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const aPath = await writePackage(root, "node_modules/a", {
        name: "a",
        version: "1.0.0",
      })
      const bPath = await writePackage(root, "node_modules/b", {
        name: "b",
        version: "1.0.0",
      })

      const list: PnpmListNode = {
        name: "@repo-edu/cyclic-fixture",
        version: "1.0.0",
        path: join(root, "apps/desktop"),
        dependencies: {
          a: {
            version: "1.0.0",
            path: aPath,
            dependencies: {
              b: {
                version: "1.0.0",
                path: bPath,
                dependencies: {
                  a: {
                    version: "1.0.0",
                    path: aPath,
                    deduped: true,
                    dedupedDependenciesCount: 1,
                  },
                },
              },
            },
          },
        },
      }

      const views = enumeratePackageClosureFromList(list, { repoRoot: root })
      assert.deepEqual(views.thirdParty.map((pkg) => pkg.reachedName).sort(), [
        "a",
        "b",
      ])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("finds packages by dependency key without matching aliased package metadata", () => {
    const platformOptional = reachedPackage("@openai/codex-darwin-arm64", {
      packageName: "@openai/codex",
      version: "0.128.0-darwin-arm64",
    })
    const launcher = reachedPackage("@openai/codex", {
      packageName: "@openai/codex",
      version: "0.128.0",
    })

    assert.equal(
      findReachedPackageByReachedName(
        [platformOptional, launcher],
        "@openai/codex",
      )?.version,
      "0.128.0",
    )
  })
})

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

describe("artifact target validation", () => {
  it("accepts only the exact app and platform release target sets", () => {
    assert.doesNotThrow(() =>
      validateLicenseGateArtifactTargets({
        app: "desktop",
        platform: "linux-x64",
        artifactTargets: ["deb", "AppImage"],
      }),
    )
    assert.doesNotThrow(() =>
      validateLicenseGateArtifactTargets({
        app: "cli",
        platform: "windows-x64",
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
  })
})

describe("runtime notice records", () => {
  it("resolves explicit desktop and CLI runtime records", async () => {
    const platform = currentReleasePlatform()
    if (!platform) {
      return
    }

    const desktopEntries = await resolveDesktopRuntimePackageEntries({
      root: repoRoot,
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

    const cliEntries = await resolveCliRuntimeNoticeEntries(repoRoot, platform)
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
      platform,
      artifactTargets: ["binary"],
      runtimeDecisions: [],
      entries: cliEntries,
    })
    assert.match(cliRuntimeManifest, /License Text:/)
    assert.match(cliRuntimeManifest, /License Evidence:/)
    assert.doesNotMatch(cliRuntimeManifest, /<year>|<copyright holders>/)
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

describe("required notice files", () => {
  it("fails closed when an explicit notice file is absent or empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const present = join(root, "NOTICE")
      const missing = join(root, "LICENSE")
      const empty = join(root, "EMPTY")
      await writeFile(present, "notice text\n", "utf8")
      await writeFile(empty, "\n", "utf8")

      await assert.rejects(
        () => readRequiredTextFiles([present, missing]),
        /Required notice file is missing/,
      )
      await assert.rejects(
        () => readRequiredTextFiles([empty]),
        /Required notice file is empty/,
      )
      assert.deepEqual(await readRequiredTextFiles([present]), [
        "notice text\n",
      ])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})

describe("manifest helpers", () => {
  it("resolves license gate file options relative to the repo root", () => {
    assert.equal(
      resolveRepoRelativePath("/repo", "apps/desktop/out/manifest.json"),
      resolve("/repo/apps/desktop/out/manifest.json"),
    )
    assert.equal(
      resolveRepoRelativePath("/repo", "/tmp/repo-edu-notices.txt"),
      "/tmp/repo-edu-notices.txt",
    )
  })

  it("uses app and platform scoped manifest and sidecar names", () => {
    assert.equal(
      manifestFileName("desktop", "darwin-arm64"),
      "RepoEdu-third-party-notices-desktop-darwin-arm64.txt",
    )
    assert.equal(
      noticeSidecarName("redu-linux-x64"),
      "redu-linux-x64.third-party-notices.txt",
    )
  })

  it("formats third-party notices without dynamic first-party listings", () => {
    const manifest = formatNoticeManifest({
      app: "desktop",
      platform: "linux-x64",
      artifactTargets: ["AppImage", "deb"],
      runtimeDecisions: [
        {
          target: "deb",
          decision: "No extra runtime.",
        },
      ],
      entries: [
        {
          id: "left",
          name: "left",
          version: "1.0.0",
          licenseExpression: "MIT",
          kind: "package",
          source: "test",
          licenseText: "MIT text",
        },
      ],
    })

    assert.doesNotMatch(manifest, /@repo-edu\/domain@1.0.0/)
    assert.match(manifest, /root MIT license/)
    assert.match(manifest, /deb: No extra runtime/)
    assert.match(manifest, /left \(1.0.0\)/)
  })

  it("parses a DotSlash manifest with a shebang prefix", () => {
    const manifest = parseDotslashManifest(`#!/usr/bin/env dotslash

{"name":"rg","platforms":{"linux-x86_64":{"size":1,"hash":"sha256","digest":"abc","format":"tar.gz","path":"ripgrep/rg","providers":[{"url":"https://example.test/rg.tar.gz"}]}}}`)

    assert.equal(manifest.name, "rg")
    assert.equal(manifest.platforms["linux-x86_64"]?.path, "ripgrep/rg")
  })

  it("derives ripgrep version from a DotSlash record", () => {
    assert.equal(
      extractRipgrepVersion(
        {
          size: 1,
          hash: "sha256",
          digest: "abc",
          format: "tar.gz",
          path: "ripgrep-16.2.3-aarch64-apple-darwin/rg",
          providers: [
            {
              url: "https://github.com/BurntSushi/ripgrep/releases/download/16.2.3/ripgrep-16.2.3-aarch64-apple-darwin.tar.gz",
            },
          ],
        },
        "https://github.com/BurntSushi/ripgrep/releases/download/16.2.3/ripgrep-16.2.3-aarch64-apple-darwin.tar.gz",
      ),
      "16.2.3",
    )
    assert.throws(
      () =>
        extractRipgrepVersion(
          {
            size: 1,
            hash: "sha256",
            digest: "abc",
            format: "tar.gz",
            path: "ripgrep-16.2.3-aarch64-apple-darwin/rg",
            providers: [
              {
                url: "https://github.com/BurntSushi/ripgrep/releases/download/16.2.4/ripgrep-16.2.4-aarch64-apple-darwin.tar.gz",
              },
            ],
          },
          "https://github.com/BurntSushi/ripgrep/releases/download/16.2.4/ripgrep-16.2.4-aarch64-apple-darwin.tar.gz",
        ),
      /single ripgrep version/,
    )
  })
})

describe("ripgrep notice evidence", () => {
  async function withNetworkDisabled(run: () => Promise<void>): Promise<void> {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error("release gate must not fetch ripgrep notice evidence")
    }) as typeof fetch
    try {
      await run()
    } finally {
      globalThis.fetch = originalFetch
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

describe("release workflow wiring", () => {
  it("uses the root packageManager as the only pnpm version authority", async () => {
    const rootPackageJson = JSON.parse(
      await readFile(join(repoRoot, "package.json"), "utf8"),
    ) as { packageManager?: unknown }
    const setupAction = await readFile(
      join(repoRoot, ".github/actions/setup/action.yml"),
      "utf8",
    )

    assert.equal(rootPackageJson.packageManager, "pnpm@11.5.3")
    assert.match(setupAction, /uses: pnpm\/action-setup@v4/)
    assert.doesNotMatch(setupAction, /^\s+version:\s*["']?\d/m)
  })

  it("local release preflight compiles and gates the CLI without a metafile", async () => {
    const releaseScript = await readFile(
      join(repoRoot, "tools/release/src/main.ts"),
      "utf8",
    )

    assert.match(releaseScript, /"bun"[\s\S]*"build"[\s\S]*"--compile"/)
    assert.doesNotMatch(releaseScript, /--metafile/)
    assert.doesNotMatch(releaseScript, /--bun-metafile/)
    assert.doesNotMatch(releaseScript, /--desktop-bundle-manifest/)
  })

  const workflowExpectations = [
    {
      file: ".github/workflows/macos-arm64-release.yml",
      snippets: [
        "--app desktop --platform darwin-arm64 --artifact-targets dmg,zip",
        "--app cli --platform darwin-arm64",
        "redu-darwin-arm64.third-party-notices.txt",
        "redu-darwin-arm64 redu-darwin-arm64.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/linux-arm64-release.yml",
      snippets: [
        "--app desktop --platform linux-arm64 --artifact-targets AppImage,deb",
        "--app cli --platform linux-arm64",
        "redu-linux-arm64.third-party-notices.txt",
        "redu-linux-arm64 redu-linux-arm64.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/windows-arm64-release.yml",
      snippets: [
        "--app desktop --platform windows-arm64 --artifact-targets nsis",
        "--app cli --platform windows-arm64",
        "redu-windows-arm64.exe.third-party-notices.txt",
        "redu-windows-arm64.exe redu-windows-arm64.exe.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/windows-arm64-no-secrets-release.yml",
      snippets: [
        "--app desktop --platform windows-arm64 --artifact-targets nsis",
        "--app cli --platform windows-arm64",
        "redu-windows-arm64.exe.third-party-notices.txt",
        "redu-windows-arm64.exe redu-windows-arm64.exe.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/linux-windows-x64-release.yml",
      snippets: [
        "--app desktop --platform linux-x64 --artifact-targets AppImage,deb",
        "--app desktop --platform windows-x64 --artifact-targets nsis",
        "redu-linux-x64.third-party-notices.txt",
        "redu-windows-x64.exe.third-party-notices.txt",
        "redu-linux-x64 redu-linux-x64.third-party-notices.txt",
        "redu-windows-x64.exe redu-windows-x64.exe.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
  ] as const

  it("macOS release attach follows the publish input", async () => {
    const workflow = await readFile(
      join(repoRoot, ".github/workflows/macos-arm64-release.yml"),
      "utf8",
    )

    assert.match(
      workflow,
      /workflow_dispatch:[\s\S]*publish:[\s\S]*default: false/,
    )
    assert.match(workflow, /workflow_call:[\s\S]*publish:[\s\S]*default: true/)
    assert.match(
      workflow,
      /release-attach:[\s\S]*if: \$\{\{ inputs\.publish \}\}/,
    )
  })

  for (const expectation of workflowExpectations) {
    it(`${expectation.file} runs and uploads scoped notice manifests`, async () => {
      const workflow = await readFile(join(repoRoot, expectation.file), "utf8")
      for (const snippet of expectation.snippets) {
        assert.ok(workflow.includes(snippet), `missing ${snippet}`)
      }
      assert.doesNotMatch(workflow, /--metafile/)
      assert.doesNotMatch(workflow, /--bun-metafile/)
      assert.doesNotMatch(workflow, /--desktop-bundle-manifest/)
      assert.doesNotMatch(workflow, /path: redu-[^\n*]*\*/)
    })
  }

  it("installer scripts download and install CLI notice sidecars", async () => {
    const shellInstaller = await readFile(
      join(repoRoot, "scripts/install-cli.sh"),
      "utf8",
    )
    const powershellInstaller = await readFile(
      join(repoRoot, "scripts/install-cli.ps1"),
      "utf8",
    )

    assert.match(shellInstaller, /third-party-notices\.txt/)
    assert.match(shellInstaller, /notice_asset/)
    assert.match(shellInstaller, /checksum_for_asset "\$notice_asset"/)
    assert.match(powershellInstaller, /third-party-notices\.txt/)
    assert.match(powershellInstaller, /\$noticeAsset/)
    assert.match(powershellInstaller, /Resolve-ChecksumEntry[\s\S]*noticeAsset/)
  })
})
