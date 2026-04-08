import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  exportGroupSetRows,
  importGroupSet,
  previewImportGroupSet,
  previewReimportGroupSet,
  previewReplaceGroupSetFromRepoBee,
  reimportGroupSet,
} from "../group-set-import-export.js"
import {
  type Group,
  type GroupSet,
  initialIdSequences,
  ORIGIN_LOCAL,
  type Roster,
  type RosterMember,
} from "../types.js"

function makeMember(
  id: string,
  name: string,
  email: string,
  overrides: Partial<RosterMember> = {},
): RosterMember {
  return {
    id,
    name,
    email,
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
    students: [
      makeMember("m_0001", "Alice Smith", "alice@example.com", {
        gitUsername: "alice",
      }),
      makeMember("m_0002", "Bob Jones", "bob@example.com", {
        gitUsername: "bob",
      }),
      makeMember("m_0003", "Carol Lee", "carol@example.com", {
        gitUsername: "carol",
      }),
    ],
    staff: [
      makeMember("m_1001", "Prof X", "profx@example.com", {
        enrollmentType: "teacher",
      }),
    ],
    groups: [],
    groupSets: [],
    assignments: [],
    ...overrides,
  }
}

describe("group-set import preview", () => {
  it("previews member counts and missing members", () => {
    const roster = makeRoster()
    const result = previewImportGroupSet(roster, [
      { group_name: "Team A", email: "ALICE@example.com" },
      { group_name: "Team A", email: "nobody@example.com" },
      { group_name: "Team B", email: "profx@example.com" },
    ])

    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.deepStrictEqual(result.value, {
      mode: "import",
      groups: [
        { name: "Team A", memberCount: 1 },
        { name: "Team B", memberCount: 1 },
      ],
      missingMembers: [{ groupName: "Team A", missingCount: 1 }],
      totalMissing: 1,
    })
  })

  it("rejects duplicate memberships", () => {
    const duplicateMembership = previewImportGroupSet(makeRoster(), [
      { group_name: "Alpha", email: "same@example.com" },
      { group_name: "Alpha", email: "same@example.com" },
    ])
    assert.equal(duplicateMembership.ok, false)
    if (duplicateMembership.ok) return
    assert.match(
      duplicateMembership.issues[0]?.message ?? "",
      /Duplicate membership/,
    )
  })

  it("supports git username member resolution", () => {
    const roster = makeRoster()
    const result = previewImportGroupSet(
      roster,
      [
        { group_name: "Team A", git_username: "alice" },
        { group_name: "Team A", git_username: "missing-user" },
      ],
      { memberKey: "gitUsername" },
    )

    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.deepStrictEqual(result.value, {
      mode: "import",
      groups: [{ name: "Team A", memberCount: 1 }],
      missingMembers: [{ groupName: "Team A", missingCount: 1 }],
      totalMissing: 1,
    })
  })

  it("rejects CSV preview into unnamed group sets", () => {
    const roster = makeRoster({
      groupSets: [
        {
          id: "gs-unnamed",
          name: "RepoBee Teams",
          nameMode: "unnamed",
          teams: [{ id: "ut_0001", gitUsernames: ["alice"] }],
          connection: null,
          repoNameTemplate: "{assignment}-{members}",
          columnVisibility: {},
          columnSizing: {},
        },
      ],
    })
    const result = previewImportGroupSet(
      roster,
      [{ group_name: "Team A", email: "alice@example.com" }],
      {
        targetGroupSetId: "gs-unnamed",
      },
    )

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(
      result.issues[0]?.message,
      "CSV import is only supported for named group sets",
    )
  })

  it("rejects RepoBee preview into named group sets", () => {
    const roster = makeRoster({
      groupSets: [
        {
          id: "gs-named",
          name: "Named",
          nameMode: "named",
          groupIds: [],
          connection: null,
          repoNameTemplate: null,
          columnVisibility: {},
          columnSizing: {},
        },
      ],
    })
    const result = previewReplaceGroupSetFromRepoBee(roster, "gs-named", [
      ["alice", "bob"],
    ])

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(
      result.issues[0]?.message,
      "RepoBee import is only supported for unnamed group sets",
    )
  })
})

