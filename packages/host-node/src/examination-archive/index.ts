import { DatabaseSync, type StatementSync } from "node:sqlite"
import type {
  ExaminationArchiveImportSummary,
  ExaminationArchiveStoragePort,
  ExaminationArchiveStoredEntry,
} from "@repo-edu/host-runtime-contract"
import { withTransaction } from "../sqlite/transaction.js"

const ARCHIVE_USER_VERSION = 3

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
 * Opens (or creates) the examination-archive SQLite database. Unlike the
 * byte-cache, a `user_version` mismatch is a hard error — archive data is
 * not regenerable, so we refuse to silently drop or corrupt it. The first
 * released version is 1; migrations will be written when the shape changes.
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
      group_set_id         TEXT NOT NULL,
      person_id            TEXT NOT NULL,
      commit_oid           TEXT NOT NULL,
      question_count       INTEGER NOT NULL,
      excerpts_fingerprint TEXT NOT NULL,
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER NOT NULL,
      payload              TEXT NOT NULL,
      PRIMARY KEY (group_set_id, person_id, commit_oid, question_count, excerpts_fingerprint)
    );
    CREATE INDEX IF NOT EXISTS examinations_person_idx
      ON examinations(group_set_id, person_id);
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
    `SELECT group_set_id, person_id, commit_oid, question_count, excerpts_fingerprint,
            created_at, payload
       FROM examinations
      WHERE group_set_id = ?
        AND person_id = ?
        AND commit_oid = ?
        AND question_count = ?
        AND excerpts_fingerprint = ?`,
  )
  const selectAll: StatementSync = db.prepare(
    `SELECT group_set_id, person_id, commit_oid, question_count, excerpts_fingerprint,
            created_at, payload
       FROM examinations`,
  )
  const selectExisting: StatementSync = db.prepare(
    `SELECT created_at FROM examinations
      WHERE group_set_id = ?
        AND person_id = ?
        AND commit_oid = ?
        AND question_count = ?
        AND excerpts_fingerprint = ?`,
  )
  const upsert: StatementSync = db.prepare(
    `INSERT INTO examinations
       (group_set_id, person_id, commit_oid, question_count, excerpts_fingerprint,
        created_at, updated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_set_id, person_id, commit_oid, question_count, excerpts_fingerprint)
     DO UPDATE SET
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       payload = excluded.payload`,
  )

  function rowToEntry(row: {
    group_set_id: string
    person_id: string
    commit_oid: string
    question_count: number
    excerpts_fingerprint: string
    created_at: number
    payload: string
  }): ExaminationArchiveStoredEntry {
    return {
      key: {
        groupSetId: row.group_set_id,
        personId: row.person_id,
        commitOid: row.commit_oid,
        questionCount: Number(row.question_count),
        excerptsFingerprint: row.excerpts_fingerprint,
      },
      createdAtMs: Number(row.created_at),
      payloadJson: row.payload,
    }
  }

  function putEntry(entry: ExaminationArchiveStoredEntry, now: number): void {
    upsert.run(
      entry.key.groupSetId,
      entry.key.personId,
      entry.key.commitOid,
      entry.key.questionCount,
      entry.key.excerptsFingerprint,
      entry.createdAtMs,
      now,
      entry.payloadJson,
    )
  }

  return {
    get(key) {
      const row = selectOne.get(
        key.groupSetId,
        key.personId,
        key.commitOid,
        key.questionCount,
        key.excerptsFingerprint,
      ) as
        | {
            group_set_id: string
            person_id: string
            commit_oid: string
            question_count: number
            excerpts_fingerprint: string
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
        group_set_id: string
        person_id: string
        commit_oid: string
        question_count: number
        excerpts_fingerprint: string
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
          const existing = selectExisting.get(
            entry.key.groupSetId,
            entry.key.personId,
            entry.key.commitOid,
            entry.key.questionCount,
            entry.key.excerptsFingerprint,
          ) as { created_at: number } | undefined

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
