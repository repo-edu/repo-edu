import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { packageKey, resolveRepoRelativePath } from "./license-gate/shared.js"
import { applyPackageInternalAssetRules } from "./license-gate/sub-assets.js"
import {
  assertDesktopBundleInputsCovered,
  classifyLicenseExpression,
  enumeratePackageClosureFromList,
  extractRipgrepVersion,
  formatNoticeManifest,
  manifestFileName,
  narrowCliClosureWithBunMetafile,
  noticeSidecarName,
  type PnpmListNode,
  parseDotslashManifest,
  type ReleasePlatform,
  readRequiredTextFiles,
  resolveCliRuntimePackageSubjects,
  resolveDesktopRuntimePackageSubjects,
  runLicenseGate,
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
  },
): Promise<string> {
  const packagePath = join(root, path)
  await mkdir(packagePath, { recursive: true })
  await writeFile(
    join(packagePath, "package.json"),
    JSON.stringify({ license: "MIT", ...pkg }, null, 2),
    "utf8",
  )
  await writeFile(join(packagePath, "index.js"), "export {}\n", "utf8")
  return packagePath
}

describe("license policy", () => {
  it("allows permissive SPDX expressions through Blue Oak and fails closed otherwise", () => {
    assert.equal(classifyLicenseExpression("MIT").ok, true)
    assert.equal(classifyLicenseExpression("GPL-2.0-only OR MIT").ok, true)

    const copyleft = classifyLicenseExpression("GPL-2.0-only AND MIT")
    assert.equal(copyleft.ok, false)
    assert.match(copyleft.reason, /copyleft/)

    const unknown = classifyLicenseExpression("MIT-0 OR Not-A-License")
    assert.equal(unknown.ok, false)
    assert.match(unknown.reason, /invalid|absent/)

    const nonSpdx = classifyLicenseExpression("SEE LICENSE IN LICENSE.md")
    assert.equal(nonSpdx.ok, false)
    assert.match(nonSpdx.reason, /non-SPDX/)
  })
})

