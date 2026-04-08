import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mergePersonIdentities } from "../../analysis/person-merge.js"

describe("mergePersonIdentities", () => {
  it("returns empty result for empty input", () => {
    const result = mergePersonIdentities([])
    assert.deepStrictEqual(result.persons, [])
  })

  it("creates one person per unique identity", () => {
    const result = mergePersonIdentities([
      { name: "Alice", email: "alice@test.com" },
      { name: "Bob", email: "bob@test.com" },
    ])
    assert.equal(result.persons.length, 2)
    assert.equal(result.persons[0].canonicalName, "Alice")
    assert.equal(result.persons[1].canonicalName, "Bob")
  })

  it("merges identities sharing normalized email", () => {
    const result = mergePersonIdentities([
      { name: "Alice Smith", email: "alice@test.com" },
      { name: "A. Smith", email: "ALICE@TEST.COM" },
    ])
    assert.equal(result.persons.length, 1)
    assert.equal(result.persons[0].aliases.length, 1)
    assert.ok(result.persons[0].evidence.includes("email-link"))
  })

  it("merges identities sharing normalized name (different email)", () => {
    const result = mergePersonIdentities([
      { name: "Alice Smith", email: "alice@personal.com" },
      { name: "alice smith", email: "alice@work.com" },
    ])
    assert.equal(result.persons.length, 1)
    assert.equal(result.persons[0].aliases.length, 1)
    assert.ok(result.persons[0].evidence.includes("name-only"))
  })

  it("merges same normalized name + different email + empty roster", () => {
    const result = mergePersonIdentities([
      { name: "John Doe", email: "john@personal.com" },
      { name: "john  doe", email: "jdoe@work.com" },
      { name: "Jane Doe", email: "jane@test.com" },
    ])
    assert.equal(result.persons.length, 2)
    const john = result.persons.find(
      (p) => p.canonicalName === "John Doe" || p.canonicalName === "john  doe",
    )
    assert.ok(john)
    assert.equal(john.aliases.length, 1)
  })

  it("selects canonical by commit count", () => {
    const counts = new Map<string, number>()
    counts.set("alice@test.com\0alice", 5)
    counts.set("alice@test.com\0alice smith", 10)

    const result = mergePersonIdentities(
      [
        { name: "Alice", email: "alice@test.com" },
        { name: "Alice Smith", email: "alice@test.com" },
      ],
      counts,
    )
    assert.equal(result.persons.length, 1)
    assert.equal(result.persons[0].canonicalName, "Alice Smith")
  })

  it("breaks commit count tie by lexicographic email", () => {
    const counts = new Map<string, number>()
    counts.set("b@test.com\0alice", 5)
    counts.set("a@test.com\0alice", 5)

    const result = mergePersonIdentities(
      [
        { name: "Alice", email: "b@test.com" },
        { name: "Alice", email: "a@test.com" },
      ],
      counts,
    )
    assert.equal(result.persons.length, 1)
    assert.equal(result.persons[0].canonicalEmail, "a@test.com")
  })

  it("assigns deterministic person IDs", () => {
    const result = mergePersonIdentities([
      { name: "Alice", email: "alice@test.com" },
      { name: "Bob", email: "bob@test.com" },
      { name: "Charlie", email: "charlie@test.com" },
    ])
    assert.equal(result.persons[0].id, "p_0000")
    assert.equal(result.persons[1].id, "p_0001")
    assert.equal(result.persons[2].id, "p_0002")
  })

  it("handles transitive merge through shared email and name", () => {
    const result = mergePersonIdentities([
      { name: "Alice", email: "alice@personal.com" },
      { name: "Alice", email: "alice@work.com" },
      { name: "Bob", email: "alice@work.com" },
    ])
    assert.equal(result.persons.length, 1)
  })

  it("preserves all aliases after merge", () => {
    const result = mergePersonIdentities([
      { name: "Alice Smith", email: "alice@test.com" },
      { name: "A Smith", email: "alice@test.com" },
      { name: "Alice S", email: "alice@test.com" },
    ])
    assert.equal(result.persons.length, 1)
    assert.equal(result.persons[0].aliases.length, 2)
  })
})
