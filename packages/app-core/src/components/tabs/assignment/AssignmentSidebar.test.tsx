import { render, screen } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { AssignmentSidebar } from "./AssignmentSidebar"

const baseGroupSet = {
  fetched_at: new Date().toISOString(),
  lms_group_set_id: null,
  origin: "lms" as const,
  lms_type: "canvas" as const,
  base_url: "https://example.edu",
  course_id: "course-1",
}

describe("AssignmentSidebar", () => {
  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
  })

  it("computes aggregation counts from cached group data", () => {
    const assignments = [
      {
        id: "assignment-1",
        name: "Assignment 1",
        description: null,
        assignment_type: "class_wide" as const,
        groups: [],
        group_set_cache_id: "set-1",
        source_fetched_at: null,
      },
    ]

    const lmsGroupSets = [
      {
        ...baseGroupSet,
        id: "set-1",
        lms_group_set_id: "set-1",
        name: "Set 1",
        groups: [
          {
            id: "g1",
            name: "Group 1",
            lms_member_ids: ["u1"],
            resolved_member_ids: ["s1"],
            unresolved_count: 0,
            needs_reresolution: false,
          },
        ],
      },
      {
        ...baseGroupSet,
        id: "set-2",
        lms_group_set_id: "set-2",
        name: "Set 2",
        groups: [],
      },
    ]

    const students = [
      {
        id: "s1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        git_username_status: "unknown" as const,
        status: "active" as const,
        custom_fields: {},
      },
      {
        id: "s2",
        name: "Grace Hopper",
        email: "grace@example.com",
        git_username_status: "unknown" as const,
        status: "active" as const,
        custom_fields: {},
      },
      {
        id: "s3",
        name: "Alan Turing",
        email: "alan@example.com",
        git_username_status: "unknown" as const,
        status: "dropped" as const,
        custom_fields: {},
      },
    ]

    render(
      <AssignmentSidebar
        assignments={assignments}
        lmsGroupSets={lmsGroupSets}
        students={students}
        selection={{ mode: "all-group-sets" }}
        onSelectAssignment={vi.fn()}
        onSelectAggregation={vi.fn()}
        onNew={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const allButton = screen.getByRole("button", { name: /all group sets/i })
    const unusedButton = screen.getByRole("button", {
      name: /unused group sets/i,
    })
    const unassignedButton = screen.getByRole("button", {
      name: /unassigned students/i,
    })

    expect(allButton).toHaveTextContent("2")
    expect(unusedButton).toHaveTextContent("1")
    expect(unassignedButton).toHaveTextContent("1")
  })
})
