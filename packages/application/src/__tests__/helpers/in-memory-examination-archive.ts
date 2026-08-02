import type {
  ExaminationArchiveStoragePort,
  ExaminationArchiveStoredEntry,
} from "@repo-edu/host-runtime-contract"
import {
  createExaminationArchive,
  type ExaminationArchivePort,
} from "../../examination-workflows/archive-port.js"

function createInMemoryExaminationArchiveStorage(): ExaminationArchiveStoragePort {
  const entries = new Map<string, ExaminationArchiveStoredEntry>()
  return {
    get(storageKey) {
      return entries.get(storageKey)
    },
    put(entry) {
      entries.set(entry.storageKey, entry)
    },
    remove(storageKey) {
      entries.delete(storageKey)
    },
    exportAll() {
      return [...entries.values()]
    },
    importAll(incoming) {
      let inserted = 0
      let updated = 0
      let skipped = 0
      for (const entry of incoming) {
        const existing = entries.get(entry.storageKey)
        if (existing === undefined) {
          entries.set(entry.storageKey, entry)
          inserted += 1
        } else if (entry.createdAtMs > existing.createdAtMs) {
          entries.set(entry.storageKey, entry)
          updated += 1
        } else {
          skipped += 1
        }
      }
      return {
        totalInBundle: incoming.length,
        inserted,
        updated,
        skipped,
        rejected: 0,
        rejections: [],
      }
    },
  }
}

export function createInMemoryExaminationArchive(): ExaminationArchivePort {
  return createExaminationArchive(createInMemoryExaminationArchiveStorage())
}
