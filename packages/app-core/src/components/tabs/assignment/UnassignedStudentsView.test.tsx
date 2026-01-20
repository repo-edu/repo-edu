import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { UnassignedStudentsView } from "./UnassignedStudentsView"

const baseStudent = {
  email: "student@example.com",
  git_username_status: "unknown" as const,
  custom_fields: {},
}

const baseGroupSet = {
  fetched_at: new Date().toISOString(),
  lms_group_set_id: null,
  kind: "linked" as const,
  filter: null,
  lms_type: "canvas" as const,
  base_url: "https://example.edu",
  course_id: "course-1",
}

describe("UnassignedStudentsView", () => {
  it("lists active students not present in cached groups", () => {
    const students = [
      {
        ...baseStudent,
        id: "s1",
        name: "Ada Lovelace",
        status: "active" as const,
      },
      {
        ...baseStudent,
        id: "s2",
        name: "Grace Hopper",
        status: "active" as const,
      },
      {
        ...baseStudent,
        id: "s3",
        name: "Alan Turing",
        status: "dropped" as const,
      },
    ]

    const groupSets = [
      {
        ...baseGroupSet,
        id: "set-1",
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
    ]

    render(<UnassignedStudentsView groupSets={groupSets} students={students} />)

    expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument()
    expect(screen.queryByText("Alan Turing")).not.toBeInTheDocument()
  })

  it("shows empty state when every active student is assigned", () => {
    const students = [
      {
        ...baseStudent,
        id: "s1",
        name: "Ada Lovelace",
        status: "active" as const,
      },
    ]

    const groupSets = [
      {
        ...baseGroupSet,
        id: "set-1",
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
    ]

    render(<UnassignedStudentsView groupSets={groupSets} students={students} />)

    expect(screen.getByText("All students are assigned")).toBeInTheDocument()
  })
})
