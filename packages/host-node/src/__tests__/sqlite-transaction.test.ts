import assert from "node:assert/strict"
import { DatabaseSync } from "node:sqlite"
import { describe, it } from "node:test"
import { withTransaction } from "../sqlite/transaction.js"

describe("withTransaction", () => {
  it("keeps the original error when SQLite already rolled the transaction back", () => {
    const db = new DatabaseSync(":memory:")
    try {
      assert.throws(
        () =>
          withTransaction(db, () => {
            // SQLite ends the transaction itself after some failures, such as
            // a full disk, before the error reaches the caller.
            db.exec("ROLLBACK")
            throw new Error("database or disk is full")
          }),
        /database or disk is full/,
      )
      assert.equal(db.isTransaction, false)
    } finally {
      db.close()
    }
  })
})
