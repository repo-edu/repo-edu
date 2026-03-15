import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Roster, RosterMember } from "../index.js"
import {
  mergeRosterFromLms,
  mergeRosterFromLmsWithConflicts,
  normalizeRoster,
  normalizeRosterMember,
} from "../index.js"

describe("normalizeRosterMember", () => {
  it("uses the first non-empty name candidate and normalizes optional fields", () => {
    const member = normalizeRosterMember({
      id: " 42 ",
      studentNumber: " s-1001 ",
      nameCandidates: ["", " Ada Lovelace ", "Ignored"],
      emailCandidates: [" ", " ada@example.com "],
      gitUsername: " adal ",
      source: " lms ",
    })

    assert.deepStrictEqual(member, {
      id: "42",
      name: "Ada Lovelace",
      email: "ada@example.com",
      studentNumber: "s-1001",
      gitUsername: "adal",
      gitUsernameStatus: "unknown",
      status: "active",
      lmsStatus: null,
      lmsUserId: null,
      enrollmentType: "student",
      enrollmentDisplay: null,
      department: null,
      institution: null,
      source: "lms",
    })
  })

  it("falls back to the normalized id when no name is available", () => {
    const member = normalizeRosterMember({
      id: 77,
      studentNumber: "",
      displayNameCandidates: ["", " "],
      emailCandidates: [null],
      gitUsername: "",
      status: "dropped",
      enrollmentType: "ta",
    })

    assert.deepStrictEqual(member, {
      id: "77",
      name: "77",
      email: "",
      studentNumber: null,
      gitUsername: null,
      gitUsernameStatus: "unknown",
      status: "dropped",
      lmsStatus: null,
      lmsUserId: null,
      enrollmentType: "ta",
      enrollmentDisplay: null,
      department: null,
      institution: null,
      source: "local",
    })
  })

  it("forces incomplete when email is missing and status resolves to active", () => {
    const member = normalizeRosterMember({
      id: "s-1",
      nameCandidates: ["No Email"],
      emailCandidates: ["", "  "],
      lmsStatus: "active",
    })

    assert.equal(member.email, "")
    assert.equal(member.status, "incomplete")
    assert.equal(member.lmsStatus, "active")
  })
})

describe("normalizeRoster", () => {
  it("normalizes separate student and staff arrays", () => {
    const roster = normalizeRoster(
      [
        {
          id: "s-1",
          nameCandidates: ["Ada"],
          emailCandidates: ["ada@example.com"],
        },
        {
          id: "s-2",
          nameCandidates: ["Grace"],
        },
      ],
      [
        {
          id: "t-1",
          nameCandidates: ["Prof. Turing"],
          emailCandidates: ["turing@example.com"],
        },
      ],
    )

    assert.deepStrictEqual(roster, {
      connection: null,
      students: [
        {
          id: "s-1",
          name: "Ada",
          email: "ada@example.com",
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
        },
        {
          id: "s-2",
          name: "Grace",
          email: "",
          studentNumber: null,
          gitUsername: null,
          gitUsernameStatus: "unknown",
          status: "incomplete",
          lmsStatus: null,
          lmsUserId: null,
          enrollmentType: "student",
          enrollmentDisplay: null,
          department: null,
          institution: null,
          source: "local",
        },
      ],
      staff: [
        {
          id: "t-1",
          name: "Prof. Turing",
          email: "turing@example.com",
          studentNumber: null,
          gitUsername: null,
          gitUsernameStatus: "unknown",
          status: "active",
          lmsStatus: null,
          lmsUserId: null,
          enrollmentType: "teacher",
          enrollmentDisplay: null,
          department: null,
          institution: null,
          source: "local",
        },
      ],
      groups: [],
      groupSets: [],
      assignments: [],
    })
  })
})

// ---------------------------------------------------------------------------
// mergeRosterFromLms
// ---------------------------------------------------------------------------

