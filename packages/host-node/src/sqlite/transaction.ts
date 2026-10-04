import type { DatabaseSync } from "node:sqlite"

/**
 * Runs `fn` inside a single SQLite transaction. On exception the transaction
 * is rolled back and the original error re-thrown; on return the transaction
 * is committed and the function's value is returned. SQLite rolls some
 * failures back itself, so an explicit rollback runs only while the
 * transaction is still open and never hides the original error. The caller
 * owns all statement preparation and execution inside `fn`.
 */
export function withTransaction<R>(db: DatabaseSync, fn: () => R): R {
  db.exec("BEGIN")
  try {
    const result = fn()
    db.exec("COMMIT")
    return result
  } catch (err) {
    if (db.isTransaction) db.exec("ROLLBACK")
    throw err
  }
}
