import { DatabaseSync, type StatementSync } from "node:sqlite"
import type {
  ExaminationArchiveImportSummary,
  ExaminationArchiveStoragePort,
  ExaminationArchiveStoredEntry,
} from "@repo-edu/host-runtime-contract"
import { withTransaction } from "../sqlite/transaction.js"

const ARCHIVE_USER_VERSION = 5

export type ExaminationArchiveDatabaseHandle = {
  readonly db: DatabaseSync
  readonly path: string
  close(): void
}

type OpenArchiveOptions = {
  dbPath: string
}

function readPragma(db: DatabaseSync, name: string): unknown {
  const row = db.prepare(`PRAGMA ${name}`).get() as
    | Record<string, unknown>
    | undefined
  if (!row) return undefined
  return row[name]
}

/**
 * Opens (or creates) the examination-archive SQLite database. A
 * `user_version` mismatch is a hard error; the desktop composition root owns
 * archive lifecycle for unsupported disposable local data.
 */
export function openExaminationArchiveDatabase(
  options: OpenArchiveOptions,
): ExaminationArchiveDatabaseHandle {
  const db = new DatabaseSync(options.dbPath)
  const existingVersion = Number(readPragma(db, "user_version") ?? 0)
  if (existingVersion !== 0 && existingVersion !== ARCHIVE_USER_VERSION) {
    db.close()
    throw new Error(
      `Examination archive at ${options.dbPath} has unsupported user_version ${existingVersion}; expected ${ARCHIVE_USER_VERSION}.`,
    )
  }

  db.exec("PRAGMA journal_mode = WAL")
  // Archive rows are not regenerable — cost a full fsync per commit rather
  // than risk losing LLM-generated questions on a power loss.
  db.exec("PRAGMA synchronous = FULL")
  db.exec(`PRAGMA user_version = ${ARCHIVE_USER_VERSION}`)
  db.exec(`
    CREATE TABLE IF NOT EXISTS examinations (
      storage_key TEXT PRIMARY KEY,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      payload     TEXT NOT NULL
    );
  `)

  return {
    db,
    path: options.dbPath,
    close() {
      db.close()
    },
  }
}

type CreateArchiveOptions = {
  handle: ExaminationArchiveDatabaseHandle
}

export function createExaminationArchiveStorage(
  options: CreateArchiveOptions,
): ExaminationArchiveStoragePort {
  const db = options.handle.db

  const selectOne: StatementSync = db.prepare(
    `SELECT storage_key, created_at, payload
       FROM examinations
      WHERE storage_key = ?`,
  )
  const selectAll: StatementSync = db.prepare(
    `SELECT storage_key, created_at, payload
       FROM examinations`,
  )
  const selectExisting: StatementSync = db.prepare(
    `SELECT created_at FROM examinations
      WHERE storage_key = ?`,
  )
  const upsert: StatementSync = db.prepare(
    `INSERT INTO examinations
       (storage_key, created_at, updated_at, payload)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(storage_key)
     DO UPDATE SET
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       payload = excluded.payload`,
  )

  function rowToEntry(row: {
    storage_key: string
    created_at: number
    payload: string
  }): ExaminationArchiveStoredEntry {
    return {
      storageKey: row.storage_key,
      createdAtMs: Number(row.created_at),
      payloadJson: row.payload,
    }
  }

  function putEntry(entry: ExaminationArchiveStoredEntry, now: number): void {
    upsert.run(entry.storageKey, entry.createdAtMs, now, entry.payloadJson)
  }

  return {
    get(storageKey) {
      const row = selectOne.get(storageKey) as
        | {
            storage_key: string
            created_at: number
            payload: string
          }
        | undefined
      if (!row) return undefined
      return rowToEntry(row)
    },

    put(entry) {
      putEntry(entry, Date.now())
    },

    exportAll() {
      const rows = selectAll.all() as {
        storage_key: string
        created_at: number
        payload: string
      }[]
      return rows.map(rowToEntry)
    },

    importAll(entries): ExaminationArchiveImportSummary {
      let inserted = 0
      let updated = 0
      let skipped = 0

      withTransaction(db, () => {
        const now = Date.now()
        for (const entry of entries) {
          const existing = selectExisting.get(entry.storageKey) as
            | { created_at: number }
            | undefined

          if (existing === undefined) {
            putEntry(entry, now)
            inserted += 1
          } else if (entry.createdAtMs > Number(existing.created_at)) {
            putEntry(entry, now)
            updated += 1
          } else {
            skipped += 1
          }
        }
      })

      return {
        totalInBundle: entries.length,
        inserted,
        updated,
        skipped,
        rejected: 0,
        rejections: [],
      }
    },
  }
}
