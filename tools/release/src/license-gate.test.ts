import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  classifyLicenseExpression,
  enumeratePackageClosureFromList,
  formatNoticeManifest,
  manifestFileName,
  narrowCliClosureWithBunMetafile,
  noticeSidecarName,
  type PnpmListNode,
  parseDotslashManifest,
} from "./license-gate.js"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

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
      /unresolved/,
    )
  })
})

describe("manifest helpers", () => {
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
})

describe("release workflow wiring", () => {
  const workflowExpectations = [
    {
      file: ".github/workflows/macos-arm64-release.yml",
      snippets: [
        "--app desktop --platform darwin-arm64 --artifact-targets dmg,zip",
        "--metafile=redu-darwin-arm64.metafile.json",
        "--app cli --platform darwin-arm64",
        "redu-darwin-arm64.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/linux-arm64-release.yml",
      snippets: [
        "--app desktop --platform linux-arm64 --artifact-targets AppImage,deb",
        "--metafile=redu-linux-arm64.metafile.json",
        "--app cli --platform linux-arm64",
        "redu-linux-arm64.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/windows-arm64-release.yml",
      snippets: [
        "--app desktop --platform windows-arm64 --artifact-targets nsis",
        "--metafile=redu-windows-arm64.metafile.json",
        "--app cli --platform windows-arm64",
        "redu-windows-arm64.exe.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/windows-arm64-no-secrets-release.yml",
      snippets: [
        "--app desktop --platform windows-arm64 --artifact-targets nsis",
        "--metafile=redu-windows-arm64.metafile.json",
        "--app cli --platform windows-arm64",
        "redu-windows-arm64.exe.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/linux-windows-x64-release.yml",
      snippets: [
        "--app desktop --platform linux-x64 --artifact-targets AppImage,deb",
        "--app desktop --platform windows-x64 --artifact-targets nsis",
        "--metafile=redu-linux-x64.metafile.json",
        "--metafile=redu-windows-x64.metafile.json",
        "redu-linux-x64.third-party-notices.txt",
        "redu-windows-x64.exe.third-party-notices.txt",
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
    assert.match(powershellInstaller, /third-party-notices\.txt/)
    assert.match(powershellInstaller, /\$noticeAsset/)
  })
})
