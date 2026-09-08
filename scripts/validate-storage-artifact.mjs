import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { promisify } from "node:util"

const runFile = promisify(execFile)

export async function validateStorageArtifact(artifact, host) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "repo-edu-storage-artifact-")))
  try {
    const preferencesPath = join(root, "settings", "preferences.json")
    const original = '{"storageProbeOriginal":true}\n'
    await mkdir(join(root, "settings"))
    await writeFile(preferencesPath, original)
    const { stdout } = await runFile(artifact.command, artifact.arguments ?? [], {
      env: {
        ...process.env,
        REPO_EDU_STORAGE_ROOT: root,
        REPO_EDU_STORAGE_ARTIFACT_PROBE: "1",
        REPO_EDU_PROGRAM_GATE_ARTIFACT_PROBE: "0",
      },
      timeout: 30_000,
      killSignal: "SIGKILL",
      windowsHide: true,
    })
    const reports = stdout.split(/\r?\n/).flatMap((line) => {
      try {
        const report = JSON.parse(line)
        return report?.marker === "repo-edu-storage-artifact" ? [report] : []
      } catch {
        return []
      }
    })
    assert.equal(reports.length, 1, `${artifact.label} must report one completed storage probe`)
    assert.equal(reports[0].runtime, host === "desktop" ? "electron" : "bun")
    assert.equal(reports[0].settingsReplaced, host === "desktop")

    // A separate connection observes the schema committed by the packaged adapter.
    const database = new DatabaseSync(join(root, "courses.sqlite"), { readOnly: true })
    try {
      assert.equal(database.prepare("SELECT count(*) AS count FROM courses").get().count, 0)
    } finally {
      database.close()
    }
    const preferences = await readFile(preferencesPath, "utf8")
    if (host === "desktop") {
      const value = JSON.parse(preferences)
      assert.equal(value.activeSurface.kind, "home")
      assert.equal(preferences, `${JSON.stringify(value, null, 2)}\n`)
      assert.equal(value.storageProbeOriginal, undefined)
    } else {
      assert.equal(preferences, original)
    }
    process.stdout.write(`PASS ${artifact.label} course storage${host === "desktop" ? " and atomic settings replacement" : ""}\n`)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}
