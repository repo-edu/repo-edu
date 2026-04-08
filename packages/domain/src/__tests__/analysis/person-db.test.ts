import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createPersonDbFromLog,
  lookupPerson,
  applyBlameToPersonDb,
  clonePersonDbSnapshot,
} from "../../analysis/person-db.js"
import type { GitAuthorIdentity, BlameLine } from "../../analysis/types.js"

function makeIdentities(): GitAuthorIdentity[] {
  return [
    { name: "Alice Smith", email: "alice@test.com" },
    { name: "Bob Jones", email: "bob@test.com" },
    { name: "A. Smith", email: "alice@test.com" },
  ]
}

function makeCommitCounts(): Map<string, number> {
  const counts = new Map<string, number>()
  counts.set("alice@test.com\0alice smith", 10)
  counts.set("bob@test.com\0bob jones", 5)
  counts.set("alice@test.com\0a. smith", 3)
  return counts
}

describe("createPersonDbFromLog", () => {
  it("creates snapshot with merged persons", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    assert.equal(snapshot.persons.length, 2)
  })

  it("builds identity index for canonical and aliases", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const aliceKey = "alice@test.com\0alice smith"
    const aliasKey = "alice@test.com\0a. smith"
    assert.ok(snapshot.identityIndex.has(aliceKey))
    assert.ok(snapshot.identityIndex.has(aliasKey))
    assert.equal(
      snapshot.identityIndex.get(aliceKey),
      snapshot.identityIndex.get(aliasKey),
    )
  })

  it("assigns deterministic person IDs", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    assert.equal(snapshot.persons[0].id, "p_0000")
    assert.equal(snapshot.persons[1].id, "p_0001")
  })
})

describe("lookupPerson", () => {
  it("finds person by canonical identity", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const person = lookupPerson(snapshot, "Alice Smith", "alice@test.com")
    assert.ok(person)
    assert.equal(person.canonicalName, "Alice Smith")
  })

  it("finds person by alias identity", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const person = lookupPerson(snapshot, "A. Smith", "alice@test.com")
    assert.ok(person)
    assert.equal(person.canonicalName, "Alice Smith")
  })

  it("returns undefined for unknown identity", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const person = lookupPerson(snapshot, "Unknown", "unknown@test.com")
    assert.equal(person, undefined)
  })
})

describe("applyBlameToPersonDb", () => {
  it("adds new alias with email-link evidence when blame matches by email", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const blameLines: BlameLine[] = [
      {
        sha: "abc123",
        authorName: "Alice S.",
        authorEmail: "alice@test.com",
        timestamp: 1700000000,
        lineNumber: 1,
        content: "code",
        message: "fix",
      },
    ]
    const { delta } = applyBlameToPersonDb(snapshot, blameLines)
    assert.equal(delta.newAliases.length, 1)
    assert.equal(delta.newAliases[0].alias.name, "Alice S.")
    assert.equal(delta.newAliases[0].alias.evidence, "email-link")
    assert.equal(delta.newPersons.length, 0)
  })

  it("adds new alias with name-only evidence when blame matches by name only", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const blameLines: BlameLine[] = [
      {
        sha: "abc123",
        authorName: "Alice Smith",
        authorEmail: "alice-new@other.com",
        timestamp: 1700000000,
        lineNumber: 1,
        content: "code",
        message: "fix",
      },
    ]
    const { delta } = applyBlameToPersonDb(snapshot, blameLines)
    assert.equal(delta.newAliases.length, 1)
    assert.equal(delta.newAliases[0].alias.email, "alice-new@other.com")
    assert.equal(delta.newAliases[0].alias.evidence, "name-only")
  })

  it("creates new person for completely unknown identity", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const blameLines: BlameLine[] = [
      {
        sha: "def456",
        authorName: "Charlie",
        authorEmail: "charlie@test.com",
        timestamp: 1700000000,
        lineNumber: 1,
        content: "code",
        message: "add",
      },
    ]
    const { snapshot: updated, delta } = applyBlameToPersonDb(
      snapshot,
      blameLines,
    )
    assert.equal(delta.newPersons.length, 1)
    assert.equal(delta.newPersons[0].canonicalName, "Charlie")
    assert.equal(updated.persons.length, 3)
  })

  it("is idempotent when replaying identical blame input", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const blameLines: BlameLine[] = [
      {
        sha: "abc123",
        authorName: "Alice Smith",
        authorEmail: "alice@test.com",
        timestamp: 1700000000,
        lineNumber: 1,
        content: "code",
        message: "fix",
      },
    ]
    const { snapshot: first, delta: delta1 } = applyBlameToPersonDb(
      snapshot,
      blameLines,
    )
    const { delta: delta2 } = applyBlameToPersonDb(first, blameLines)
    assert.equal(delta1.newPersons.length, 0)
    assert.equal(delta1.newAliases.length, 0)
    assert.equal(delta2.newPersons.length, 0)
    assert.equal(delta2.newAliases.length, 0)
  })

  it("does not mutate original snapshot", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const originalCount = snapshot.persons.length
    const blameLines: BlameLine[] = [
      {
        sha: "def456",
        authorName: "Charlie",
        authorEmail: "charlie@test.com",
        timestamp: 1700000000,
        lineNumber: 1,
        content: "code",
        message: "add",
      },
    ]
    applyBlameToPersonDb(snapshot, blameLines)
    assert.equal(snapshot.persons.length, originalCount)
  })
})

describe("clonePersonDbSnapshot", () => {
  it("creates independent copy", () => {
    const snapshot = createPersonDbFromLog(makeIdentities(), makeCommitCounts())
    const clone = clonePersonDbSnapshot(snapshot)
    clone.persons.push({
      id: "p_9999",
      canonicalName: "Test",
      canonicalEmail: "test@test.com",
      aliases: [],
      commitCount: 0,
    })
    assert.notEqual(snapshot.persons.length, clone.persons.length)
  })
})
