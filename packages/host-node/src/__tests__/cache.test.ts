import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { createSqliteCache, openCacheDatabase } from "../cache/index.js"

describe("createSqliteCache", () => {
  it("treats corrupted compressed payloads as cache misses", () => {
    const dir = mkdtempSync(join(tmpdir(), "repo-edu-cache-test-"))
    const dbPath = join(dir, "cache.db")

    const handle = openCacheDatabase({ dbPath })
    const cache = createSqliteCache({
      handle,
      table: "test_cache",
      maxBytes: 1024 * 1024,
    })

    try {
      cache.set("broken", Uint8Array.from([1, 2, 3]))
      handle.db
        .prepare(
          "UPDATE test_cache SET payload = ?, size_bytes = ? WHERE key = ?",
        )
        .run(Buffer.from("not-gzip"), 8, "broken")

      const value = cache.get("broken")
      assert.equal(value, undefined)
      assert.deepEqual(cache.stats(), { sizeBytes: 0, entryCount: 0 })
    } finally {
      cache.close()
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not throw from getMany when one row is corrupted", () => {
    const dir = mkdtempSync(join(tmpdir(), "repo-edu-cache-test-"))
    const dbPath = join(dir, "cache.db")

    const handle = openCacheDatabase({ dbPath })
    const cache = createSqliteCache({
      handle,
      table: "test_cache",
      maxBytes: 1024 * 1024,
    })

    try {
      cache.set("ok", Uint8Array.from([7, 8]))
      cache.set("broken", Uint8Array.from([1, 2, 3]))
      handle.db
        .prepare(
          "UPDATE test_cache SET payload = ?, size_bytes = ? WHERE key = ?",
        )
        .run(Buffer.from("not-gzip"), 8, "broken")

      const [ok, broken] = cache.getMany(["ok", "broken"])
      assert.deepEqual(ok?.bytes, Uint8Array.from([7, 8]))
      assert.equal(broken, undefined)
      const stats = cache.stats()
      assert.equal(stats.entryCount, 1)
      assert.ok(stats.sizeBytes > 0)
    } finally {
      cache.close()
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("enforces a zero-byte budget even for freshly written keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "repo-edu-cache-test-"))
    const dbPath = join(dir, "cache.db")

    const handle = openCacheDatabase({ dbPath })
    const cache = createSqliteCache({
      handle,
      table: "test_cache",
      maxBytes: 0,
      compress: false,
    })

    try {
      cache.setMany([
        { key: "a", bytes: Uint8Array.from([1]) },
        { key: "b", bytes: Uint8Array.from([2]) },
      ])

      assert.deepEqual(cache.stats(), { sizeBytes: 0, entryCount: 0 })
      assert.equal(cache.get("a"), undefined)
      assert.equal(cache.get("b"), undefined)
    } finally {
      cache.close()
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("rotates the cache file when user_version differs", () => {
    const dir = mkdtempSync(join(tmpdir(), "repo-edu-cache-rotate-"))
    const dbPath = join(dir, "cache.db")

    try {
      const deleted = new Set<string>()
      const handle = openCacheDatabase({
        dbPath,
        deleteFile: (path) => {
          deleted.add(path)
        },
      })
      handle.db.exec("PRAGMA user_version = 999")
      handle.close()

      writeFileSync(`${dbPath}-wal`, "")
      writeFileSync(`${dbPath}-shm`, "")

      const next = openCacheDatabase({
        dbPath,
        deleteFile: (path) => {
          deleted.add(path)
          if (existsSync(path)) {
            rmSync(path, { force: true })
          }
        },
      })

      assert.ok(
        deleted.has(dbPath),
        "Expected the mismatched db file to be marked for deletion.",
      )
      assert.ok(
        deleted.has(`${dbPath}-wal`),
        "Expected the WAL sidecar to be marked for deletion.",
      )
      assert.ok(
        deleted.has(`${dbPath}-shm`),
        "Expected the SHM sidecar to be marked for deletion.",
      )

      const versionRow = next.db.prepare("PRAGMA user_version").get() as {
        user_version: number
      }
      assert.equal(
        Number(versionRow.user_version),
        3,
        "Rotated DB should carry the current user_version.",
      )
      next.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
