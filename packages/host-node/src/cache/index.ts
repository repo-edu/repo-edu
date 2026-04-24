import { existsSync, unlinkSync } from "node:fs"
import { DatabaseSync, type StatementSync } from "node:sqlite"
import { gunzipSync, gzipSync } from "node:zlib"
import type {
  PersistentCache,
  PersistentCacheEntry,
  PersistentCacheSetEntry,
  PersistentCacheStats,
} from "@repo-edu/host-runtime-contract"
import { withTransaction } from "../sqlite/transaction.js"

const DB_USER_VERSION = 3
const SQLITE_MAX_VARIABLE_NUMBER = 900
const MAX_ENTRY_BYTES_DEFAULT = 50 * 1024 * 1024

export type CacheDatabaseHandle = {
  readonly db: DatabaseSync
  readonly path: string
  close(): void
}

type OpenCacheDatabaseOptions = {
  dbPath: string
  deleteFile?: (path: string) => void
}

function readPragma(db: DatabaseSync, name: string): unknown {
  const row = db.prepare(`PRAGMA ${name}`).get() as
    | Record<string, unknown>
    | undefined
  if (!row) return undefined
  return row[name]
}

function transaction<Args extends unknown[], R>(
  db: DatabaseSync,
  fn: (...args: Args) => R,
): (...args: Args) => R {
  return (...args) => withTransaction(db, () => fn(...args))
}

/**
 * Opens (or creates) the shared SQLite cache database with WAL and
 * incremental-autovacuum pragmas. A `user_version` mismatch rotates the
 * file wholesale (including WAL/SHM sidecars) — cached data is always
 * regenerable, so recreation is the intended response to a schema bump.
 */
