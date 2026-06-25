import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, it } from "node:test"
import { readRequiredTextFiles, resolveRepoRelativePath } from "./shared.js"

describe("shared license gate helpers", () => {
  it("resolves license gate file options relative to the repo root", () => {
    assert.equal(
      resolveRepoRelativePath("/repo", "apps/desktop/out/manifest.json"),
      resolve("/repo/apps/desktop/out/manifest.json"),
    )
    assert.equal(
      resolveRepoRelativePath("/repo", "/tmp/repo-edu-notices.txt"),
      resolve("/tmp/repo-edu-notices.txt"),
    )
  })

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
