import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useProfileStore } from "../../../stores/profileStore"
import { UnusedGroupSetsView } from "./UnusedGroupSetsView"

const baseGroupSet = {
  fetched_at: new Date().toISOString(),
  lms_group_set_id: null,
  origin: "lms" as const,
  lms_type: "canvas" as const,
  base_url: "https://example.edu",
  course_id: "course-1",
}

describe("UnusedGroupSetsView", () => {
  beforeEach(() => {
    useProfileStore.getState().reset()
  })

  it("shows only group sets not linked to assignments", () => {
    const groupSets = [
      {
        ...baseGroupSet,
        id: "set-1",
        name: "Set 1",
        groups: [],
      },
      {
        ...baseGroupSet,
        id: "set-2",
        name: "Set 2",
        groups: [],
      },
    ]

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

    render(
      <UnusedGroupSetsView groupSets={groupSets} assignments={assignments} />,
    )

    expect(screen.getByText("Unused Group Sets")).toBeInTheDocument()
    expect(screen.getByText("1 unused")).toBeInTheDocument()
    expect(screen.getByText("Set 2")).toBeInTheDocument()
    expect(screen.queryByText("Set 1")).not.toBeInTheDocument()
  })
})
