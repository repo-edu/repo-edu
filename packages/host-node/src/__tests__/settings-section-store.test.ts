import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { describe, it } from "node:test"
import {
  createNodeSettingsSectionStore,
  type NodeSettingsValidationResult,
  recoverUnsupportedCompositeSettingsFile,
} from "../settings-section-store.js"

type TestSection = {
  kind: "test-section"
  value: string
}

function validateTestSection(
  value: unknown,
): NodeSettingsValidationResult<TestSection> {
  if (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "test-section" &&
    "value" in value &&
    typeof value.value === "string"
  ) {
    return { ok: true, value: value as TestSection }
  }
  return {
    ok: false,
    issues: [{ path: "kind", message: "Expected test-section." }],
  }
}

async function withSettingsDirectory<T>(
  run: (settingsDirectory: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-settings-"))
  try {
    const settingsDirectory = join(root, "settings")
    await mkdir(settingsDirectory, { recursive: true })
    return await run(settingsDirectory)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("createNodeSettingsSectionStore", () => {
  it("backs invalid section files aside and returns recovery", async () => {
    await withSettingsDirectory(async (settingsDirectory) => {
      const store = createNodeSettingsSectionStore({
        settingsDirectory,
        fileName: "preferences.json",
        unit: "preferences",
        validate: validateTestSection,
      })
      const sectionPath = join(settingsDirectory, "preferences.json")
      await writeFile(sectionPath, '{"kind":"wrong"}', "utf8")

      const loaded = await store.load()

      assert.equal(loaded.value, null)
      assert.equal(loaded.recovery.length, 1)
      assert.equal(loaded.recovery[0]?.unit, "preferences")
      assert.equal(loaded.recovery[0]?.reason, "invalid")
      assert.match(
        basename(loaded.recovery[0]?.backupPath ?? ""),
        /^preferences\.invalid-\d+\.json$/,
      )
      assert.deepStrictEqual(await readdir(settingsDirectory), [
        basename(loaded.recovery[0]?.backupPath ?? ""),
      ])
      assert.equal(
        await readFile(loaded.recovery[0]?.backupPath ?? "", "utf8"),
        '{"kind":"wrong"}',
      )
    })
  })

  it("appends a collision suffix for unparseable backup names", async () => {
    await withSettingsDirectory(async (settingsDirectory) => {
      const originalNow = Date.now
      Date.now = () => 12345
      try {
        const store = createNodeSettingsSectionStore({
          settingsDirectory,
          fileName: "credentials.json",
          unit: "credentials",
          validate: validateTestSection,
        })
        await writeFile(
          join(settingsDirectory, "credentials.json"),
          "{",
          "utf8",
        )
        await writeFile(
          join(settingsDirectory, "credentials.unparseable-12345.json"),
          "existing",
          "utf8",
        )

        const loaded = await store.load()

        assert.equal(loaded.value, null)
        assert.deepStrictEqual(loaded.recovery, [
          {
            unit: "credentials",
            reason: "unparseable",
            backupPath: join(
              settingsDirectory,
              "credentials.unparseable-12345-1.json",
            ),
          },
        ])
      } finally {
        Date.now = originalNow
      }
    })
  })
})

describe("recoverUnsupportedCompositeSettingsFile", () => {
  it("backs unsupported app settings aside without parsing them", async () => {
    await withSettingsDirectory(async (settingsDirectory) => {
      await writeFile(
        join(settingsDirectory, "app-settings.json"),
        '{"unsupported":true}',
        "utf8",
      )

      const recovery =
        await recoverUnsupportedCompositeSettingsFile(settingsDirectory)

      assert.equal(recovery.length, 1)
      assert.equal(recovery[0]?.unit, "unsupported-composite")
      assert.equal(recovery[0]?.reason, "unsupported")
      assert.match(
        basename(recovery[0]?.backupPath ?? ""),
        /^app-settings\.unsupported-\d+\.json$/,
      )
      assert.equal(
        await readFile(recovery[0]?.backupPath ?? "", "utf8"),
        '{"unsupported":true}',
      )
    })
  })
})