function makeMember(
  overrides: Partial<RosterMember> & { id: string },
): RosterMember {
  return {
    name: overrides.id,
    email: "",
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

function makeRoster(overrides: Partial<Roster> = {}): Roster {
  return {
    connection: null,
    students: [],
    staff: [],
    groups: [],
    groupSets: [],
    assignments: [],
    ...overrides,
  }
}

describe("mergeRosterFromLms", () => {
  it("matched member preserves gitUsername and updates LMS fields", () => {
    const existing = makeRoster({
      students: [
        makeMember({
          id: "42",
          lmsUserId: "42",
          name: "Old Name",
          gitUsername: "adal",
          gitUsernameStatus: "valid",
          department: "CS",
        }),
      ],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      students: [
        makeMember({
          id: "42",
          lmsUserId: "42",
          name: "New Name",
          email: "new@example.com",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students.length, 1)
    const m = result.students[0]
    assert.equal(m.name, "New Name")
    assert.equal(m.email, "new@example.com")
    assert.equal(m.gitUsername, "adal")
    assert.equal(m.gitUsernameStatus, "valid")
    assert.equal(m.department, "CS")
    assert.equal(m.status, "active")
    assert.equal(m.lmsUserId, "42")
    assert.equal(m.source, "canvas")
  })

  it("unmatched LMS-sourced member becomes dropped", () => {
    const existing = makeRoster({
      students: [
        makeMember({ id: "99", lmsUserId: "99", name: "Gone Student" }),
      ],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students.length, 1)
    assert.equal(result.students[0].status, "dropped")
    assert.equal(result.students[0].lmsStatus, "dropped")
    assert.equal(result.students[0].name, "Gone Student")
  })

  it("unmatched local member (lmsUserId null) left unchanged", () => {
    const existing = makeRoster({
      students: [
        makeMember({ id: "local-1", name: "Local Student", gitUsername: "ls" }),
      ],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students.length, 1)
    assert.equal(result.students[0].status, "active")
    assert.equal(result.students[0].gitUsername, "ls")
  })

  it("new incoming member is added", () => {
    const existing = makeRoster()
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      students: [
        makeMember({
          id: "200",
          lmsUserId: "200",
          name: "New Student",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students.length, 1)
    assert.equal(result.students[0].id, "200")
    assert.equal(result.students[0].name, "New Student")
  })

  it("new incoming member with no email becomes incomplete", () => {
    const existing = makeRoster()
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      students: [
        makeMember({
          id: "201",
          lmsUserId: "201",
          name: "No Email Student",
          email: "",
          status: "active",
          lmsStatus: "active",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students.length, 1)
    assert.equal(result.students[0].id, "201")
    assert.equal(result.students[0].status, "incomplete")
    assert.equal(result.students[0].lmsStatus, "active")
  })

  it("enrollment type change moves member between arrays", () => {
    const existing = makeRoster({
      students: [makeMember({ id: "42", lmsUserId: "42", name: "Promoted" })],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      staff: [
        makeMember({
          id: "42",
          lmsUserId: "42",
          name: "Promoted",
          enrollmentType: "ta",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students.length, 0)
    assert.equal(result.staff.length, 1)
    assert.equal(result.staff[0].enrollmentType, "ta")
  })

  it("fallback id matching populates lmsUserId for legacy members", () => {
    const existing = makeRoster({
      students: [
        makeMember({ id: "42", lmsUserId: null, gitUsername: "legacy" }),
      ],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      students: [makeMember({ id: "42", lmsUserId: "42", source: "canvas" })],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students.length, 1)
    assert.equal(result.students[0].lmsUserId, "42")
    assert.equal(result.students[0].gitUsername, "legacy")
  })

  it("preserves groups, groupSets, and assignments from existing", () => {
    const existing = makeRoster({
      groups: [
        {
          id: "g1",
          name: "Group 1",
          memberIds: ["42"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs1",
          name: "Set 1",
          groupIds: ["g1"],
          groupSelection: { kind: "all", excludedGroupIds: [] },
          repoNameTemplate: null,
          connection: null,
        },
      ],
      assignments: [{ id: "a1", name: "Assignment 1", groupSetId: "gs1" }],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.groups.length, 1)
    assert.equal(result.groupSets.length, 1)
    assert.equal(result.assignments.length, 1)
  })

  it("takes connection from incoming", () => {
    const existing = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-01-01" },
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.deepStrictEqual(result.connection, {
      kind: "canvas",
      courseId: "c1",
      lastUpdated: "2026-03-11",
    })
  })

  it("propagates LMS enrollment status to matched member", () => {
    const existing = makeRoster({
      students: [makeMember({ id: "42", lmsUserId: "42" })],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      students: [
        makeMember({
          id: "42",
          lmsUserId: "42",
          email: "a@b.com",
          status: "dropped",
          lmsStatus: "dropped",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students[0].status, "dropped")
    assert.equal(result.students[0].lmsStatus, "dropped")
  })

  it("forces incomplete when matched member has no email", () => {
    const existing = makeRoster({
      students: [makeMember({ id: "42", lmsUserId: "42", email: "" })],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      students: [
        makeMember({
          id: "42",
          lmsUserId: "42",
          email: "",
          status: "active",
          lmsStatus: "active",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students[0].status, "incomplete")
    assert.equal(result.students[0].lmsStatus, "active")
  })

  it("prefers incoming email but falls back to existing when incoming is empty", () => {
    const existing = makeRoster({
      students: [
        makeMember({ id: "42", lmsUserId: "42", email: "old@example.com" }),
      ],
    })
    const incoming = makeRoster({
      connection: { kind: "canvas", courseId: "c1", lastUpdated: "2026-03-11" },
      students: [makeMember({ id: "42", lmsUserId: "42", email: "" })],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.equal(result.students[0].email, "old@example.com")
  })

  it("matches by email when LMS ID is missing on existing member", () => {
    const existing = makeRoster({
      students: [
        makeMember({
          id: "local-1",
          lmsUserId: null,
          email: "ada@example.com",
          gitUsername: "adal",
        }),
      ],
    })
    const incoming = makeRoster({
      students: [
        makeMember({
          id: "lms-1",
          lmsUserId: "u-1",
          email: "Ada@example.com",
          name: "Ada Lovelace",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLmsWithConflicts(existing, incoming)

    assert.equal(result.totalConflicts, 0)
    assert.equal(result.roster.students.length, 1)
    assert.equal(result.roster.students[0].id, "local-1")
    assert.equal(result.roster.students[0].lmsUserId, "u-1")
    assert.equal(result.roster.students[0].gitUsername, "adal")
    assert.equal(result.summary.membersUpdated, 1)
  })

  it("matches by student number when email does not match", () => {
    const existing = makeRoster({
      students: [
        makeMember({
          id: "local-2",
          lmsUserId: null,
          email: "old@example.com",
          studentNumber: "s-1001",
          gitUsername: "legacy",
        }),
      ],
    })
    const incoming = makeRoster({
      students: [
        makeMember({
          id: "lms-2",
          lmsUserId: "u-2",
          email: "new@example.com",
          studentNumber: "s-1001",
          name: "Student Two",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLmsWithConflicts(existing, incoming)

    assert.equal(result.totalConflicts, 0)
    assert.equal(result.roster.students.length, 1)
    assert.equal(result.roster.students[0].id, "local-2")
    assert.equal(result.roster.students[0].lmsUserId, "u-2")
    assert.equal(result.roster.students[0].gitUsername, "legacy")
  })

  it("reports conflicts when multiple existing members match same email", () => {
    const existing = makeRoster({
      students: [
        makeMember({ id: "s1", lmsUserId: null, email: "shared@example.com" }),
        makeMember({ id: "s2", lmsUserId: null, email: "shared@example.com" }),
      ],
    })
    const incoming = makeRoster({
      students: [
        makeMember({
          id: "incoming",
          lmsUserId: "incoming-id",
          email: "shared@example.com",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLmsWithConflicts(existing, incoming)

    assert.equal(result.totalConflicts, 1)
    assert.equal(result.conflicts[0].matchKey, "email")
    assert.deepStrictEqual(result.conflicts[0].matchedIds, ["s1", "s2"])
    assert.equal(result.roster.students.length, 2)
    assert.equal(result.summary.membersAdded, 0)
  })

  it("keeps conflicted LMS members unchanged instead of marking them dropped", () => {
    const existing = makeRoster({
      students: [
        makeMember({
          id: "s1",
          lmsUserId: "old-1",
          email: "one@example.com",
          studentNumber: "shared-sn",
          status: "active",
          lmsStatus: "active",
          source: "canvas",
        }),
        makeMember({
          id: "s2",
          lmsUserId: "old-2",
          email: "two@example.com",
          studentNumber: "shared-sn",
          status: "active",
          lmsStatus: "active",
          source: "canvas",
        }),
      ],
    })
    const incoming = makeRoster({
      students: [
        makeMember({
          id: "new-id",
          lmsUserId: "new-id",
          email: "new@example.com",
          studentNumber: "shared-sn",
          source: "canvas",
        }),
      ],
    })

    const result = mergeRosterFromLmsWithConflicts(existing, incoming)

    assert.equal(result.totalConflicts, 1)
    assert.equal(result.conflicts[0].matchKey, "studentNumber")
    assert.equal(
      result.roster.students.every((member) => member.status === "active"),
      true,
    )
  })

  it("sorts merged members by name for deterministic reimport order", () => {
    const existing = makeRoster()
    const incoming = makeRoster({
      students: [
        makeMember({ id: "3", lmsUserId: "3", name: "Charlie" }),
        makeMember({ id: "1", lmsUserId: "1", name: "alice" }),
        makeMember({ id: "2", lmsUserId: "2", name: "Bob" }),
      ],
    })

    const result = mergeRosterFromLms(existing, incoming)

    assert.deepStrictEqual(
      result.students.map((member) => member.name),
      ["alice", "Bob", "Charlie"],
    )
  })
})
