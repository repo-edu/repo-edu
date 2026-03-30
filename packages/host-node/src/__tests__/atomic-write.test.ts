import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { createWriteQueue, writeTextFileAtomic } from "../index.js"

describe("writeTextFileAtomic", () => {
  it("replaces existing file content", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const targetPath = join(root, "app-settings.json")

    await writeFile(targetPath, '{"theme":"light"}', "utf8")
    await writeTextFileAtomic(targetPath, '{"theme":"dark"}')

    const saved = await readFile(targetPath, "utf8")
    assert.equal(saved, '{"theme":"dark"}')
  })

  it("cleans up temporary files when rename fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-edu-host-node-"))
    const targetPath = join(root, "app-settings.json")

    await mkdir(targetPath)
    const beforeEntries = await readdir(root)

    await assert.rejects(writeTextFileAtomic(targetPath, '{"theme":"dark"}'))

    const afterEntries = await readdir(root)
    assert.deepStrictEqual(afterEntries.sort(), beforeEntries.sort())
  })
})

describe("createWriteQueue", () => {
  it("runs queued tasks sequentially", async () => {
    const enqueue = createWriteQueue()
    const events: string[] = []
    let releaseFirst = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = enqueue(async () => {
      events.push("first-start")
      await firstGate
      events.push("first-end")
      return 1
    })
    const second = enqueue(async () => {
      events.push("second-start")
      events.push("second-end")
      return 2
    })

    await Promise.resolve()
    assert.deepStrictEqual(events, ["first-start"])

    releaseFirst()

    assert.equal(await first, 1)
    assert.equal(await second, 2)
    assert.deepStrictEqual(events, [
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ])
  })

  it("continues queue processing after a rejected task", async () => {
    const enqueue = createWriteQueue()

    await assert.rejects(
      enqueue(async () => {
        throw new Error("first failed")
      }),
      /first failed/,
    )

    const value = await enqueue(async () => 7)
    assert.equal(value, 7)
  })
})
