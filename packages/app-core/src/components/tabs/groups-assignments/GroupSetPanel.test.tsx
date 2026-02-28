import type {
  ExportSettings,
  Group,
  GroupSet,
  OperationConfigs,
  ProfileSettings,
  Roster,
  RosterMember,
} from "@repo-edu/backend-interface/types"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useUiStore } from "../../../stores/uiStore"
import { GroupSetPanel } from "./GroupSetPanel"

vi.mock("../../../bindings/commands", () => ({
  commands: {
    syncGroupSet: vi.fn(),
    importGroupSetFromFile: vi.fn(),
    exportGroupSet: vi.fn(),
  },
}))

function createTestSettings(): ProfileSettings {
  const operations: OperationConfigs = {
    target_org: "",
    repo_name_template: "{assignment}-{group}",
    create: { template_org: "" },
    clone: { target_dir: "", directory_layout: "flat" },
    delete: {},
  }
  const exports: ExportSettings = {
    output_folder: "",
    output_csv: false,
    output_xlsx: false,
    output_yaml: false,
    csv_file: "repos.csv",
    xlsx_file: "repos.xlsx",
    yaml_file: "repos.yaml",
    member_option: "email",
    include_group: true,
    include_member: true,
    include_initials: false,
    full_groups: false,
  }

  return {
    course: { id: "course-1", name: "Course 1" },
    git_connection: null,
    operations,
    exports,
  }
}

function createStudent(id: string, name: string): RosterMember {
  return {
    id,
    name,
    email: `${id}@example.com`,
    student_number: null,
    git_username: null,
    git_username_status: "unknown",
    status: "active",
    lms_user_id: null,
    enrollment_type: "student",
    source: "local",
  }
}

function createRoster(): Roster {
  const groups: Group[] = [
    {
      id: "g-charlie",
      name: "Charlie Group",
      member_ids: ["s-1"],
      origin: "local",
      lms_group_id: null,
    },
    {
      id: "g-alpha",
      name: "Alpha Group",
      member_ids: ["s-1", "s-2"],
      origin: "local",
      lms_group_id: null,
    },
    {
      id: "g-beatrice",
      name: "Beatrice Group",
      member_ids: ["s-2"],
      origin: "local",
      lms_group_id: null,
    },
  ]
  const groupSet: GroupSet = {
    id: "gs-1",
    name: "Project Groups",
    group_ids: ["g-charlie", "g-alpha", "g-beatrice"],
    connection: null,
    group_selection: { kind: "all", excluded_group_ids: [] },
  }

  return {
    connection: null,
    students: [createStudent("s-1", "Alice"), createStudent("s-2", "Bob")],
    staff: [],
    groups,
    group_sets: [groupSet],
    assignments: [],
  }
}

function createLocalSetWithReadonlyGroup(): Roster {
  const group: Group = {
    id: "g-imported",
    name: "Imported Group",
    member_ids: ["s-1"],
    origin: "lms",
    lms_group_id: "canvas-group-1",
  }
  const groupSet: GroupSet = {
    id: "gs-readonly-local",
    name: "Editable Local Set",
    group_ids: ["g-imported"],
    connection: null,
    group_selection: { kind: "all", excluded_group_ids: [] },
  }

  return {
    connection: null,
    students: [createStudent("s-1", "Alice")],
    staff: [],
    groups: [group],
    group_sets: [groupSet],
    assignments: [],
  }
}

function getRenderedGroupNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".divide-y > div"))
    .map((row) => row.querySelector("button")?.textContent?.trim() ?? "")
    .filter(Boolean)
}

describe("GroupSetPanel sorting", () => {
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
    useProfileStore.getState().reset()
    useUiStore.getState().reset()

    useProfileStore.setState({
      document: {
        settings: createTestSettings(),
        roster: createRoster(),
        resolvedIdentityMode: "username",
      },
      status: "loaded",
    })
  })

  it("preserves alphabetical order within equal member counts", () => {
    const { container } = render(<GroupSetPanel groupSetId="gs-1" />)

    fireEvent.click(screen.getByRole("button", { name: "Group" }))
    expect(getRenderedGroupNames(container)).toEqual([
      "Alpha Group",
      "Beatrice Group",
      "Charlie Group",
    ])

    fireEvent.click(screen.getByRole("button", { name: "Members" }))
    expect(getRenderedGroupNames(container)).toEqual([
      "Beatrice Group",
      "Charlie Group",
      "Alpha Group",
    ])
  })

  it("requires a second click to confirm inline group removal", () => {
    useProfileStore.setState({
      document: {
        settings: createTestSettings(),
        roster: createLocalSetWithReadonlyGroup(),
        resolvedIdentityMode: "username",
      },
      status: "loaded",
    })

    render(<GroupSetPanel groupSetId="gs-readonly-local" />)

    const getGroupIds = () => {
      const roster = useProfileStore.getState().document?.roster

      expect(roster).not.toBeNull()
      if (!roster) {
        throw new Error("Roster is missing")
      }

      return roster.group_sets[0]?.group_ids
    }

    fireEvent.click(screen.getByRole("button", { name: "Remove from set" }))

    expect(getGroupIds()).toEqual(["g-imported"])
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument()

    const confirmButton = screen.getByRole("button", { name: "Confirm" })
    const confirmContainer = confirmButton.parentElement

    expect(confirmContainer).not.toBeNull()
    if (!confirmContainer) {
      throw new Error("Confirm button container is missing")
    }

    fireEvent.pointerLeave(confirmContainer)

    expect(getGroupIds()).toEqual(["g-imported"])
    expect(
      screen.queryByRole("button", { name: "Confirm" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Remove from set" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Remove from set" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    expect(getGroupIds()).toEqual([])
  })
})
