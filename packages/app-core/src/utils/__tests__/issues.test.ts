import type {
  Roster,
  ValidationResult,
} from "@repo-edu/backend-interface/types"
import { describe, expect, it } from "vitest"
import { buildIssueCards } from "../issues"

function emptyValidation(): ValidationResult {
  return { issues: [] }
}

describe("buildIssueCards", () => {
  it("detects empty groups in non-system group sets without assignments", () => {
    const roster: Roster = {
      connection: null,
      students: [],
      staff: [],
      groups: [
        {
          id: "g-empty",
          name: "Empty Team",
          member_ids: [],
          origin: "local",
          lms_group_id: null,
        },
      ],
      group_sets: [
        {
          id: "gs-local",
          name: "Local Set",
          group_ids: ["g-empty"],
          connection: null,
          group_selection: { kind: "all", excluded_group_ids: [] },
        },
      ],
      assignments: [],
    }

    const issueCards = buildIssueCards(roster, emptyValidation(), {})

    expect(issueCards).toContainEqual(
      expect.objectContaining({
        kind: "empty_groups",
        groupSetId: "gs-local",
        count: 1,
      }),
    )
  })

  it("ignores empty groups in system group sets", () => {
    const roster: Roster = {
      connection: null,
      students: [],
      staff: [],
      groups: [
        {
          id: "g-system-empty",
          name: "System Empty",
          member_ids: [],
          origin: "system",
          lms_group_id: null,
        },
      ],
      group_sets: [
        {
          id: "gs-system",
          name: "Individual Students",
          group_ids: ["g-system-empty"],
          connection: { kind: "system", system_type: "individual_students" },
          group_selection: { kind: "all", excluded_group_ids: [] },
        },
      ],
      assignments: [],
    }

    const issueCards = buildIssueCards(roster, emptyValidation(), {})

    expect(issueCards.find((card) => card.kind === "empty_groups")).toBeFalsy()
  })
})
