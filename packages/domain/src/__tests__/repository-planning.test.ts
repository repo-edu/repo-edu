import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  computeRepoName,
  expandTemplate,
  planRepositoryOperation,
  preflightRepositoryOperation,
  skippedGroupsFromRepoCollisions,
} from "../repository-planning.js"
import { computeMembersSurnamesSlug } from "../roster.js"
import {
  type Assignment,
  type Group,
  type GroupSet,
  initialIdSequences,
  ORIGIN_LOCAL,
  type PersistedCourse,
  persistedCourseKind,
  type Roster,
  type RosterMember,
} from "../types.js"

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

function makeCourse(
  groups: Group[],
  groupSets: GroupSet[],
  assignments: Roster["assignments"],
  students: Roster["students"],
): PersistedCourse {
  return {
    kind: persistedCourseKind,
    revision: 0,
    id: "test",
    displayName: "Test",
    lmsConnectionName: null,
    organization: null,
    lmsCourseId: null,
    idSequences: initialIdSequences(),
    roster: {
      connection: null,
      students,
      staff: [],
      groups,
      groupSets,
      assignments,
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("repository planning", () => {
  it("plans active groups and skips empty groups on create", () => {
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
      nameMode: "named",
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    }
    const course = makeCourse(
      groups,
      [groupSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs1", repositories: {} }],
      [makeMember("s1", "Alice"), makeMember("s2", "Bob", "dropped")],
    )

    const plan = planRepositoryOperation(course, "a1", "create")
    assert.equal(plan.ok, true)
    if (!plan.ok) return

    assert.deepStrictEqual(plan.value.groups, [
      {
        assignmentId: "a1",
        assignmentName: "HW 1",
        groupId: "g1",
        groupName: "Team A",
        repoName: "team.a",
        activeMemberIds: ["s1"],
        gitUsernames: [],
        isRecorded: false,
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

  it("skips empty unrecorded groups with no_record_no_members on clone", () => {
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
      nameMode: "named",
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    }
    const course = makeCourse(
      groups,
      [groupSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs1", repositories: {} }],
      [makeMember("s1", "Alice", "dropped")],
    )

    const plan = planRepositoryOperation(course, "a1", "clone")
    assert.equal(plan.ok, true)
    if (!plan.ok) return

    assert.deepStrictEqual(plan.value.groups, [])
    assert.deepStrictEqual(plan.value.skippedGroups, [
      {
        assignmentId: "a1",
        groupId: "g1",
        groupName: "Team A",
        reason: "no_record_no_members",
        context: null,
      },
    ])
  })

  it("prefers recorded names over derived names", () => {
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
        memberIds: [],
        origin: ORIGIN_LOCAL,
        lmsGroupId: null,
      },
    ]
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Projects",
      groupIds: ["g1", "g2"],
      connection: null,
      nameMode: "named",
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    }
    const course = makeCourse(
      groups,
      [groupSet],
      [
        {
          id: "a1",
          name: "HW 1",
          groupSetId: "gs1",
          repositories: { g1: "recorded-repo-a", g2: "recorded-repo-b" },
        },
      ],
      [makeMember("s1", "Alice")],
    )

    const plan = planRepositoryOperation(course, "a1", "clone")
    assert.equal(plan.ok, true)
    if (!plan.ok) return

    assert.deepStrictEqual(
      plan.value.groups.map((group) => ({
        groupId: group.groupId,
        repoName: group.repoName,
        isRecorded: group.isRecorded,
      })),
      [
        { groupId: "g1", repoName: "recorded-repo-a", isRecorded: true },
        { groupId: "g2", repoName: "recorded-repo-b", isRecorded: true },
      ],
    )
  })

  it("uses unnamed team ids for {group_id} template expansion", () => {
    const unnamedSet: GroupSet = {
      id: "gs-unnamed",
      name: "RepoBee Teams",
      nameMode: "unnamed",
      teams: [
        { id: "ut_0001", gitUsernames: ["alice"] },
        { id: "ut_0002", gitUsernames: ["bob"] },
      ],
      connection: null,
      repoNameTemplate: "{group_id}",
      columnVisibility: {},
      columnSizing: {},
    }
    const course = makeCourse(
      [],
      [unnamedSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs-unnamed", repositories: {} }],
      [],
    )

    const plan = planRepositoryOperation(course, "a1", "create")
    assert.equal(plan.ok, true)
    if (!plan.ok) return

    assert.deepStrictEqual(
      plan.value.groups.map((group) => ({
        groupId: group.groupId,
        repoName: group.repoName,
      })),
      [
        { groupId: "ut_0001", repoName: "ut-0001" },
        { groupId: "ut_0002", repoName: "ut-0002" },
      ],
    )
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
      nameMode: "named",
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    }
    const course = makeCourse(
      groups,
      [groupSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs1", repositories: {} }],
      [makeMember("s1", "Alice"), makeMember("s2", "Bob")],
    )

    const planResult = planRepositoryOperation(course, "a1", "create")
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
    const emptyCourse = makeCourse([], [], [], [])
    const missingAssignment = planRepositoryOperation(
      emptyCourse,
      "a1",
      "create",
    )
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
      nameMode: "named",
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    }
    const course = makeCourse(
      groups,
      [groupSet],
      [{ id: "a1", name: "HW 1", groupSetId: "gs1", repositories: {} }],
      [makeMember("s1", "Alice")],
    )
    const plan = planRepositoryOperation(course, "a1", "create")
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
        repoName: "hw.1-team.a",
        kind: "already_exists",
      },
      {
        groupId: "g2",
        groupName: "Team B",
        repoName: "hw.1-team.b",
        kind: "not_found",
      },
    ])

    assert.deepStrictEqual(skipped, [
      {
        assignmentId: "a1",
        groupId: "g1",
        groupName: "Team A",
        reason: "repo_exists",
        context: "hw.1-team.a",
      },
      {
        assignmentId: "a1",
        groupId: "g2",
        groupName: "Team B",
        reason: "repo_not_found",
        context: "hw.1-team.b",
      },
    ])
  })
})

describe("computeMembersSurnamesSlug", () => {
  it("returns empty string for empty array", () => {
    assert.equal(computeMembersSurnamesSlug([]), "")
  })

  it("extracts surname with particle for a single member", () => {
    assert.equal(computeMembersSurnamesSlug(["Jan de Vries"]), "de.vries")
  })

  it("sorts by surname ignoring particles", () => {
    const result = computeMembersSurnamesSlug([
      "Alice Smith",
      "Bob van der Berg",
      "Charlie Jones",
    ])
    // Berg < Jones < Smith (particles stripped for sort, kept in slug)
    assert.equal(result, "van.der.berg-jones-smith")
  })

  it("filters out single-word names with no parseable surname", () => {
    const result = computeMembersSurnamesSlug(["Alice", "Bob Smith"])
    assert.equal(result, "smith")
  })

  it("respects the limit parameter after sorting", () => {
    const result = computeMembersSurnamesSlug(
      ["Alice Smith", "Bob van der Berg", "Charlie Jones"],
      2,
    )
    // Berg < Jones (limit 2 takes first two after sort)
    assert.equal(result, "van.der.berg-jones")
  })
})

describe("expandTemplate with surnames", () => {
  it("substitutes {surnames} placeholder", () => {
    const assignment: Assignment = {
      id: "a1",
      name: "HW1",
      groupSetId: "gs1",
      repositories: {},
    }
    const group: Group = {
      id: "g1",
      name: "101",
      memberIds: [],
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    }
    const result = expandTemplate(
      "{assignment}-{group}-{surnames}",
      assignment,
      group,
      { surnames: "smith-jones" },
    )
    assert.equal(result, "hw1-101-smith-jones")
  })
})

describe("expandTemplate with members", () => {
  it("substitutes {members} placeholder", () => {
    const assignment: Assignment = {
      id: "a1",
      name: "HW1",
      groupSetId: "gs1",
      repositories: {},
    }
    const group: Group = {
      id: "g1",
      name: "101",
      memberIds: [],
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    }
    const result = expandTemplate("{assignment}-{members}", assignment, group, {
      members: "alice-bob",
    })
    assert.equal(result, "hw1-alice-bob")
  })
})

describe("computeRepoName with surnames", () => {
  it("produces a slugified repo name from template + surnames", () => {
    const assignment: Assignment = {
      id: "a1",
      name: "HW 1",
      groupSetId: "gs1",
      repositories: {},
    }
    const group: Group = {
      id: "g1",
      name: "Team A",
      memberIds: [],
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    }
    const result = computeRepoName(
      "{assignment}-{group}-{surnames}",
      assignment,
      group,
      { surnames: "smith-jones" },
    )
    assert.equal(result, "hw.1-team.a-smith-jones")
  })
})

describe("computeRepoName with members", () => {
  it("produces a slugified repo name from template + members", () => {
    const assignment: Assignment = {
      id: "a1",
      name: "HW 1",
      groupSetId: "gs1",
      repositories: {},
    }
    const group: Group = {
      id: "g1",
      name: "Team A",
      memberIds: [],
      origin: ORIGIN_LOCAL,
      lmsGroupId: null,
    }
    const result = computeRepoName(
      "{assignment}-{members}",
      assignment,
      group,
      {
        members: "alice-bob",
      },
    )
    assert.equal(result, "hw.1-alice-bob")
  })
})
