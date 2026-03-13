import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Roster, RosterValidationResult } from "@repo-edu/domain"
import { buildIssueCards, buildRosterInsights } from "../utils/issues.js"

function makeRoster(): Roster {
  return {
    connection: null,
    students: [
      {
        id: "s-1",
        name: "Ada",
        email: "",
        studentNumber: "1001",
        gitUsername: "ada",
        gitUsernameStatus: "valid",
        status: "active",
        lmsStatus: "active",
        lmsUserId: "u-1",
        enrollmentType: "student",
        enrollmentDisplay: "Student",
        department: null,
        institution: null,
        source: "seed",
      },
      {
        id: "s-2",
        name: "Grace",
        email: "grace@example.edu",
        studentNumber: "1002",
        gitUsername: null,
        gitUsernameStatus: "unknown",
        status: "dropped",
        lmsStatus: "dropped",
        lmsUserId: "u-2",
        enrollmentType: "student",
        enrollmentDisplay: "Student",
        department: null,
        institution: null,
        source: "seed",
      },
    ],
    staff: [],
    groups: [
      {
        id: "g-1",
        name: "team-1",
        memberIds: ["s-1"],
        origin: "local",
        lmsGroupId: null,
      },
      {
        id: "g-2",
        name: "team-2",
        memberIds: [],
        origin: "local",
        lmsGroupId: null,
      },
    ],
    groupSets: [
      {
        id: "gs-1",
        name: "Project Teams",
        groupIds: ["g-1", "g-2"],
        connection: null,
        groupSelection: {
          kind: "all",
          excludedGroupIds: [],
        },
        repoNameTemplate: null,
      },
    ],
    assignments: [
      {
        id: "a-1",
        name: "Project 1",
        groupSetId: "gs-1",
      },
    ],
  }
}

describe("issue utilities", () => {
  it("builds roster insights for active/dropped and missing fields", () => {
    const insights = buildRosterInsights(makeRoster())

    assert.deepStrictEqual(insights, {
      activeCount: 1,
      droppedCount: 1,
      incompleteCount: 0,
      missingEmailCount: 1,
      missingGitUsernameCount: 1,
    })
  })

  it("builds issue cards for roster, assignment, and empty-group issues", () => {
    const roster = makeRoster()
    const rosterValidation: RosterValidationResult = {
      issues: [
        {
          kind: "missing_email",
          affectedIds: ["s-1"],
          context: null,
        },
      ],
    }
    const assignmentValidations: Record<string, RosterValidationResult> = {
      "a-1": {
        issues: [
          {
            kind: "duplicate_repo_name_in_assignment",
            affectedIds: ["repo-project-1"],
            context: null,
          },
        ],
      },
    }

    const cards = buildIssueCards(
      roster,
      rosterValidation,
      assignmentValidations,
    )

    assert.equal(
      cards.some((card) => card.kind === "roster_validation"),
      true,
    )
    assert.equal(
      cards.some((card) => card.kind === "assignment_validation"),
      true,
    )
    assert.equal(
      cards.some((card) => card.kind === "empty_groups"),
      true,
    )
  })
})
