import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const currentDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(currentDir, "../..")

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

describe("desktop Windows child-lifetime packaging", () => {
  it("ships the fixed launcher and keeps Electron Node mode enabled", async () => {
    const packageJson = (await readJson(join(desktopRoot, "package.json"))) as {
      scripts?: Record<string, string>
    }
    const builderConfig = (await readJson(
      join(desktopRoot, "electron-builder.json"),
    )) as {
      asarUnpack?: unknown
      electronFuses?: { runAsNode?: unknown }
      win?: { extraResources?: unknown }
    }

    assert.equal(builderConfig.electronFuses?.runAsNode, true)
    assert.deepEqual(builderConfig.asarUnpack, [
      "node_modules/koffi/**/*",
      "node_modules/@koromix/koffi-win32-*/**/*",
    ])
    assert.deepEqual(builderConfig.win?.extraResources, [
      {
        from: "resources/host-child-lifetime",
        to: "host-child-lifetime",
        filter: ["windows-launcher.cjs"],
      },
    ])
    assert.match(
      packageJson.scripts?.["validate:runtime:prebuilt"] ?? "",
      /validate:child-lifetime/,
    )
  })
})
