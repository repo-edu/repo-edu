import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const currentDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(currentDir, "../..")
const hostNodeRoot = join(desktopRoot, "../../packages/host-node")

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown
}

describe("desktop Linux metadata", () => {
  it("keeps the Electron desktop identity aligned with packaged Linux launchers", async () => {
    const packageJson = (await readJson(join(desktopRoot, "package.json"))) as {
      desktopName?: unknown
    }
    const builderConfig = (await readJson(
      join(desktopRoot, "electron-builder.json"),
    )) as {
      linux?: {
        executableName?: unknown
        desktop?: { entry?: { StartupWMClass?: unknown } }
      }
    }

    assert.equal(packageJson.desktopName, "repo-edu.desktop")
    assert.equal(builderConfig.linux?.executableName, "repo-edu")
    assert.equal(
      builderConfig.linux?.desktop?.entry?.StartupWMClass,
      "repo-edu",
    )
  })
})

describe("desktop Windows child-process lifetime packaging", () => {
  it("ships the fixed launcher and keeps Electron Node mode enabled", async () => {
    const packageJson = (await readJson(join(desktopRoot, "package.json"))) as {
      dependencies?: Record<string, unknown>
      scripts?: Record<string, string>
    }
    const hostNodePackageJson = (await readJson(
      join(hostNodeRoot, "package.json"),
    )) as {
      dependencies?: Record<string, unknown>
    }
    const builderConfig = (await readJson(
      join(desktopRoot, "electron-builder.json"),
    )) as {
      asarUnpack?: unknown
      electronFuses?: { runAsNode?: unknown }
      files?: unknown
      win?: { extraResources?: unknown }
    }

    assert.equal(builderConfig.electronFuses?.runAsNode, true)
    assert.deepEqual(builderConfig.asarUnpack, [
      "node_modules/koffi/**/*",
      "node_modules/@koromix/koffi-win32-*/**/*",
    ])
    const launcherResource = {
      from: "../../packages/host-node/resources/host-child-lifetime",
      to: "host-child-lifetime",
      filter: ["windows-launcher.cjs"],
    }
    assert.deepEqual(builderConfig.win?.extraResources, [launcherResource])
    assert.ok(
      Array.isArray(builderConfig.files) &&
        builderConfig.files.includes("!out/main/host-child-lifetime/**/*"),
      "the development launcher copy must not become a second packaged entry",
    )
    assert.equal(typeof packageJson.dependencies?.koffi, "string")
    assert.equal(
      packageJson.dependencies?.koffi,
      hostNodePackageJson.dependencies?.koffi,
      "the bundled desktop entry must resolve host-node's dynamic Koffi import",
    )
    await access(
      join(desktopRoot, launcherResource.from, launcherResource.filter[0]),
    )
    assert.match(
      packageJson.scripts?.["validate:runtime:prebuilt"] ?? "",
      /validate:child-lifetime/,
    )
  })
})

describe("desktop Codex SDK host packaging", () => {
  it("builds and ships the fixed Codex SDK host entry", async () => {
    const builderConfig = (await readJson(
      join(desktopRoot, "electron-builder.json"),
    )) as {
      files?: unknown
      electronFuses?: { runAsNode?: unknown }
    }
    const viteConfig = await readFile(
      join(desktopRoot, "electron.vite.config.ts"),
      "utf8",
    )

    assert.equal(builderConfig.electronFuses?.runAsNode, true)
    assert.ok(
      Array.isArray(builderConfig.files) &&
        builderConfig.files.includes("out/main/**/*"),
    )
    assert.match(viteConfig, /"codex-sdk-host": resolve\(/)
    assert.match(viteConfig, /entryFileNames: "\[name\]\.js"/)
    assert.match(
      viteConfig,
      /packages\/integrations-llm\/src\/codex\/sdk-host-entry\.ts/,
    )
  })
})
