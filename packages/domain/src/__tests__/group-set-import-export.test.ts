import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  exportGroupSetRows,
  type Group,
  type GroupSet,
  importGroupSet,
  ORIGIN_LOCAL,
  previewImportGroupSet,
  previewReimportGroupSet,
  type Roster,
  type RosterMember,
  reimportGroupSet,
  selectionModeAll,
} from "../index.js"

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
      makeMember("s1", "Alice Smith", "alice@example.com"),
      makeMember("s2", "Bob Jones", "bob@example.com"),
      makeMember("s3", "Carol Lee", "carol@example.com"),
    ],
    staff: [
      makeMember("t1", "Prof X", "profx@example.com", {
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

  it("rejects duplicate memberships and conflicting group ids", () => {
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

    const conflictingIds = previewImportGroupSet(makeRoster(), [
      { group_name: "Alpha", group_id: "g1" },
      { group_name: "Beta", group_id: "g1" },
    ])
    assert.equal(conflictingIds.ok, false)
    if (conflictingIds.ok) return
    assert.match(
      conflictingIds.issues[0]?.message ?? "",
      /maps to multiple group names/,
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
    )

    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.equal(result.value.mode, "import")
    assert.equal(result.value.groupSet.name, "groups.csv")
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
      [["s1"], ["s2"], ["s3"]],
    )
    assert.deepStrictEqual(result.value.groupSet.connection, {
      kind: "import",
      sourceFilename: "groups.csv",
      sourcePath: "/tmp/groups.csv",
      lastUpdated: "2026-03-04T10:00:00.000Z",
    })
  })

  it("previews reimport diffs and applies id/name matching with deletions", () => {
    const groups: Group[] = [
      {
        id: "g-existing",
        name: "Original Name",
        memberIds: ["s1"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
      {
        id: "g-by-name",
        name: "Team A",
        memberIds: ["s1"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
      {
        id: "g-removed",
        name: "Will Remove",
        memberIds: ["s3"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
    ]
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Imported",
      groupIds: groups.map((group) => group.id),
      connection: {
        kind: "import",
        sourceFilename: "old.csv",
        sourcePath: null,
        lastUpdated: "2026-03-01T00:00:00.000Z",
      },
      groupSelection: selectionModeAll(),
    }
    const roster = makeRoster({
      groups,
      groupSets: [groupSet],
    })

    const rows = [
      {
        group_name: "Renamed",
        group_id: "g-existing",
        email: "bob@example.com",
      },
      {
        group_name: "Team A",
        email: "bob@example.com",
      },
      {
        group_name: "Added",
        email: "carol@example.com",
      },
    ] as const

    const preview = previewReimportGroupSet(roster, "gs1", rows)
    assert.equal(preview.ok, true)
    if (!preview.ok) return
    assert.equal(preview.value.mode, "reimport")
    if (preview.value.mode !== "reimport") return

    assert.deepStrictEqual(preview.value.addedGroupNames, ["Added"])
    assert.deepStrictEqual(preview.value.removedGroupNames, ["Will Remove"])
    assert.deepStrictEqual(preview.value.updatedGroupNames, [
      "Renamed",
      "Team A",
    ])
    assert.deepStrictEqual(preview.value.renamedGroups, [
      { from: "Original Name", to: "Renamed" },
    ])

    const applied = reimportGroupSet(
      roster,
      "gs1",
      {
        sourceFilename: "new.csv",
        sourcePath: "/tmp/new.csv",
        lastUpdated: "2026-03-04T12:00:00.000Z",
      },
      rows,
    )

    assert.equal(applied.ok, true)
    if (!applied.ok) return

    assert.equal(applied.value.mode, "reimport")
    assert.deepStrictEqual(applied.value.deletedGroupIds, ["g-removed"])
    assert.deepStrictEqual(
      applied.value.groupsUpserted.map((group) => group.id),
      ["g-existing", "g-by-name", applied.value.groupsUpserted[2]?.id],
    )
    assert.equal(applied.value.groupsUpserted[0]?.name, "Renamed")
    assert.deepStrictEqual(applied.value.groupsUpserted[0]?.memberIds, ["s2"])
    assert.deepStrictEqual(applied.value.groupsUpserted[1]?.memberIds, ["s2"])
    assert.equal(applied.value.groupSet.connection?.kind, "import")
    assert.deepStrictEqual(applied.value.groupSet.groupIds.slice(0, 2), [
      "g-existing",
      "g-by-name",
    ])
  })
})

describe("group-set export", () => {
  it("exports rows including empty groups and missing member placeholders", () => {
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Export",
      groupIds: ["g1", "g2"],
      connection: null,
      groupSelection: selectionModeAll(),
    }
    const groups: Group[] = [
      {
        id: "g1",
        name: "Team A",
        memberIds: ["s1", "missing-member"],
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
        group_set_id: "gs1",
        group_id: "g1",
        group_name: "Team A",
        name: "Alice Smith",
        email: "alice@example.com",
      },
      {
        group_set_id: "gs1",
        group_id: "g1",
        group_name: "Team A",
        name: "",
        email: "",
      },
      {
        group_set_id: "gs1",
        group_id: "g2",
        group_name: "Empty Group",
        name: "",
        email: "",
      },
    ])
  })
})
