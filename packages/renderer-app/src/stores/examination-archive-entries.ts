import type { ExaminationArchiveKey } from "@repo-edu/application-contract"
import { parseExaminationArchiveStorageKey } from "@repo-edu/application-contract"
import type { AvailableArchiveEntry } from "./examination-store-types.js"

export function mergeAvailableArchiveEntries(
  current: readonly AvailableArchiveEntry[],
  incoming: readonly AvailableArchiveEntry[],
): AvailableArchiveEntry[] {
  const byKey = new Map<string, AvailableArchiveEntry>()
  for (const entry of current) {
    byKey.set(entry.key, entry)
  }
  for (const entry of incoming) {
    byKey.set(entry.key, entry)
  }
  return [...byKey.values()].sort(compareAvailableArchiveEntries)
}

export function mergeSupersedingAvailableArchiveEntries(
  current: readonly AvailableArchiveEntry[],
  incoming: readonly AvailableArchiveEntry[],
): AvailableArchiveEntry[] {
  const supersededKeys = supersededAvailableArchiveEntryKeys(current, incoming)
  return mergeAvailableArchiveEntries(
    current.filter((entry) => !supersededKeys.has(entry.key)),
    incoming,
  )
}

export function supersededAvailableArchiveEntryKeys(
  current: readonly AvailableArchiveEntry[],
  incoming: readonly AvailableArchiveEntry[],
): Set<string> {
  const incomingContexts = incoming
    .map((entry) => parseArchiveStorageKeyContext(entry.key))
    .filter((context) => context !== null)
  const incomingKeys = new Set(incoming.map((entry) => entry.key))
  const supersededKeys = new Set<string>()
  for (const entry of current) {
    if (incomingKeys.has(entry.key)) continue
    const context = parseArchiveStorageKeyContext(entry.key)
    if (context === null) continue
    if (
      incomingContexts.some((incomingContext) =>
        sameArchiveContext(context, incomingContext),
      )
    ) {
      supersededKeys.add(entry.key)
    }
  }
  return supersededKeys
}

type ArchiveStorageKeyContext = {
  personId: ExaminationArchiveKey["personId"]
  contentScopeId: ExaminationArchiveKey["contentScopeId"]
  providerPayloadFingerprint: ExaminationArchiveKey["providerPayloadFingerprint"]
  generationContextFingerprint: ExaminationArchiveKey["generationContextFingerprint"]
}

function parseArchiveStorageKeyContext(
  key: string,
): ArchiveStorageKeyContext | null {
  const parsed = parseExaminationArchiveStorageKey(key)
  if (parsed === null) return null
  const {
    personId,
    contentScopeId,
    providerPayloadFingerprint,
    generationContextFingerprint,
  } = parsed
  return {
    personId,
    contentScopeId,
    providerPayloadFingerprint,
    generationContextFingerprint,
  }
}

function sameArchiveContext(
  a: ArchiveStorageKeyContext,
  b: ArchiveStorageKeyContext,
): boolean {
  return (
    a.personId === b.personId &&
    a.contentScopeId === b.contentScopeId &&
    a.providerPayloadFingerprint === b.providerPayloadFingerprint &&
    a.generationContextFingerprint === b.generationContextFingerprint
  )
}

function compareAvailableArchiveEntries(
  a: AvailableArchiveEntry,
  b: AvailableArchiveEntry,
): number {
  const aTime =
    a.entry.generatedAt === null ? 0 : Date.parse(a.entry.generatedAt)
  const bTime =
    b.entry.generatedAt === null ? 0 : Date.parse(b.entry.generatedAt)
  if (aTime !== bTime) return bTime - aTime
  return a.questionCount - b.questionCount
}