export function openCacheDatabase(
  options: OpenCacheDatabaseOptions,
): CacheDatabaseHandle {
  const deleteFile = options.deleteFile ?? defaultDeleteFile

  let db = new DatabaseSync(options.dbPath)
  const existingVersion = Number(readPragma(db, "user_version") ?? 0)
  if (existingVersion !== 0 && existingVersion !== DB_USER_VERSION) {
    db.close()
    deleteFile(options.dbPath)
    deleteFile(`${options.dbPath}-wal`)
    deleteFile(`${options.dbPath}-shm`)
    db = new DatabaseSync(options.dbPath)
  }

  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA auto_vacuum = INCREMENTAL")
  db.exec(`PRAGMA user_version = ${DB_USER_VERSION}`)
  db.exec(
    `CREATE TABLE IF NOT EXISTS _cache_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  )

  try {
    db.exec("PRAGMA incremental_vacuum")
  } catch {
    // Not all SQLite builds honor this inline.
  }

  return {
    db,
    path: options.dbPath,
    close() {
      db.close()
    },
  }
}

function defaultDeleteFile(path: string): void {
  if (!existsSync(path)) return
  try {
    unlinkSync(path)
  } catch {
    // Best-effort: let the open fail downstream if we cannot delete.
  }
}

type CreateSqliteCacheOptions = {
  handle: CacheDatabaseHandle
  table: string
  maxBytes: number
  maxEntryBytes?: number
  compress?: boolean
}

/**
 * Creates a `PersistentCache` bound to one table on the shared handle.
 * Each call owns its table (created lazily), in-memory size counter,
 * and LRU eviction pass. Multiple caches share one `node:sqlite`
 * connection via `handle.db`.
 */
export function createSqliteCache(
  options: CreateSqliteCacheOptions,
): PersistentCache {
  const {
    handle,
    table,
    maxBytes,
    maxEntryBytes = MAX_ENTRY_BYTES_DEFAULT,
    compress = true,
  } = options

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new Error(`Invalid cache table name: ${table}`)
  }

  const db = handle.db
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      key TEXT PRIMARY KEY,
      written_at INTEGER NOT NULL,
      last_access_at INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      payload BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ${table}_last_access_idx ON ${table}(last_access_at);
  `)

  const selectSize: StatementSync = db.prepare(
    `SELECT COALESCE(SUM(size_bytes), 0) AS total, COUNT(*) AS entries FROM ${table}`,
  )
  const sizeRow = selectSize.get() as { total: number; entries: number }
  let currentSizeBytes = Number(sizeRow.total ?? 0)
  let currentEntryCount = Number(sizeRow.entries ?? 0)

  function refreshStatsFromDb() {
    const row = selectSize.get() as { total: number; entries: number }
    currentSizeBytes = Number(row.total ?? 0)
    currentEntryCount = Number(row.entries ?? 0)
  }

  const getOne = db.prepare(
    `SELECT payload, size_bytes FROM ${table} WHERE key = ?`,
  )
  const deleteOne = db.prepare(`DELETE FROM ${table} WHERE key = ?`)
  const insertOne = db.prepare(
    `INSERT INTO ${table} (key, written_at, last_access_at, size_bytes, payload)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       written_at = excluded.written_at,
       last_access_at = excluded.last_access_at,
       size_bytes = excluded.size_bytes,
       payload = excluded.payload`,
  )

  const updateTouch = db.prepare(
    `UPDATE ${table} SET last_access_at = ? WHERE key = ?`,
  )

  const touchManyTx = transaction(db, (keys: readonly string[]) => {
    const now = Date.now()
    for (const key of keys) updateTouch.run(now, key)
  })

  function decode(payload: Uint8Array): Uint8Array {
    const bytes = compress ? gunzipSync(payload) : payload
    // Normalize to a plain Uint8Array so callers never observe Buffer.
    return Uint8Array.from(bytes as unknown as ArrayLike<number>)
  }

  function encode(bytes: Uint8Array): Uint8Array {
    // Copy into an owned Buffer — `bytes` may alias a pooled ArrayBuffer.
    const raw = Buffer.from(bytes)
    return compress ? gzipSync(raw) : raw
  }

  function decodeOrPurge(
    key: string,
    payload: Uint8Array,
  ): PersistentCacheEntry | undefined {
    try {
      const bytes = decode(payload)
      updateTouch.run(Date.now(), key)
      return { bytes }
    } catch {
      if (Number(deleteOne.run(key).changes) > 0) {
        // Stored size_bytes can itself be corrupt (tests mutate it directly),
        // so re-read aggregate stats instead of subtracting an assumed delta.
        refreshStatsFromDb()
      }
      return undefined
    }
  }

  function evictIfNeeded() {
    if (currentSizeBytes <= maxBytes) return

    const candidateQuery = db.prepare(
      `SELECT key, size_bytes FROM ${table}
       ORDER BY last_access_at ASC, key ASC
       LIMIT 128`,
    )

    while (currentSizeBytes > maxBytes) {
      const batch = candidateQuery.all() as {
        key: string
        size_bytes: number
      }[]
      if (batch.length === 0) break
      const sizeBefore = currentSizeBytes
      for (const row of batch) {
        deleteOne.run(row.key)
        currentSizeBytes -= row.size_bytes
        currentEntryCount = Math.max(0, currentEntryCount - 1)
        if (currentSizeBytes <= maxBytes) break
      }
      // If the batch deleted rows but the byte counter did not move, the
      // stored size_bytes are inconsistent with the in-memory aggregate —
      // rebase from the DB so stats stay honest instead of drifting.
      if (currentSizeBytes === sizeBefore) {
        refreshStatsFromDb()
        break
      }
    }
  }

  const existingSizeQuery = db.prepare(
    `SELECT size_bytes FROM ${table} WHERE key = ?`,
  )
  const writeMany = transaction(
    db,
    (entries: PersistentCacheSetEntry[]): void => {
      const now = Date.now()
      for (const entry of entries) {
        if (entry.bytes.byteLength > maxEntryBytes) continue
        const encoded = encode(entry.bytes)
        const encodedSize = encoded.byteLength
        if (encodedSize > maxEntryBytes) continue

        const existing = existingSizeQuery.get(entry.key) as
          | { size_bytes: number }
          | undefined

        insertOne.run(entry.key, now, now, encodedSize, encoded)
        if (existing === undefined) {
          currentEntryCount += 1
          currentSizeBytes += encodedSize
        } else {
          currentSizeBytes += encodedSize - existing.size_bytes
        }
      }
    },
  )

  return {
    get(key) {
      const row = getOne.get(key) as
        | { payload: Uint8Array; size_bytes: number }
        | undefined
      if (!row) return undefined
      return decodeOrPurge(key, row.payload)
    },

    set(key, bytes) {
      this.setMany([{ key, bytes }])
    },

    getMany(keys) {
      const out: (PersistentCacheEntry | undefined)[] = new Array(keys.length)
      if (keys.length === 0) return out
      for (
        let offset = 0;
        offset < keys.length;
        offset += SQLITE_MAX_VARIABLE_NUMBER
      ) {
        const chunk = keys.slice(offset, offset + SQLITE_MAX_VARIABLE_NUMBER)
        const placeholders = chunk.map(() => "?").join(",")
        const rows = db
          .prepare(
            `SELECT key, payload FROM ${table} WHERE key IN (${placeholders})`,
          )
          .all(...chunk) as { key: string; payload: Uint8Array }[]
        const byKey = new Map<string, Uint8Array>()
        for (const row of rows) byKey.set(row.key, row.payload)
        for (let i = 0; i < chunk.length; i++) {
          const key = chunk[i]
          const payload = byKey.get(key)
          out[offset + i] = payload ? decodeOrPurge(key, payload) : undefined
        }
      }
      return out
    },

    setMany(entries) {
      if (entries.length === 0) return
      for (
        let offset = 0;
        offset < entries.length;
        offset += SQLITE_MAX_VARIABLE_NUMBER
      ) {
        writeMany(entries.slice(offset, offset + SQLITE_MAX_VARIABLE_NUMBER))
      }
      evictIfNeeded()
    },

    touch(key) {
      updateTouch.run(Date.now(), key)
    },

    touchMany(keys) {
      if (keys.length === 0) return
      touchManyTx(keys)
    },

    clear() {
      db.prepare(`DELETE FROM ${table}`).run()
      currentSizeBytes = 0
      currentEntryCount = 0
    },

    stats(): PersistentCacheStats {
      return {
        sizeBytes: currentSizeBytes,
        entryCount: currentEntryCount,
      }
    },

    close() {},
  }
}
