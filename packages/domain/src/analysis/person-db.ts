import type {
  BlameLine,
  GitAuthorIdentity,
  PersonAlias,
  PersonDbDelta,
  PersonDbSnapshot,
  PersonRecord,
} from "./types.js"
import { mergePersonIdentities } from "./person-merge.js"

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeNameForDb(name: string): string {
  return name.trim().split(/\s+/).join(" ").toLowerCase()
}

function normalizeEmailForDb(email: string): string {
  return email.trim().toLowerCase()
}

function identityKey(name: string, email: string): string {
  return `${normalizeEmailForDb(email)}\0${normalizeNameForDb(name)}`
}

// ---------------------------------------------------------------------------
// PersonDB construction from log data
// ---------------------------------------------------------------------------

export function createPersonDbFromLog(
  identities: GitAuthorIdentity[],
  commitCounts: Map<string, number>,
): PersonDbSnapshot {
  const mergeResult = mergePersonIdentities(identities, commitCounts)

  const identityIndex = new Map<string, string>()
  const persons: PersonRecord[] = mergeResult.persons.map((merged) => {
    const key = identityKey(merged.canonicalName, merged.canonicalEmail)
    identityIndex.set(key, merged.id)

    for (const alias of merged.aliases) {
      const aliasKey = identityKey(alias.name, alias.email)
      identityIndex.set(aliasKey, merged.id)
    }

    return {
      id: merged.id,
      canonicalName: merged.canonicalName,
      canonicalEmail: merged.canonicalEmail,
      aliases: merged.aliases,
      commitCount: merged.commitCount,
    }
  })

  return { persons, identityIndex }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function lookupPerson(
  snapshot: PersonDbSnapshot,
  name: string,
  email: string,
): PersonRecord | undefined {
  const key = identityKey(name, email)
  const personId = snapshot.identityIndex.get(key)
  if (personId === undefined) return undefined
  return snapshot.persons.find((p) => p.id === personId)
}

// ---------------------------------------------------------------------------
// Incremental enrichment from blame data
// ---------------------------------------------------------------------------

export function applyBlameToPersonDb(
  snapshot: PersonDbSnapshot,
  blameLines: BlameLine[],
): { snapshot: PersonDbSnapshot; delta: PersonDbDelta } {
  const persons = snapshot.persons.map((p) => ({
    ...p,
    aliases: [...p.aliases],
  }))
  const identityIndex = new Map(snapshot.identityIndex)

  const delta: PersonDbDelta = {
    newPersons: [],
    newAliases: [],
    relinkedIdentities: [],
  }

  for (const line of blameLines) {
    const key = identityKey(line.authorName, line.authorEmail)
    const existingPersonId = identityIndex.get(key)

    if (existingPersonId !== undefined) {
      continue
    }

    const emailKey = normalizeEmailForDb(line.authorEmail)
    const nameKey = normalizeNameForDb(line.authorName)

    let matchedPersonId: string | undefined
    let matchEvidence: "email-link" | "name-only" = "name-only"

    for (const [existingKey, personId] of identityIndex) {
      const [existingEmail] = existingKey.split("\0")
      if (emailKey.length > 0 && existingEmail === emailKey) {
        matchedPersonId = personId
        matchEvidence = "email-link"
        break
      }
    }

    if (matchedPersonId === undefined) {
      for (const [existingKey, personId] of identityIndex) {
        const existingName = existingKey.split("\0")[1]
        if (nameKey.length > 0 && existingName === nameKey) {
          matchedPersonId = personId
          matchEvidence = "name-only"
          break
        }
      }
    }

    if (matchedPersonId !== undefined) {
      identityIndex.set(key, matchedPersonId)
      const person = persons.find((p) => p.id === matchedPersonId)
      if (person) {
        const alias: PersonAlias = {
          name: line.authorName,
          email: line.authorEmail,
          evidence: matchEvidence,
        }
        person.aliases.push(alias)
        delta.newAliases.push({ personId: matchedPersonId, alias })
      }
    } else {
      const newId = `p_${String(persons.length).padStart(4, "0")}`
      const newPerson: PersonRecord = {
        id: newId,
        canonicalName: line.authorName,
        canonicalEmail: line.authorEmail,
        aliases: [],
        commitCount: 0,
      }
      persons.push(newPerson)
      identityIndex.set(key, newId)
      delta.newPersons.push(newPerson)
    }
  }

  return {
    snapshot: { persons, identityIndex },
    delta,
  }
}

// ---------------------------------------------------------------------------
// Snapshot cloning
// ---------------------------------------------------------------------------

export function clonePersonDbSnapshot(
  snapshot: PersonDbSnapshot,
): PersonDbSnapshot {
  return {
    persons: snapshot.persons.map((p) => ({
      ...p,
      aliases: [...p.aliases],
    })),
    identityIndex: new Map(snapshot.identityIndex),
  }
}
