import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  resolveAssignmentGroups,
  resolveGroupSetGroups,
} from "../group-selection.js"
import {
  activeMemberIds,
  ensureSystemGroupSets,
  findSystemSet,
  systemSetsMissing,
} from "../group-set.js"
import { generateGroupName, generateUniqueGroupName } from "../roster.js"
import {
  type Assignment,
  type Group,
  type GroupSet,
  initialIdSequences,
  ORIGIN_LOCAL,
  ORIGIN_SYSTEM,
  type Roster,
  type RosterMember,
  STAFF_GROUP_NAME,
  SYSTEM_TYPE_INDIVIDUAL_STUDENTS,
  SYSTEM_TYPE_STAFF,
} from "../types.js"

function makeMember(
  id: string,
  name: string,
  overrides: Partial<RosterMember> = {},
): RosterMember {
  return {
    id,
    name,
    email: `${id}@example.com`,
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

describe("group naming", () => {
  it("handles sortable names and Dutch surname particles", () => {
    const member = makeMember("a1b2c3d4", "Jong, Stijn de")

    assert.equal(generateGroupName([member]), "stijn.de.jong")
  })

  it("resolves single-member collisions with an id suffix", () => {
    const member = makeMember("a1b2c3d4", "Alice Smith")
    const existingNames = new Set(["alice.smith"])

    assert.equal(
      generateUniqueGroupName([member], existingNames),
      "alice.smith.a1b2",
    )
  })
})

describe("group resolution", () => {
  const groups: Group[] = [
    {
      id: "g1",
      name: "lab-1a",
      memberIds: ["s1"],
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    },
    {
      id: "g2",
      name: "lab-1b",
      memberIds: [],
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    },
    {
      id: "g3",
      name: "exam",
      memberIds: ["s2"],
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    },
  ]

  const groupSet: GroupSet = {
    id: "gs1",
    name: "Labs",
    nameMode: "named",
    groupIds: ["g1", "g2", "g3"],
    connection: null,
    repoNameTemplate: null,
    columnVisibility: {},
    columnSizing: {},
  }

  const assignment: Assignment = {
    id: "a1",
    name: "Assignment",
    groupSetId: "gs1",
  }

  const roster = makeRoster({
    groups,
    groupSets: [groupSet],
    assignments: [assignment],
  })

  it("resolves all groups for a named group set", () => {
    const selected = resolveGroupSetGroups(roster, groupSet)

    assert.deepStrictEqual(
      selected.map((group) => group.id),
      ["g1", "g2", "g3"],
    )
  })

  it("resolves groups for an assignment from the group set", () => {
    const selected = resolveAssignmentGroups(roster, assignment)

    assert.deepStrictEqual(
      selected.map((group) => group.id),
      ["g1", "g2", "g3"],
    )
  })
})

describe("system group sets", () => {
  it("creates and maintains the system sets", () => {
    const alice = makeMember("s1", "Alice Smith")
    const bob = makeMember("s2", "Bob Jones")
    const staff = makeMember("t1", "Prof Smith", { enrollmentType: "teacher" })
    const roster = makeRoster({
      students: [alice, bob],
      staff: [staff],
    })

    const result = ensureSystemGroupSets(roster, initialIdSequences())

    assert.equal(systemSetsMissing(roster), false)
    assert.equal(result.groupSets.length, 2)

    const individualSet = findSystemSet(roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS)
    const staffSet = findSystemSet(roster, SYSTEM_TYPE_STAFF)
    if (!individualSet || individualSet.nameMode !== "named")
      return assert.fail()
    if (!staffSet || staffSet.nameMode !== "named") return assert.fail()
    assert.equal(individualSet.groupIds.length, 2)
    assert.equal(staffSet.groupIds.length, 1)

    const staffGroup = roster.groups.find(
      (group) => group.name === STAFF_GROUP_NAME,
    )
    assert.ok(staffGroup)
    assert.deepStrictEqual(staffGroup?.memberIds, ["t1"])
  })

  it("removes dropped students from system groups but preserves them elsewhere", () => {
    const activeStudent = makeMember("s1", "Alice Smith")
    const droppedStudent = makeMember("s2", "Bob Jones", { status: "dropped" })
    const roster = makeRoster({
      students: [activeStudent, droppedStudent],
      groups: [
        {
          id: "g-local",
          name: "project",
          memberIds: ["s1", "s2"],
          origin: ORIGIN_LOCAL,
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs-local",
          name: "Projects",
          groupIds: ["g-local"],
          connection: null,
          nameMode: "named",
          repoNameTemplate: null,
          columnVisibility: {},
          columnSizing: {},
        },
      ],
    })

    ensureSystemGroupSets(roster, initialIdSequences())

    const individualSet = findSystemSet(roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS)
    if (!individualSet || individualSet.nameMode !== "named")
      return assert.fail()
    assert.equal(individualSet.groupIds.length, 1)

    const localGroup = roster.groups.find((group) => group.id === "g-local")
    assert.deepStrictEqual(localGroup?.memberIds, ["s1", "s2"])
    assert.deepStrictEqual(activeMemberIds(roster, localGroup as Group), ["s1"])
  })

  it("renames the legacy Staff system group to lowercase staff", () => {
    const roster = makeRoster({
      staff: [makeMember("t1", "Prof Smith", { enrollmentType: "teacher" })],
      groups: [
        {
          id: "g-staff",
          name: "Staff",
          memberIds: [],
          origin: ORIGIN_SYSTEM,
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs-staff",
          name: "Staff",
          groupIds: ["g-staff"],
          connection: {
            kind: "system",
            systemType: SYSTEM_TYPE_STAFF,
          },
          nameMode: "named",
          repoNameTemplate: null,
          columnVisibility: {},
          columnSizing: {},
        },
      ],
    })

    const result = ensureSystemGroupSets(roster, initialIdSequences())
    const updatedStaffGroup = roster.groups.find(
      (group) => group.id === "g-staff",
    )

    assert.equal(updatedStaffGroup?.name, STAFF_GROUP_NAME)
    assert.deepStrictEqual(updatedStaffGroup?.memberIds, ["t1"])
    assert.equal(
      result.groupsUpserted.some((group) => group.id === "g-staff"),
      true,
    )
  })
})