describe("package closure enumeration", () => {
  it("uses recursive dependencies, deduped sources, alias metadata, and skips absent optional nodes", async () => {
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
      const rightPath = await writePackage(root, "node_modules/right", {
        name: "right",
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
      const installedOptionalPath = await writePackage(
        root,
        "node_modules/optional-installed",
        {
          name: "optional-installed",
          version: "4.0.0",
        },
      )
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
                name: "wrong-child-name",
                version: "2.0.0",
                path: sharedPath,
                dependencies: {},
              },
            },
          },
          right: {
            version: "1.0.0",
            path: rightPath,
            dependencies: {
              shared: {
                version: "2.0.0",
                path: sharedPath,
                deduped: true,
                dedupedDependenciesCount: 1,
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
          "optional-installed": {
            version: "4.0.0",
            path: installedOptionalPath,
          },
        },
        unsavedDependencies: {
          "@repo-edu/claude-coder": {
            version: "link:../../packages/claude-coder",
            path: claudeCoderPath,
          },
        },
      }

      const closure = enumeratePackageClosureFromList(list, { repoRoot: root })
      assert.deepEqual(
        closure.firstPartyPackages.map((pkg) => pkg.packageName).sort(),
        ["@repo-edu/application", "@repo-edu/domain"],
      )
      assert.deepEqual(
        closure.externalPackages.map((pkg) => pkg.reachedName).sort(),
        ["alias-package", "left", "optional-installed", "right", "shared"],
      )
      assert.equal(
        closure.externalPackages.find(
          (pkg) => pkg.reachedName === "alias-package",
        )?.packageName,
        "real-package",
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("fails closed when a deduped dependency has no equivalent source", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const packagePath = await writePackage(root, "node_modules/shared", {
        name: "shared",
        version: "1.0.0",
      })
      const list: PnpmListNode = {
        dependencies: {
          shared: {
            version: "1.0.0",
            path: packagePath,
            deduped: true,
            dedupedDependenciesCount: 1,
          },
        },
      }

      assert.throws(
        () => enumeratePackageClosureFromList(list, { repoRoot: root }),
        /deduped/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})

describe("Bun metafile narrowing", () => {
  it("keeps only packages whose files appear in the metafile", () => {
    const closure = {
      firstPartyPackages: [
        {
          reachedName: "@repo-edu/application",
          packageName: "@repo-edu/application",
          version: "1.0.0",
          packagePath: "/repo/packages/application",
          firstParty: true,
          path: ["@repo-edu/application"],
        },
      ],
      externalPackages: [
        {
          reachedName: "commander",
          packageName: "commander",
          version: "14.0.3",
          packagePath: "/repo/node_modules/commander",
          firstParty: false,
          path: ["commander"],
        },
        {
          reachedName: "unused",
          packageName: "unused",
          version: "1.0.0",
          packagePath: "/repo/node_modules/unused",
          firstParty: false,
          path: ["unused"],
        },
      ],
    }

    const narrowed = narrowCliClosureWithBunMetafile(closure, {
      inputs: {
        "/repo/packages/application/src/index.ts": {},
        "/repo/node_modules/commander/index.js": {},
      },
      outputs: {
        redu: {
          imports: [{ path: "node:fs", external: true }],
        },
      },
    })

    assert.deepEqual(
      narrowed.firstPartyPackages.map((pkg) => pkg.packageName),
      ["@repo-edu/application"],
    )
    assert.deepEqual(
      narrowed.externalPackages.map((pkg) => pkg.packageName),
      ["commander"],
    )
  })

  it("fails closed on unresolved external package imports", () => {
    assert.throws(
      () =>
        narrowCliClosureWithBunMetafile(
          { firstPartyPackages: [], externalPackages: [] },
          {
            outputs: {
              redu: { imports: [{ path: "opaque", external: true }] },
            },
          },
        ),
      /external package imports/,
    )
  })

  it("fails closed when a known package is externalized instead of bundled", () => {
    assert.throws(
      () =>
        narrowCliClosureWithBunMetafile(
          {
            firstPartyPackages: [],
            externalPackages: [
              {
                reachedName: "commander",
                packageName: "commander",
                version: "14.0.3",
                packagePath: "/repo/node_modules/commander",
                firstParty: false,
                path: ["commander"],
              },
            ],
          },
          {
            outputs: {
              redu: { imports: [{ path: "commander", external: true }] },
            },
          },
        ),
      /external package imports/,
    )
  })

  it("fails closed when the metafile has no bundled file inputs", () => {
    assert.throws(
      () =>
        narrowCliClosureWithBunMetafile(
          { firstPartyPackages: [], externalPackages: [] },
          { inputs: {}, outputs: {} },
        ),
      /no bundled file inputs/,
    )
  })

  it("fails closed on package inputs outside the release closure", () => {
    assert.throws(
      () =>
        narrowCliClosureWithBunMetafile(
          {
            firstPartyPackages: [],
            externalPackages: [
              {
                reachedName: "commander",
                packageName: "commander",
                version: "14.0.3",
                packagePath: "/repo/node_modules/commander",
                firstParty: false,
                path: ["commander"],
              },
            ],
          },
          {
            inputs: {
              "/repo/apps/cli/src/main.ts": {},
              "/repo/node_modules/dev-only/index.js": {},
            },
            outputs: {},
          },
          {
            repoRoot: "/repo",
            appSourceDirectories: ["/repo/apps/cli"],
          },
        ),
      /outside the release closure/,
    )
  })
})

describe("desktop bundle input coverage", () => {
  it("allows app sources and reached packages", () => {
    assert.doesNotThrow(() =>
      assertDesktopBundleInputsCovered(
        {
          firstPartyPackages: [
            {
              reachedName: "@repo-edu/application",
              packageName: "@repo-edu/application",
              version: "1.0.0",
              packagePath: "/repo/packages/application",
              firstParty: true,
              path: ["@repo-edu/application"],
            },
          ],
          externalPackages: [
            {
              reachedName: "commander",
              packageName: "commander",
              version: "14.0.3",
              packagePath: "/repo/node_modules/commander",
              firstParty: false,
              path: ["commander"],
            },
          ],
        },
        {
          version: 1,
          targets: {
            main: {
              externalImports: ["commander/subpath", "electron", "node:fs"],
              inputs: [
                "/repo/apps/desktop/src/main.ts",
                "/repo/packages/application/src/index.ts",
                "/repo/node_modules/commander/index.js?commonjs",
              ],
            },
          },
        },
        {
          repoRoot: "/repo",
          appSourceDirectories: ["/repo/apps/desktop"],
        },
      ),
    )
  })

  it("fails closed on external package imports outside the release closure", () => {
    assert.throws(
      () =>
        assertDesktopBundleInputsCovered(
          { firstPartyPackages: [], externalPackages: [] },
          {
            version: 1,
            targets: {
              main: {
                externalImports: ["dev-only-package"],
                inputs: ["/repo/apps/desktop/src/main.ts"],
              },
            },
          },
          {
            repoRoot: "/repo",
            appSourceDirectories: ["/repo/apps/desktop"],
          },
        ),
      /external package imports outside the release closure/,
    )
  })

  it("fails closed on bundled package inputs outside the release closure", () => {
    assert.throws(
      () =>
        assertDesktopBundleInputsCovered(
          { firstPartyPackages: [], externalPackages: [] },
          {
            version: 1,
            targets: {
              main: {
                inputs: [
                  "/repo/apps/desktop/src/main.ts",
                  "/repo/packages/claude-coder/src/index.ts",
                ],
              },
            },
          },
          {
            repoRoot: "/repo",
            appSourceDirectories: ["/repo/apps/desktop"],
          },
        ),
      /outside the release closure/,
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

describe("runtime package resolution", () => {
  it("resolves release runtime subjects through their owning package roots", () => {
    const platform = currentReleasePlatform()
    if (!platform) {
      return
    }

    const desktopSubjects = resolveDesktopRuntimePackageSubjects(
      repoRoot,
      desktopTargetsForPlatform(platform),
    )
    assert.deepEqual(
      desktopSubjects
        .map((subject) => subject.packageName)
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

    const cliSubjects = resolveCliRuntimePackageSubjects(repoRoot, platform)
    assert.equal(cliSubjects[0]?.packageName, "bun")
    assert.match(cliSubjects[1]?.packageName ?? "", /^@oven\/bun-/)
  })

  it("allows the CLI gate to include Bun runtime package executables", async () => {
    const platform = currentReleasePlatform()
    if (!platform) {
      return
    }

    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    const metafilePath = join(root, "redu.metafile.json")
    const manifestPath = join(root, "redu.third-party-notices.txt")
    try {
      await writeFile(
        metafilePath,
        JSON.stringify({
          inputs: {
            [join(repoRoot, "apps/cli/src/main.ts")]: {},
            [join(
              repoRoot,
              "packages/tree-sitter-grammar-assets/src/index.ts",
            )]: {},
          },
          outputs: {},
        }),
        "utf8",
      )

      await runLicenseGate({
        app: "cli",
        platform,
        artifactTargets: ["binary"],
        bunMetafile: metafilePath,
        manifestOut: manifestPath,
      })

      const manifest = await readFile(manifestPath, "utf8")
      assert.match(manifest, /Bun compiled CLI runtime/)
      assert.match(manifest, /Bun package-manager runtime executable/)
      assert.match(manifest, /Bun compiled CLI platform runtime/)
      assert.match(manifest, /tokenizer grammar/)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})

describe("required notice files", () => {
  it("fails closed when an explicit nested notice file is absent or empty", async () => {
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

describe("package internal asset rules", () => {
  it("adds explicit Anthropic SDK vendored notices and fails unknown _vendor surfaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const anthropicPath = await writePackage(
        root,
        "node_modules/@anthropic-ai/sdk",
        {
          name: "@anthropic-ai/sdk",
          version: "0.100.1",
        },
      )
      await mkdir(join(anthropicPath, "src/internal/qs"), { recursive: true })
      await mkdir(join(anthropicPath, "src/_vendor/partial-json-parser"), {
        recursive: true,
      })
      await mkdir(join(anthropicPath, "_vendor/partial-json-parser"), {
        recursive: true,
      })
      await writeFile(
        join(anthropicPath, "src/internal/qs/LICENSE.md"),
        "neoqs license text\n",
        "utf8",
      )
      await writeFile(
        join(anthropicPath, "src/_vendor/partial-json-parser/README.md"),
        "Vendored from https://www.npmjs.com/package/partial-json-parser\n",
        "utf8",
      )
      await writeFile(
        join(anthropicPath, "_vendor/partial-json-parser/parser.mjs"),
        "export {}\n",
        "utf8",
      )

      const packageExtraText = new Map<string, string[]>()
      await applyPackageInternalAssetRules({
        directSubjects: [],
        packageExtraText,
        packageSubjects: [
          {
            reachedName: "@anthropic-ai/sdk",
            packageName: "@anthropic-ai/sdk",
            version: "0.100.1",
            packagePath: anthropicPath,
            firstParty: false,
            kind: "package",
            path: ["@anthropic-ai/sdk"],
            source: "test",
          },
        ],
        platform: "linux-x64",
      })

      const anthropicNoticeText =
        packageExtraText
          .get(packageKey("@anthropic-ai/sdk", "0.100.1", anthropicPath))
          ?.join("\n") ?? ""
      assert.match(anthropicNoticeText, /neoqs license text/)
      assert.match(anthropicNoticeText, /partial-json-parser vendored/)

      const unknownPath = await writePackage(root, "node_modules/unknown", {
        name: "unknown",
        version: "1.0.0",
      })
      await mkdir(join(unknownPath, "_vendor/lib"), { recursive: true })
      await writeFile(join(unknownPath, "_vendor/lib/index.js"), "\n", "utf8")

      await assert.rejects(
        () =>
          applyPackageInternalAssetRules({
            directSubjects: [],
            packageExtraText: new Map(),
            packageSubjects: [
              {
                reachedName: "unknown",
                packageName: "unknown",
                version: "1.0.0",
                packagePath: unknownPath,
                firstParty: false,
                kind: "package",
                path: ["unknown"],
                source: "test",
              },
            ],
            platform: "linux-x64",
          }),
        /vendored sub-assets/,
      )
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it("requires every tRPC vendored surface to have explicit notice coverage", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-license-test-"))
    try {
      const trpcPath = await writePackage(root, "node_modules/@trpc/server", {
        name: "@trpc/server",
        version: "11.15.0",
      })
      await mkdir(join(trpcPath, "src/vendor/cookie-es/set-cookie"), {
        recursive: true,
      })
      await mkdir(join(trpcPath, "src/vendor/standard-schema-v1"), {
        recursive: true,
      })
      await mkdir(join(trpcPath, "src/vendor/unpromise"), { recursive: true })
      await writeFile(
        join(trpcPath, "src/vendor/cookie-es/set-cookie/split.ts"),
        "export {}\n",
        "utf8",
      )
      await writeFile(
        join(trpcPath, "src/vendor/is-plain-object.ts"),
        "export {}\n",
        "utf8",
      )
      await writeFile(
        join(trpcPath, "src/vendor/standard-schema-v1/spec.ts"),
        "export {}\n",
        "utf8",
      )
      await writeFile(
        join(trpcPath, "src/vendor/unpromise/ATTRIBUTION.txt"),
        "unpromise attribution\n",
        "utf8",
      )
      await writeFile(
        join(trpcPath, "src/vendor/unpromise/LICENSE"),
        "unpromise license\n",
        "utf8",
      )

      const packageExtraText = new Map<string, string[]>()
      await applyPackageInternalAssetRules({
        directSubjects: [],
        packageExtraText,
        packageSubjects: [
          {
            reachedName: "@trpc/server",
            packageName: "@trpc/server",
            version: "11.15.0",
            packagePath: trpcPath,
            firstParty: false,
            kind: "package",
            path: ["@trpc/server"],
            source: "test",
          },
        ],
        platform: "linux-x64",
      })

      const trpcNoticeText =
        packageExtraText
          .get(packageKey("@trpc/server", "11.15.0", trpcPath))
          ?.join("\n") ?? ""
      assert.match(trpcNoticeText, /unpromise license/)
      assert.match(trpcNoticeText, /cookie-es vendored by @trpc\/server/)
      assert.match(trpcNoticeText, /is-plain-object vendored by @trpc\/server/)
      assert.match(trpcNoticeText, /standard-schema vendored by @trpc\/server/)

      await mkdir(join(trpcPath, "src/vendor/new-vendor"), {
        recursive: true,
      })
      await writeFile(
        join(trpcPath, "src/vendor/new-vendor/index.ts"),
        "export {}\n",
        "utf8",
      )

      await assert.rejects(
        () =>
          applyPackageInternalAssetRules({
            directSubjects: [],
            packageExtraText: new Map(),
            packageSubjects: [
              {
                reachedName: "@trpc/server",
                packageName: "@trpc/server",
                version: "11.15.0",
                packagePath: trpcPath,
                firstParty: false,
                kind: "package",
                path: ["@trpc/server"],
                source: "test",
              },
            ],
            platform: "linux-x64",
          }),
        /new-vendor/,
      )
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

  it("formats first-party coverage, runtime decisions, and notice entries", () => {
    const manifest = formatNoticeManifest({
      app: "desktop",
      platform: "linux-x64",
      artifactTargets: ["AppImage", "deb"],
      firstPartyPackages: [
        {
          reachedName: "@repo-edu/domain",
          packageName: "@repo-edu/domain",
          version: "1.0.0",
          packagePath: "/repo/packages/domain",
          firstParty: true,
          path: ["@repo-edu/domain"],
        },
      ],
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

    assert.match(manifest, /@repo-edu\/domain@1.0.0/)
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

describe("release workflow wiring", () => {
  const workflowExpectations = [
    {
      file: ".github/workflows/macos-arm64-release.yml",
      snippets: [
        "--app desktop --platform darwin-arm64 --artifact-targets dmg,zip",
        "--desktop-bundle-manifest apps/desktop/out/license-gate-bundle-inputs.json",
        "--metafile=redu-darwin-arm64.metafile.json",
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
        "--desktop-bundle-manifest apps/desktop/out/license-gate-bundle-inputs.json",
        "--metafile=redu-linux-arm64.metafile.json",
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
        "--desktop-bundle-manifest apps/desktop/out/license-gate-bundle-inputs.json",
        "--metafile=redu-windows-arm64.metafile.json",
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
        "--desktop-bundle-manifest apps/desktop/out/license-gate-bundle-inputs.json",
        "--metafile=redu-windows-arm64.metafile.json",
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
        "--desktop-bundle-manifest apps/desktop/out/license-gate-bundle-inputs.json",
        "--metafile=redu-linux-x64.metafile.json",
        "--metafile=redu-windows-x64.metafile.json",
        "redu-linux-x64.third-party-notices.txt",
        "redu-windows-x64.exe.third-party-notices.txt",
        "redu-linux-x64 redu-linux-x64.third-party-notices.txt",
        "redu-windows-x64.exe redu-windows-x64.exe.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
  ] as const

  for (const expectation of workflowExpectations) {
    it(`${expectation.file} runs and uploads scoped notice manifests`, async () => {
      const workflow = await readFile(join(repoRoot, expectation.file), "utf8")
      for (const snippet of expectation.snippets) {
        assert.ok(workflow.includes(snippet), `missing ${snippet}`)
      }
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
