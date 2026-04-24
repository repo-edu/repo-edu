import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PersistentCache } from "@repo-edu/host-runtime-contract"
import {
  createByteBudgetedLru,
  createLayeredCache,
  structuredJsonSerde,
} from "../cache/layered-cache.js"

function createColdStub(options: { sizeBytes: number; entryCount: number }): {
  cold: PersistentCache
  clearCalls: () => number
} {
  let clears = 0
  const cold: PersistentCache = {
    get: () => undefined,
    set: () => {},
    getMany: (keys) => keys.map(() => undefined),
    setMany: () => {},
    touch: () => {},
    touchMany: () => {},
    clear: () => {
      clears += 1
    },
    stats: () => ({
      sizeBytes: options.sizeBytes,
      entryCount: options.entryCount,
    }),
    close: () => {},
  }
  return {
    cold,
    clearCalls: () => clears,
  }
}

describe("createLayeredCache", () => {
  it("still clears the cold cache when disabled", () => {
    const { cold, clearCalls } = createColdStub({
      sizeBytes: 128,
      entryCount: 3,
    })
    const cache = createLayeredCache<string>({
      hot: createByteBudgetedLru(1024),
      cold,
      serde: structuredJsonSerde<string>(),
      disabled: true,
    })

    cache.clear()

    assert.equal(clearCalls(), 1)
  })

  it("round-trips Map and Set through the structured serde", () => {
    const serde = structuredJsonSerde<{
      tags: Set<string>
      index: Map<string, number>
      plain: { inner: Set<number> }
    }>()
    const original = {
      tags: new Set(["a", "b"]),
      index: new Map([
        ["x", 1],
        ["y", 2],
      ]),
      plain: { inner: new Set([7, 8, 9]) },
    }
    const revived = serde.fromBytes(serde.toBytes(original))
    assert.ok(revived.tags instanceof Set)
    assert.deepEqual([...revived.tags].sort(), ["a", "b"])
    assert.ok(revived.index instanceof Map)
    assert.equal(revived.index.get("x"), 1)
    assert.equal(revived.index.get("y"), 2)
    assert.ok(revived.plain.inner instanceof Set)
    assert.deepEqual([...revived.plain.inner].sort(), [7, 8, 9])
  })

  it("reports cold stats when disabled", () => {
    const { cold } = createColdStub({
      sizeBytes: 512,
      entryCount: 9,
    })
    const cache = createLayeredCache<string>({
      hot: createByteBudgetedLru(1024),
      cold,
      serde: structuredJsonSerde<string>(),
      disabled: true,
    })

    assert.deepEqual(cache.stats(), {
      hotBytes: 0,
      hotEntries: 0,
      coldBytes: 512,
      coldEntries: 9,
    })
  })
})
