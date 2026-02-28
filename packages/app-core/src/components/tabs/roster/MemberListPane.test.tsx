import type { Roster, RosterMember } from "@repo-edu/backend-interface/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useConnectionsStore } from "../../../stores/connectionsStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useUiStore } from "../../../stores/uiStore"
import { MemberListPane } from "./MemberListPane"

vi.mock("../../../bindings/commands", () => ({
  commands: {
    verifyProfileCourse: vi.fn(),
  },
}))

function createMember(
  id: string,
  name: string,
  enrollmentType: RosterMember["enrollment_type"],
  source: RosterMember["source"],
): RosterMember {
  return {
    id,
    name,
    email: `${id}@example.com`,
    student_number: null,
    git_username: null,
    git_username_status: "unknown",
    status: "active",
    lms_user_id: source === "lms" ? `${id}-lms` : null,
    enrollment_type: enrollmentType,
    source,
  }
}

function createRoster(): Roster {
  return {
    connection: null,
    students: [
      createMember("s-1", "Aaron Student", "student", "lms"),
      createMember("s-2", "Charlie Student", "student", "lms"),
      createMember("s-3", "Beatrice Student", "student", "local"),
    ],
    staff: [createMember("t-1", "Ava Staff", "teacher", "lms")],
    groups: [],
    group_sets: [],
    assignments: [],
  }
}

function getRenderedNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("tbody tr"))
    .map((row) => row.querySelector("td")?.textContent?.trim() ?? "")
    .filter(Boolean)
}

describe("MemberListPane sorting", () => {
  beforeAll(() => {
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useAppSettingsStore.getState().reset()
    useConnectionsStore.getState().resetAllStatuses()
    useProfileStore.getState().reset()
    useUiStore.getState().reset()
  })

  it("keeps student names sorted when switching from name sort to role sort", () => {
    const { container } = render(
      <MemberListPane
        roster={createRoster()}
        importing={false}
        canImportFromLms={false}
        lmsImportTooltip=""
        hasLmsConnection={false}
        onImportFromLms={() => {}}
        onImportFromFile={() => {}}
        onClear={() => {}}
        onExport={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Name" }))
    expect(getRenderedNames(container)).toEqual([
      "Aaron Student",
      "Ava Staff",
      "Beatrice Student",
      "Charlie Student",
    ])

    fireEvent.click(screen.getByRole("button", { name: "Role" }))
    expect(getRenderedNames(container)).toEqual([
      "Aaron Student",
      "Beatrice Student",
      "Charlie Student",
      "Ava Staff",
    ])
  })

  it("uses name as the tie-breaker when role is the first sort", () => {
    const { container } = render(
      <MemberListPane
        roster={createRoster()}
        importing={false}
        canImportFromLms={false}
        lmsImportTooltip=""
        hasLmsConnection={false}
        onImportFromLms={() => {}}
        onImportFromFile={() => {}}
        onClear={() => {}}
        onExport={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Role" }))

    expect(getRenderedNames(container)).toEqual([
      "Aaron Student",
      "Beatrice Student",
      "Charlie Student",
      "Ava Staff",
    ])
  })
})
