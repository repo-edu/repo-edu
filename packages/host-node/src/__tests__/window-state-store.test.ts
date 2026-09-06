import assert from "node:assert/strict"
import fs from "node:fs"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import {
  createNodeWindowStateStore,
  defaultNodeWindowState,
} from "../window-state-store.js"

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-window-state-"))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("createNodeWindowStateStore", () => {
  it("loads independent defaults for missing files without creating storage", async () => {
    await withRoot(async (root) => {
      const store = createNodeWindowStateStore(root)
      const first = await store.load()
      assert.deepStrictEqual(first, { width: 1180, height: 760 })
      first.width = 1
      assert.deepStrictEqual(await store.load(), defaultNodeWindowState)
      assert.deepStrictEqual(await readdir(root), [])
    })
  })

  it("loads defaults for malformed or invalid content without changing it", async () => {
    await withRoot(async (root) => {
      const directory = join(root, "settings")
      await mkdir(directory)
      const path = join(directory, "window-state.json")
      for (const content of [
        "{",
        "null",
        "[]",
        "{}",
        '{"width":"1180","height":760}',
        '{"width":1180}',
        '{"width":1e400,"height":760}',
        '{"width":1180,"height":1e400}',
      ]) {
        await writeFile(path, content)
        assert.deepStrictEqual(
          await createNodeWindowStateStore(root).load(),
          defaultNodeWindowState,
        )
        assert.equal(await readFile(path, "utf8"), content)
        assert.deepStrictEqual(await readdir(directory), ["window-state.json"])
      }
    })
  })

  it("loads defaults when the storage path cannot be read", async () => {
    await withRoot(async (root) => {
      await writeFile(join(root, "settings"), "not a directory")
      assert.deepStrictEqual(
        await createNodeWindowStateStore(root).load(),
        defaultNodeWindowState,
      )
      assert.equal(
        await readFile(join(root, "settings"), "utf8"),
        "not a directory",
      )
    })
  })

  it("rounds geometry and enforces the shell minimum dimensions on load and save", async () => {
    await withRoot(async (root) => {
      const store = createNodeWindowStateStore(root)
      await store.save({ width: 1200.6, height: 200 })
      assert.deepStrictEqual(await store.load(), { width: 1201, height: 480 })
      await writeFile(
        join(root, "settings", "window-state.json"),
        '{"width":200,"height":800.6,"ignored":true}',
      )
      assert.deepStrictEqual(await store.load(), { width: 640, height: 801 })
    })
  })

  it("replaces the complete document atomically without syncing", async (t) => {
    await withRoot(async (root) => {
      const store = createNodeWindowStateStore(root)
      await store.save({ width: 1000, height: 700 })
      const directory = join(root, "settings")
      const path = join(directory, "window-state.json")
      const previous = await readFile(path, "utf8")
      const replacement = '{\n  "width": 1400,\n  "height": 900\n}\n'
      const rename = fs.rename
      const sync = t.mock.method(fs, "fsync", () => {
        throw new Error("Window state must not sync.")
      })
      const publication = t.mock.method(
        fs,
        "rename",
        (...args: Parameters<typeof fs.rename>) => {
          const [from, to, callback] = args
          assert.equal(String(to), fs.realpathSync(path))
          assert.notEqual(String(from), String(to))
          assert.equal(fs.readFileSync(path, "utf8"), previous)
          assert.equal(fs.readFileSync(from, "utf8"), replacement)
          rename(from, to, callback)
        },
      )
      await store.save({ width: 1400, height: 900 })
      assert.equal(publication.mock.callCount(), 1)
      assert.equal(sync.mock.callCount(), 0)
      assert.equal(await readFile(path, "utf8"), replacement)
      assert.deepStrictEqual(await readdir(directory), ["window-state.json"])
      assert.deepStrictEqual(await store.load(), { width: 1400, height: 900 })
    })
  })

  it("rejects a failed publication and preserves the existing target", async () => {
    await withRoot(async (root) => {
      const directory = join(root, "settings")
      const path = join(directory, "window-state.json")
      await mkdir(path, { recursive: true })
      await writeFile(join(path, "retained"), "existing content")
      await assert.rejects(
        createNodeWindowStateStore(root).save({ width: 1400, height: 900 }),
      )
      assert.equal(
        await readFile(join(path, "retained"), "utf8"),
        "existing content",
      )
      assert.deepStrictEqual(await readdir(directory), ["window-state.json"])
    })
  })

  it("rejects invalid geometry before changing storage", async () => {
    await withRoot(async (root) => {
      const store = createNodeWindowStateStore(root)
      await store.save({ width: 1000, height: 700 })
      for (const state of [
        { width: Number.NaN, height: 700 },
        { width: 1000, height: Number.POSITIVE_INFINITY },
      ]) {
        await assert.rejects(store.save(state), /Invalid window state/)
        assert.deepStrictEqual(await store.load(), { width: 1000, height: 700 })
      }
    })
  })
})
