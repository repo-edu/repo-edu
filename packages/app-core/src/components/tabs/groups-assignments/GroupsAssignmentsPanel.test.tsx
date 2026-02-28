import type {
  ExportSettings,
  Group,
  GroupSet,
  OperationConfigs,
  ProfileSettings,
  Roster,
} from "@repo-edu/backend-interface/types"
import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { useAppSettingsStore } from "../../../stores/appSettingsStore"
import { useProfileStore } from "../../../stores/profileStore"
import { useUiStore } from "../../../stores/uiStore"
import { GroupsAssignmentsPanel } from "./GroupsAssignmentsPanel"

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

function createRoster(): Roster {
  const group: Group = {
    id: "g-1",
    name: "Project Team",
    member_ids: [],
    origin: "lms",
    lms_group_id: "canvas-group-1",
  }
  const groupSet: GroupSet = {
    id: "gs-1",
    name: "Project Groups",
    group_ids: ["g-1"],
    connection: {
      kind: "canvas",
      course_id: "course-1",
      group_set_id: "canvas-set-1",
      last_updated: "2026-02-28T10:00:00Z",
    },
    group_selection: { kind: "all", excluded_group_ids: [] },
  }

  return {
    connection: null,
    students: [],
    staff: [],
    groups: [group],
    group_sets: [groupSet],
    assignments: [],
  }
}

describe("GroupsAssignmentsPanel", () => {
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
    useUiStore.getState().reset()
    useProfileStore.getState().reset()
    useAppSettingsStore.getState().reset()
  })

  it("keeps rendering when undo removes the selected copied group set", async () => {
    useProfileStore.setState({
      document: {
        settings: createTestSettings(),
        roster: createRoster(),
        resolvedIdentityMode: "username",
      },
      status: "loaded",
    })

    const copyId = useProfileStore.getState().copyGroupSet("gs-1")
    expect(copyId).toBeTruthy()

    const selection = { kind: "group-set", id: copyId ?? "" } as const
    useUiStore.getState().setSidebarSelection(selection)

    render(<GroupsAssignmentsPanel selection={selection} />)

    expect(screen.getByRole("tab", { name: "Groups (1)" })).toBeInTheDocument()

    act(() => {
      useProfileStore.getState().undo()
    })

    expect(screen.getByText("Group set not found")).toBeInTheDocument()
    expect(
      screen.getByText("The selected group set no longer exists."),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(useUiStore.getState().sidebarSelection).toBeNull()
    })
  })
})
