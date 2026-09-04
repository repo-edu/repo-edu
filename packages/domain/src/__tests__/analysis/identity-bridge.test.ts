import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { bridgeAuthorsToRoster } from "../../analysis/identity-bridge.js"
import { createPersonDbFromLog } from "../../analysis/person-db.js"
import type { PersonDbSnapshot } from "../../analysis/types.js"
import type { RosterMember } from "../../types.js"

function makeMember(
  overrides: Partial<RosterMember> & {
    id: string
    name: string
    email: string
  },
): RosterMember {
  return {
    studentNumber: null,
    gitUsername: null,
    gitUsernameStatus: "unknown",
    status: "active",
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: "student",
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "local",
    ...overrides,
  }
}

function makePersonDb(): PersonDbSnapshot {
  return createPersonDbFromLog(
    [
      { name: "Alice Smith", email: "alice@uni.example.com" },
      { name: "Bob Jones", email: "bob@uni.example.com" },
      { name: "Charlie Brown", email: "charlie@personal.example.com" },
    ],
    new Map([
      ["alice@uni.example.com\0alice smith", 10],
      ["bob@uni.example.com\0bob jones", 5],
      ["charlie@personal.example.com\0charlie brown", 3],
    ]),
  )
}

describe("bridgeAuthorsToRoster", () => {
  it("matches by exact email", () => {
    const personDb = makePersonDb()
    const members = [
      makeMember({
        id: "m_0001",
        name: "Alice S.",
        email: "alice@uni.example.com",
      }),
    ]
    const result = bridgeAuthorsToRoster(personDb, members)
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0].confidence, "exact-email")
    assert.equal(result.matches[0].memberName, "Alice S.")
  })

  it("matches by fuzzy name when email differs", () => {
    const personDb = makePersonDb()
    const members = [
      makeMember({
        id: "m_0001",
        name: "Bob Jones",
        email: "different@uni.example.com",
      }),
    ]
    const result = bridgeAuthorsToRoster(personDb, members)
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0].confidence, "fuzzy-name")
  })

  it("prefers exact email over fuzzy name", () => {
    const personDb = makePersonDb()
    const members = [
      makeMember({
        id: "m_0001",
        name: "Alice Smith",
        email: "alice@uni.example.com",
      }),
    ]
    const result = bridgeAuthorsToRoster(personDb, members)
    assert.equal(result.matches[0].confidence, "exact-email")
  })

  it("reports unmatched persons and members", () => {
    const personDb = makePersonDb()
    const members = [
      makeMember({
        id: "m_0001",
        name: "Alice S.",
        email: "alice@uni.example.com",
      }),
      makeMember({
        id: "m_0002",
        name: "Unknown Student",
        email: "unknown@uni.example.com",
      }),
    ]
    const result = bridgeAuthorsToRoster(personDb, members)
    assert.equal(result.matches.length, 1)
    assert.equal(result.unmatchedPersonIds.length, 2)
    assert.equal(result.unmatchedMemberIds.length, 1)
    assert.ok(result.unmatchedMemberIds.includes("m_0002"))
  })

  it("handles empty roster", () => {
    const personDb = makePersonDb()
    const result = bridgeAuthorsToRoster(personDb, [])
    assert.equal(result.matches.length, 0)
    assert.equal(result.unmatchedPersonIds.length, 3)
    assert.equal(result.unmatchedMemberIds.length, 0)
  })

  it("handles empty person DB", () => {
    const personDb: PersonDbSnapshot = { persons: [], identityIndex: new Map() }
    const members = [
      makeMember({
        id: "m_0001",
        name: "Alice",
        email: "alice@uni.example.com",
      }),
    ]
    const result = bridgeAuthorsToRoster(personDb, members)
    assert.equal(result.matches.length, 0)
    assert.equal(result.unmatchedMemberIds.length, 1)
  })

  it("uses case-insensitive matching for names", () => {
    const personDb = makePersonDb()
    const members = [
      makeMember({
        id: "m_0001",
        name: "alice  smith",
        email: "different@uni.example.com",
      }),
    ]
    const result = bridgeAuthorsToRoster(personDb, members)
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0].confidence, "fuzzy-name")
  })

  it("does not match same member to multiple persons", () => {
    const personDb = createPersonDbFromLog(
      [
        { name: "Alice", email: "alice@a.example.com" },
        { name: "Alice", email: "alice@b.example.com" },
      ],
      new Map(),
    )
    const members = [
      makeMember({ id: "m_0001", name: "Alice", email: "alice@a.example.com" }),
    ]
    const result = bridgeAuthorsToRoster(personDb, members)
    assert.equal(result.matches.length, 1)
  })
})
