import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

describe("release workflow wiring", () => {
  function extractWorkflowJob(workflow: string, jobName: string): string {
    const match = new RegExp(
      `\\n  ${jobName}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:\\n|\\n$)`,
    ).exec(workflow)
    assert.ok(match, `missing workflow job ${jobName}`)
    return match[0]
  }

  function extractWorkflowStep(workflow: string, stepName: string): string {
    const match = new RegExp(
      `\\n      - name: ${stepName}\\n([\\s\\S]*?)(?=\\n      - name: |\\n  [a-zA-Z0-9_-]+:|\\n$)`,
    ).exec(workflow)
    assert.ok(match, `missing workflow step ${stepName}`)
    return match[0]
  }

  it("uses the root packageManager as the only pnpm version authority", async () => {
    const rootPackageJson = JSON.parse(
      await readFile(join(repoRoot, "package.json"), "utf8"),
    ) as { packageManager?: unknown }
    const setupAction = await readFile(
      join(repoRoot, ".github/actions/setup/action.yml"),
      "utf8",
    )

    assert.equal(rootPackageJson.packageManager, "pnpm@11.6.0")
    assert.match(setupAction, /uses: pnpm\/action-setup@v\d+/)
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

  it("Linux arm64 release dispatches publish only existing release tags", async () => {
    const workflow = await readFile(
      join(repoRoot, ".github/workflows/linux-arm64-release.yml"),
      "utf8",
    )
    const releaseAttach = extractWorkflowJob(workflow, "release-attach")

    assert.match(workflow, /workflow_dispatch:[\s\S]*tag:[\s\S]*required: true/)
    assert.doesNotMatch(workflow, /inputs\.ref/)
    assert.doesNotMatch(workflow, /github\.ref/)
    assert.match(releaseAttach, /tag_name: \$\{\{ inputs\.tag \}\}/)
  })

  it("Linux desktop release workflows build and upload only deb artifacts", async () => {
    for (const expectation of [
      {
        file: ".github/workflows/linux-arm64-release.yml",
        metadataPattern: /apps\/desktop\/release\/\*-linux-arm64\.yml/,
      },
      {
        file: ".github/workflows/linux-x64-release.yml",
        metadataPattern: /apps\/desktop\/release\/\*-linux\.yml/,
      },
    ] as const) {
      const workflow = await readFile(join(repoRoot, expectation.file), "utf8")
      const packageStep = extractWorkflowStep(workflow, "Package")
      const uploadStep = extractWorkflowStep(workflow, "Upload artifacts")

      assert.match(packageStep, /--linux deb/)
      assert.doesNotMatch(packageStep, /AppImage/)
      assert.doesNotMatch(workflow, /linux-feed-prune/)
      assert.match(uploadStep, /apps\/desktop\/release\/\*\.deb/)
      assert.match(uploadStep, expectation.metadataPattern)
      assert.doesNotMatch(uploadStep, /apps\/desktop\/release\/\*\.AppImage/)
      assert.doesNotMatch(uploadStep, /apps\/desktop\/release\/\*\.blockmap/)
    }
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
        "--app desktop --platform linux-arm64 --artifact-targets deb",
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
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/linux-x64-release.yml",
      snippets: [
        "--app desktop --platform linux-x64 --artifact-targets deb",
        "--app cli --platform linux-x64",
        "redu-linux-x64.third-party-notices.txt",
        "redu-linux-x64 redu-linux-x64.third-party-notices.txt",
        "apps/desktop/release-notices/*.txt",
      ],
    },
    {
      file: ".github/workflows/windows-x64-release.yml",
      snippets: [
        "--app desktop --platform windows-x64 --artifact-targets nsis",
        "apps/desktop/release-notices/*.txt",
      ],
    },
  ] as const

  it("macOS release jobs use release-owned signing preparation and cleanup", async () => {
    const workflow = await readFile(
      join(repoRoot, ".github/workflows/macos-arm64-release.yml"),
      "utf8",
    )

    assert.match(
      workflow,
      /MACOS_SIGNING_SESSION_FILE: repo-edu-desktop-macos-signing-session\.json/,
    )
    assert.match(
      workflow,
      /MACOS_SIGNING_SESSION_FILE: repo-edu-cli-macos-signing-session\.json/,
    )
    assert.equal(
      Array.from(
        workflow.matchAll(
          /--manifest "\$RUNNER_TEMP\/\$MACOS_SIGNING_SESSION_FILE"/g,
        ),
      ).length,
      4,
    )
    assert.equal(
      Array.from(workflow.matchAll(/macos-signing:prepare/g)).length,
      2,
    )
    assert.equal(
      Array.from(workflow.matchAll(/macos-signing:cleanup/g)).length,
      2,
    )
    assert.equal(Array.from(workflow.matchAll(/if: always\(\)/g)).length, 2)

    const packageStep = extractWorkflowStep(workflow, "Package")
    assert.match(packageStep, /electron-builder/)
    assert.doesNotMatch(packageStep, /CSC_LINK/)
    assert.doesNotMatch(packageStep, /CSC_KEY_PASSWORD/)
    assert.doesNotMatch(packageStep, /APPLE_API_KEY_BASE64/)

    const signStep = extractWorkflowStep(workflow, "Sign and notarize")
    assert.match(
      signStep,
      /codesign --force --options runtime --sign "\$MACOS_SIGNING_IDENTITY"/,
    )
    assert.match(signStep, /--key "\$APPLE_API_KEY"/)
    assert.doesNotMatch(signStep, /security /)
    assert.doesNotMatch(signStep, /base64 --decode/)
    assert.doesNotMatch(signStep, /CSC_LINK/)
    assert.doesNotMatch(signStep, /CSC_KEY_PASSWORD/)
  })

  it("Windows release workflows publish unsigned NSIS without CLI artifacts", async () => {
    for (const file of [
      ".github/workflows/windows-arm64-release.yml",
      ".github/workflows/windows-x64-release.yml",
    ] as const) {
      const workflow = await readFile(join(repoRoot, file), "utf8")
      const windowsPackageJob = extractWorkflowJob(
        workflow,
        "desktop-package-windows",
      )

      assert.match(windowsPackageJob, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/)
      assert.doesNotMatch(workflow, /secrets-preflight/)
      assert.doesNotMatch(workflow, /WIN_CSC_LINK/)
      assert.doesNotMatch(workflow, /WIN_CSC_KEY_PASSWORD/)
      assert.doesNotMatch(workflow, /cli-build-windows/)
      assert.doesNotMatch(workflow, /--app cli --platform windows/)
      assert.doesNotMatch(workflow, /redu-windows-.*\.exe/)
      assert.doesNotMatch(workflow, /install-cli\.ps1/)
    }
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

    assert.match(shellInstaller, /third-party-notices\.txt/)
    assert.match(shellInstaller, /notice_asset/)
    assert.match(shellInstaller, /checksum_for_asset "\$notice_asset"/)
  })
})
