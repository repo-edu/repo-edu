import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import type { ExaminationArchiveStoredEntry } from "@repo-edu/host-runtime-contract"
import {
  createExaminationArchiveStorage,
  openExaminationArchiveDatabase,
} from "../index.js"

function openTempArchive() {
  const dir = mkdtempSync(join(tmpdir(), "repo-edu-archive-test-"))
  const dbPath = join(dir, "archive.db")
  const handle = openExaminationArchiveDatabase({ dbPath })
  const storage = createExaminationArchiveStorage({ handle })
  return {
    dir,
    dbPath,
    handle,
    storage,
    cleanup() {
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

function buildEntry(
  overrides: Partial<ExaminationArchiveStoredEntry> = {},
): ExaminationArchiveStoredEntry {
  return {
    key: {
      groupSetId: "gs_1",
      personId: "p_1",
      commitOid: "oid-abc",
      questionCount: 1,
      excerptsFingerprint: "fingerprint-1",
    },
    createdAtMs: 1_700_000_000_000,
    payloadJson: JSON.stringify({ sample: "payload" }),
    ...overrides,
  }
}

describe("examination archive storage (host-node)", () => {
  it("round-trips a put/get", () => {
    const ctx = openTempArchive()
    try {
      const entry = buildEntry()
      ctx.storage.put(entry)

      const got = ctx.storage.get(entry.key)
      assert.ok(got)
      assert.deepEqual(got?.key, entry.key)
      assert.equal(got?.createdAtMs, entry.createdAtMs)
      assert.equal(got?.payloadJson, entry.payloadJson)
    } finally {
      ctx.cleanup()
    }
  })

  it("exportAll returns every stored entry", () => {
    const ctx = openTempArchive()
    try {
      const a = buildEntry({
        key: {
          groupSetId: "gs_1",
          personId: "p_1",
          commitOid: "oid-a",
          questionCount: 1,
          excerptsFingerprint: "fp-a",
        },
      })
      const b = buildEntry({
        key: {
          groupSetId: "gs_1",
          personId: "p_2",
          commitOid: "oid-b",
          questionCount: 2,
          excerptsFingerprint: "fp-b",
        },
        createdAtMs: 1_700_000_000_500,
      })
      ctx.storage.put(a)
      ctx.storage.put(b)

      const exported = ctx.storage.exportAll()
      assert.equal(exported.length, 2)
      const byPerson = new Map(exported.map((e) => [e.key.personId, e]))
      assert.equal(byPerson.get("p_1")?.createdAtMs, a.createdAtMs)
      assert.equal(byPerson.get("p_2")?.createdAtMs, b.createdAtMs)
    } finally {
      ctx.cleanup()
    }
  })

  it("importAll inserts new keys and updates only when incoming createdAtMs is newer", () => {
    const ctx = openTempArchive()
    try {
      const sharedKey = {
        groupSetId: "gs_1",
        personId: "p_1",
        commitOid: "oid-x",
        questionCount: 1,
        excerptsFingerprint: "fp-x",
      }
      const existing = buildEntry({
        key: sharedKey,
        createdAtMs: 1_000,
        payloadJson: JSON.stringify({ v: "old" }),
      })
      ctx.storage.put(existing)

      const summary = ctx.storage.importAll([
        // newer — should update
        buildEntry({
          key: sharedKey,
          createdAtMs: 2_000,
          payloadJson: JSON.stringify({ v: "new" }),
        }),
        // new key at later timestamp — should insert
        buildEntry({
          key: {
            groupSetId: "gs_1",
            personId: "p_2",
            commitOid: "oid-y",
            questionCount: 1,
            excerptsFingerprint: "fp-y",
          },
          createdAtMs: 5_000,
          payloadJson: JSON.stringify({ v: "fresh" }),
        }),
        // equal timestamp on a new key — still inserts
        buildEntry({
          key: {
            groupSetId: "gs_1",
            personId: "p_3",
            commitOid: "oid-z",
            questionCount: 1,
            excerptsFingerprint: "fp-z",
          },
          createdAtMs: 5_000,
        }),
      ])

      assert.equal(summary.totalInBundle, 3)
      assert.equal(summary.inserted, 2)
      assert.equal(summary.updated, 1)
      assert.equal(summary.skipped, 0)
      assert.equal(summary.rejected, 0)
      assert.equal(summary.rejections.length, 0)

      const winner = ctx.storage.get(sharedKey)
      assert.equal(winner?.createdAtMs, 2_000)
      assert.equal(winner?.payloadJson, JSON.stringify({ v: "new" }))
    } finally {
      ctx.cleanup()
    }
  })

  it("importAll skips entries older-or-equal than an existing record", () => {
    const ctx = openTempArchive()
    try {
      const key = {
        groupSetId: "gs_1",
        personId: "p_1",
        commitOid: "oid-x",
        questionCount: 1,
        excerptsFingerprint: "fp-x",
      }
      ctx.storage.put(
        buildEntry({
          key,
          createdAtMs: 2_000,
          payloadJson: JSON.stringify({ v: "kept" }),
        }),
      )

      const summary = ctx.storage.importAll([
        buildEntry({
          key,
          createdAtMs: 1_000,
          payloadJson: JSON.stringify({ v: "older" }),
        }),
        buildEntry({
          key,
          createdAtMs: 2_000,
          payloadJson: JSON.stringify({ v: "equal" }),
        }),
      ])

      assert.equal(summary.inserted, 0)
      assert.equal(summary.updated, 0)
      assert.equal(summary.skipped, 2)
      assert.equal(summary.rejected, 0)

      const winner = ctx.storage.get(key)
      assert.equal(winner?.payloadJson, JSON.stringify({ v: "kept" }))
    } finally {
      ctx.cleanup()
    }
  })

  it("refuses to open a database with an unsupported user_version", () => {
    const dir = mkdtempSync(join(tmpdir(), "repo-edu-archive-version-"))
    const dbPath = join(dir, "archive.db")
    try {
      const handle = openExaminationArchiveDatabase({ dbPath })
      handle.db.exec("PRAGMA user_version = 42")
      handle.close()

      assert.throws(
        () => openExaminationArchiveDatabase({ dbPath }),
        /unsupported user_version 42/,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("reopens an existing archive without wiping data", () => {
    const dir = mkdtempSync(join(tmpdir(), "repo-edu-archive-reopen-"))
    const dbPath = join(dir, "archive.db")
    try {
      const firstHandle = openExaminationArchiveDatabase({ dbPath })
      const firstStorage = createExaminationArchiveStorage({
        handle: firstHandle,
      })
      const entry = buildEntry()
      firstStorage.put(entry)
      firstHandle.close()

      const secondHandle = openExaminationArchiveDatabase({ dbPath })
      const secondStorage = createExaminationArchiveStorage({
        handle: secondHandle,
      })
      try {
        const got = secondStorage.get(entry.key)
        assert.equal(got?.payloadJson, entry.payloadJson)
      } finally {
        secondHandle.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
