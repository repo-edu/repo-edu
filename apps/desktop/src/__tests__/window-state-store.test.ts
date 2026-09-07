import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { it } from "node:test"
import {
  createNodeWindowStateStore,
  defaultNodeWindowState,
} from "@repo-edu/host-node"
import { saveDesktopWindowState } from "../window-state-store"

it("uses shared default geometry for missing, invalid and unreadable window state", async () => {
  const root = await mkdtemp(join(tmpdir(), "repo-edu-window-"))
  try {
    const store = createNodeWindowStateStore(root)
    assert.deepEqual(await store.load(), defaultNodeWindowState)
    await mkdir(join(root, "settings"))
    const path = join(root, "settings", "window-state.json")
    await writeFile(path, "{")
    assert.deepEqual(await store.load(), defaultNodeWindowState)
    await rm(path)
    await mkdir(path)
    assert.deepEqual(await store.load(), defaultNodeWindowState)
    const attempted = Promise.withResolvers<void>()
    assert.equal(
      saveDesktopWindowState(
        {
          load: store.load,
          async save(size) {
            try {
              await store.save(size)
            } finally {
              attempted.resolve()
            }
          },
        },
        [900, 700],
      ),
      undefined,
    )
    await attempted.promise
    assert.deepEqual(await store.load(), defaultNodeWindowState)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("does not wait for the last geometry write or propagate its failure", async () => {
  const pending = Promise.withResolvers<void>()
  const sizes: unknown[] = []
  const store = {
    async load() {
      return defaultNodeWindowState
    },
    save(size: unknown) {
      sizes.push(size)
      return pending.promise
    },
  }
  assert.equal(saveDesktopWindowState(store, [1000, 800]), undefined)
  assert.deepEqual(sizes, [{ width: 1000, height: 800 }])
  pending.reject(new Error("Geometry cannot be saved"))
  await new Promise<void>((resolve) => setImmediate(resolve))
})
