import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type Group,
  type GroupSet,
  ORIGIN_LOCAL,
  planRepositoryOperation,
  preflightRepositoryOperation,
  type Roster,
  type RosterMember,
  selectionModeAll,
  skippedGroupsFromRepoCollisions,
} from "../index.js"

function makeMember(
  id: string,
  name: string,
  status: RosterMember["status"] = "active",
): RosterMember {
  return {
    id,
    name,
    email: `${id}@example.com`,
    studentNumber: null,
    gitUsername: null,
    gitUsernameStatus: "unknown",
    status,
    lmsStatus: null,
    lmsUserId: null,
    enrollmentType: "student",
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "local",
  }
}

function makeRoster(
  groups: Group[],
  groupSets: GroupSet[],
  assignments: Roster["assignments"],
  students: Roster["students"],
): Roster {
  return {
    connection: null,
    students,
    staff: [],
    groups,
    groupSets,
    assignments,
  }
}

describe("repository planning", () => {
  it("plans active groups and skips empty groups", () => {
    const groups: Group[] = [
      {
        id: "g1",
        name: "Team A",
        memberIds: ["s1"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
      {
        id: "g2",
        name: "Team B",
        memberIds: ["s2"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
    ]
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Projects",
      groupIds: ["g1", "g2"],
      connection: null,
      groupSelection: selectionModeAll(),
    }
    const roster = makeRoster(
      groups,
      [groupSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs1" }],
      [makeMember("s1", "Alice"), makeMember("s2", "Bob", "dropped")],
    )

    const plan = planRepositoryOperation(roster, "a1")
    assert.equal(plan.ok, true)
    if (!plan.ok) return

    assert.deepStrictEqual(plan.value.groups, [
      {
        assignmentId: "a1",
        assignmentName: "HW 1",
        groupId: "g1",
        groupName: "Team A",
        repoName: "hw-1-team-a",
        activeMemberIds: ["s1"],
      },
    ])
    assert.deepStrictEqual(plan.value.skippedGroups, [
      {
        assignmentId: "a1",
        groupId: "g2",
        groupName: "Team B",
        reason: "empty_group",
        context: null,
      },
    ])
  })

  it("computes create and clone preflight collisions", () => {
    const groups: Group[] = [
      {
        id: "g1",
        name: "Team A",
        memberIds: ["s1"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
      {
        id: "g2",
        name: "Team B",
        memberIds: ["s2"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
    ]
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Projects",
      groupIds: ["g1", "g2"],
      connection: null,
      groupSelection: selectionModeAll(),
    }
    const roster = makeRoster(
      groups,
      [groupSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs1" }],
      [makeMember("s1", "Alice"), makeMember("s2", "Bob")],
    )

    const planResult = planRepositoryOperation(roster, "a1")
    assert.equal(planResult.ok, true)
    if (!planResult.ok) return

    const firstRepoName = planResult.value.groups[0]?.repoName
    const secondRepoName = planResult.value.groups[1]?.repoName
    assert.ok(firstRepoName)
    assert.ok(secondRepoName)

    const create = preflightRepositoryOperation("create", planResult.value, {
      [firstRepoName]: true,
      [secondRepoName]: false,
    })
    assert.equal(create.ok, true)
    if (!create.ok) return
    assert.deepStrictEqual(create.value, {
      collisions: [
        {
          groupId: "g1",
          groupName: "Team A",
          repoName: firstRepoName,
          kind: "already_exists",
        },
      ],
      readyCount: 1,
    })

    const clone = preflightRepositoryOperation("clone", planResult.value, {
      [firstRepoName]: true,
      [secondRepoName]: false,
    })
    assert.equal(clone.ok, true)
    if (!clone.ok) return
    assert.deepStrictEqual(clone.value, {
      collisions: [
        {
          groupId: "g2",
          groupName: "Team B",
          repoName: secondRepoName,
          kind: "not_found",
        },
      ],
      readyCount: 1,
    })
  })

  it("returns validation errors for missing assignment or lookup entries", () => {
    const emptyRoster = makeRoster([], [], [], [])
    const missingAssignment = planRepositoryOperation(emptyRoster, "a1")
    assert.equal(missingAssignment.ok, false)
    if (missingAssignment.ok) return
    assert.equal(missingAssignment.issues[0]?.message, "Assignment not found")

    const groups: Group[] = [
      {
        id: "g1",
        name: "Team A",
        memberIds: ["s1"],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
    ]
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Projects",
      groupIds: ["g1"],
      connection: null,
      groupSelection: selectionModeAll(),
    }
    const roster = makeRoster(
      groups,
      [groupSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs1" }],
      [makeMember("s1", "Alice")],
    )
    const plan = planRepositoryOperation(roster, "a1")
    assert.equal(plan.ok, true)
    if (!plan.ok) return

    const preflight = preflightRepositoryOperation("create", plan.value, {})
    assert.equal(preflight.ok, false)
    if (preflight.ok) return
    assert.match(
      preflight.issues[0]?.message ?? "",
      /Missing repository existence lookup/,
    )
  })

  it("maps collisions to skipped-group reasons", () => {
    const skipped = skippedGroupsFromRepoCollisions("a1", [
      {
        groupId: "g1",
        groupName: "Team A",
        repoName: "hw-1-team-a",
        kind: "already_exists",
      },
      {
        groupId: "g2",
        groupName: "Team B",
        repoName: "hw-1-team-b",
        kind: "not_found",
      },
    ])

    assert.deepStrictEqual(skipped, [
      {
        assignmentId: "a1",
        groupId: "g1",
        groupName: "Team A",
        reason: "repo_exists",
        context: "hw-1-team-a",
      },
      {
        assignmentId: "a1",
        groupId: "g2",
        groupName: "Team B",
        reason: "repo_not_found",
        context: "hw-1-team-b",
      },
    ])
  })
})
