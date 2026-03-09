import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type Assignment,
  blockingIssues,
  computeRepoName,
  ensureSystemGroupSets,
  type Group,
  type GroupSet,
  hasBlockingIssues,
  type Roster,
  type RosterMember,
  selectionModeAll,
  validateAssignment,
  validateAssignmentWithTemplate,
  validateRoster,
  warningIssues,
} from "../index.js"

function makeMember(
  id: string,
  overrides: Partial<RosterMember> = {},
): RosterMember {
  return {
    id,
    name: `Member ${id}`,
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

describe("validateRoster", () => {
  it("detects missing system group sets", () => {
    const result = validateRoster(makeRoster())

    assert.equal(
      result.issues.some((issue) => issue.kind === "system_group_sets_missing"),
      true,
    )
  })

  it("passes the system-set check after ensureSystemGroupSets", () => {
    const roster = makeRoster()
    ensureSystemGroupSets(roster)

    const result = validateRoster(roster)

    assert.equal(
      result.issues.some((issue) => issue.kind === "system_group_sets_missing"),
      false,
    )
  })

  it("detects duplicate ids, duplicate emails, and invalid enrollment partition", () => {
    const roster = makeRoster({
      students: [
        makeMember("dup", { email: "dup@example.com" }),
        makeMember("dup", {
          email: "DUP@example.com",
          enrollmentType: "teacher",
        }),
      ],
    })
    ensureSystemGroupSets(roster)

    const result = validateRoster(roster)
    const kinds = result.issues.map((issue) => issue.kind)

    assert.equal(kinds.includes("duplicate_student_id"), true)
    assert.equal(kinds.includes("duplicate_email"), true)
    assert.equal(kinds.includes("invalid_enrollment_partition"), true)
  })

  it("detects orphan references and invalid group origin", () => {
    const group: Group = {
      id: "g1",
      name: "Canvas Group",
      memberIds: ["missing-member"],
      origin: "local",
      lmsGroupId: null,
    }
    const groupSet: GroupSet = {
      id: "gs1",
      name: "Canvas Set",
      groupIds: ["g1", "missing-group"],
      connection: {
        kind: "canvas",
        courseId: "course-1",
        groupSetId: "set-1",
        lastUpdated: "2026-03-04T10:00:00Z",
      },
      groupSelection: selectionModeAll(),
    }
    const roster = makeRoster({
      students: [makeMember("s1")],
      groups: [group],
      groupSets: [groupSet],
    })
    ensureSystemGroupSets(roster)

    const result = validateRoster(roster)

    assert.equal(
      result.issues.some(
        (issue) =>
          issue.kind === "orphan_group_member" &&
          issue.context?.includes("non-existent groups") === true,
      ),
      true,
    )
    assert.equal(
      result.issues.some(
        (issue) =>
          issue.kind === "orphan_group_member" &&
          issue.context?.includes("non-existent members") === true,
      ),
      true,
    )
    assert.equal(
      result.issues.some((issue) => issue.kind === "invalid_group_origin"),
      true,
    )
  })
})

describe("validateAssignment", () => {
  function makeAssignmentFixture(): {
    roster: Roster
    assignment: Assignment
  } {
    const studentA = makeMember("s1", {
      gitUsername: "",
    })
    const studentB = makeMember("s2", {
      gitUsername: "broken",
      gitUsernameStatus: "invalid",
    })
    const studentC = makeMember("s3")

    const groups: Group[] = [
      {
        id: "g1",
        name: "Alpha Team",
        memberIds: ["s1", "s2"],
        origin: "local",
        lmsGroupId: null,
      },
      {
        id: "g2",
        name: "Alpha Team",
        memberIds: [],
        origin: "local",
        lmsGroupId: null,
      },
      {
        id: "g3",
        name: "Gamma Team",
        memberIds: ["s2"],
        origin: "local",
        lmsGroupId: null,
      },
    ]

    const assignment: Assignment = {
      id: "a1",
      name: "Project 1",
      groupSetId: "gs1",
    }

    const roster = makeRoster({
      students: [studentA, studentB, studentC],
      groups,
      groupSets: [
        {
          id: "gs1",
          name: "Projects",
          groupIds: groups.map((group) => group.id),
          connection: null,
          groupSelection: selectionModeAll(),
        },
      ],
      assignments: [assignment],
    })

    return { roster, assignment }
  }

  it("surfaces assignment-specific warnings and collisions", () => {
    const { roster, assignment } = makeAssignmentFixture()

    const result = validateAssignment(roster, assignment.id, "username")
    const kinds = result.issues.map((issue) => issue.kind)

    assert.equal(kinds.includes("duplicate_group_name_in_assignment"), true)
    assert.equal(kinds.includes("empty_group"), true)
    assert.equal(kinds.includes("missing_git_username"), true)
    assert.equal(kinds.includes("invalid_git_username"), true)
    assert.equal(
      result.issues.some(
        (issue) => issue.kind === "student_in_multiple_groups_in_assignment",
      ),
      true,
    )
    assert.equal(kinds.includes("unassigned_student"), true)
  })

  it("detects duplicate repo names from the template", () => {
    const { roster, assignment } = makeAssignmentFixture()

    const result = validateAssignmentWithTemplate(
      roster,
      assignment.id,
      "email",
      "{assignment}",
    )
    const firstGroup = roster.groups[0]
    assert.ok(firstGroup)

    assert.equal(
      result.issues.some(
        (issue) =>
          issue.kind === "duplicate_repo_name_in_assignment" &&
          issue.context ===
            computeRepoName("{assignment}", assignment, firstGroup),
      ),
      true,
    )
    assert.equal(hasBlockingIssues(result), true)
    assert.ok(blockingIssues(result).length > 0)
    assert.ok(warningIssues(result).length > 0)
  })
})