describe("group-set import and reimport", () => {
  it("imports local groups in CSV order with import connection metadata", () => {
    const roster = makeRoster()
    const result = importGroupSet(
      roster,
      {
        sourceFilename: "groups.csv",
        sourcePath: "/tmp/groups.csv",
        lastUpdated: "2026-03-04T10:00:00.000Z",
      },
      [
        { group_name: "Zeta", email: "alice@example.com" },
        { group_name: "Alpha", email: "bob@example.com" },
        { group_name: "Mid", email: "carol@example.com" },
      ],
      initialIdSequences(),
    )

    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.equal(result.value.mode, "import")
    assert.equal(result.value.groupSet.name, "groups")
    assert.deepStrictEqual(
      result.value.groupsUpserted.map((group) => group.name),
      ["Zeta", "Alpha", "Mid"],
    )
    assert.deepStrictEqual(
      result.value.groupsUpserted.map((group) => group.origin),
      [ORIGIN_LOCAL, ORIGIN_LOCAL, ORIGIN_LOCAL],
    )
    assert.deepStrictEqual(
      result.value.groupsUpserted.map((group) => group.memberIds),
      [["m_0001"], ["m_0002"], ["m_0003"]],
    )
    assert.deepStrictEqual(result.value.groupSet.connection, {
      kind: "import",
      sourceFilename: "groups.csv",
      sourcePath: "/tmp/groups.csv",
      lastUpdated: "2026-03-04T10:00:00.000Z",
    })
    assert.deepStrictEqual(result.value.idSequences, {
      nextGroupSeq: 4,
      nextGroupSetSeq: 2,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    })
  })

  it("reimport wrappers use additive import semantics", () => {
    const groups: Group[] = [
      {
        id: "g-existing",
        name: "Original Name",
        memberIds: ["m_0001"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
      {
        id: "g-by-name",
        name: "Team A",
        memberIds: ["m_0001"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
      {
        id: "g-untouched",
        name: "Will Stay",
        memberIds: ["m_0003"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
    ]
    const groupSet: GroupSet = {
      id: "gs-existing",
      name: "Imported",
      nameMode: "named",
      groupIds: groups.map((group) => group.id),
      connection: {
        kind: "import",
        sourceFilename: "old.csv",
        sourcePath: null,
        lastUpdated: "2026-03-01T00:00:00.000Z",
      },
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    }
    const roster = makeRoster({
      groups,
      groupSets: [groupSet],
    })

    const rows = [
      {
        group_name: "Team A",
        email: "bob@example.com",
      },
      {
        group_name: "Added",
        email: "carol@example.com",
      },
    ] as const

    const preview = previewReimportGroupSet(roster, "gs-existing", rows)
    assert.equal(preview.ok, true)
    if (!preview.ok) return
    assert.equal(preview.value.mode, "import")
    assert.deepStrictEqual(preview.value.groups, [
      { name: "Team A", memberCount: 1 },
      { name: "Added", memberCount: 1 },
    ])

    const applied = reimportGroupSet(
      roster,
      "gs-existing",
      {
        sourceFilename: "new.csv",
        sourcePath: "/tmp/new.csv",
        lastUpdated: "2026-03-04T12:00:00.000Z",
      },
      rows,
      {
        nextGroupSeq: 10,
        nextGroupSetSeq: 20,
        nextMemberSeq: 30,
        nextAssignmentSeq: 40,
        nextTeamSeq: 1,
      },
    )

    assert.equal(applied.ok, true)
    if (!applied.ok) return

    assert.equal(applied.value.mode, "import")
    assert.deepStrictEqual(applied.value.deletedGroupIds, [])
    assert.deepStrictEqual(
      applied.value.groupsUpserted.map((group) => group.id),
      ["g-by-name", "g_0010"],
    )
    assert.deepStrictEqual(applied.value.groupsUpserted[0]?.memberIds, [
      "m_0002",
    ])
    assert.deepStrictEqual(applied.value.groupsUpserted[1]?.memberIds, [
      "m_0003",
    ])
    assert.equal(applied.value.groupSet.connection?.kind, "import")
    assert.equal(applied.value.groupSet.nameMode, "named")
    if (applied.value.groupSet.nameMode !== "named") return
    assert.deepStrictEqual(applied.value.groupSet.groupIds, [
      "g-existing",
      "g-by-name",
      "g-untouched",
      "g_0010",
    ])
    assert.deepStrictEqual(applied.value.idSequences, {
      nextGroupSeq: 11,
      nextGroupSetSeq: 20,
      nextMemberSeq: 30,
      nextAssignmentSeq: 40,
      nextTeamSeq: 1,
    })
  })
})

describe("group-set export", () => {
  it("exports rows including empty groups and missing member placeholders", () => {
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Export",
      nameMode: "named",
      groupIds: ["g1", "g2"],
      connection: null,
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    }
    const groups: Group[] = [
      {
        id: "g1",
        name: "Team A",
        memberIds: ["m_0001", "missing-member"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
      {
        id: "g2",
        name: "Empty Group",
        memberIds: [],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
    ]
    const roster = makeRoster({
      groups,
      groupSets: [groupSet],
    })

    const result = exportGroupSetRows(roster, "gs1")
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.deepStrictEqual(result.value, [
      {
        group_name: "Team A",
        name: "Alice Smith",
        email: "alice@example.com",
      },
      {
        group_name: "Team A",
        name: "",
        email: "",
      },
      {
        group_name: "Empty Group",
        name: "",
        email: "",
      },
    ])
  })
})
