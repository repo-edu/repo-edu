import type {
  ExportSettings,
  Group,
  GroupSet,
  OperationConfigs,
  ProfileSettings,
  Roster,
  RosterMember,
} from "@repo-edu/backend-interface/types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useProfileStore } from "../profileStore"

function createTestSettings(): ProfileSettings {
  const ops: OperationConfigs = {
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
    course: { id: "c1", name: "Course 1" },
    git_connection: null,
    operations: ops,
    exports,
  }
}

function emptyRoster(): Roster {
  return {
    connection: null,
    students: [],
    staff: [],
    groups: [],
    group_sets: [],
    assignments: [],
  }
}

const student1: RosterMember = {
  id: "m-1",
  name: "Alice",
  email: "alice@example.com",
  student_number: null,
  git_username: null,
  git_username_status: "unknown",
  status: "active",
  lms_user_id: null,
  enrollment_type: "student",
  source: "lms",
}

const student2: RosterMember = {
  id: "m-2",
  name: "Bob",
  email: "bob@example.com",
  student_number: null,
  git_username: null,
  git_username_status: "unknown",
  status: "active",
  lms_user_id: null,
  enrollment_type: "student",
  source: "lms",
}

function setupStore(roster?: Roster) {
  useProfileStore.setState({
    document: {
      settings: createTestSettings(),
      roster: roster ?? emptyRoster(),
      resolvedIdentityMode: "username",
    },
    status: "loaded",
  })
}

describe("Profile Store Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProfileStore.getState().reset()
  })

  describe("createLocalGroupSet", () => {
    it("creates a new local group set", () => {
      setupStore()
      const id = useProfileStore.getState().createLocalGroupSet("My Set")
      expect(id).toBeTruthy()

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.group_sets).toHaveLength(1)
      expect(roster?.group_sets[0].name).toBe("My Set")
      expect(roster?.group_sets[0].connection).toBeNull()
      expect(roster?.group_sets[0].group_ids).toEqual([])
    })

    it("returns null for empty name", () => {
      setupStore()
      const id = useProfileStore.getState().createLocalGroupSet("   ")
      expect(id).toBeNull()
    })
  })

  describe("copyGroupSet", () => {
    it("copies an existing group set with shared group refs", () => {
      const group: Group = {
        id: "g-1",
        name: "Group A",
        member_ids: ["m-1"],
        origin: "local",
        lms_group_id: null,
      }
      const gs: GroupSet = {
        id: "gs-1",
        name: "Original",
        group_ids: ["g-1"],
        connection: null,
      }
      setupStore({
        ...emptyRoster(),
        groups: [group],
        group_sets: [gs],
      })

      const copyId = useProfileStore.getState().copyGroupSet("gs-1")
      expect(copyId).toBeTruthy()

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.group_sets).toHaveLength(2)

      const copy = roster?.group_sets.find((s) => s.id === copyId)
      expect(copy?.name).toBe("Original (copy)")
      expect(copy?.group_ids).toEqual(["g-1"]) // same ref
      expect(copy?.connection).toBeNull()
    })

    it("returns null for nonexistent group set", () => {
      setupStore()
      const id = useProfileStore.getState().copyGroupSet("nonexistent")
      expect(id).toBeNull()
    })
  })

  describe("deleteGroupSet", () => {
    it("removes group set and orphaned groups", () => {
      const group1: Group = {
        id: "g-1",
        name: "Only in set 1",
        member_ids: ["m-1"],
        origin: "local",
        lms_group_id: null,
      }
      const group2: Group = {
        id: "g-2",
        name: "In both sets",
        member_ids: ["m-2"],
        origin: "local",
        lms_group_id: null,
      }
      const gs1: GroupSet = {
        id: "gs-1",
        name: "Set 1",
        group_ids: ["g-1", "g-2"],
        connection: null,
      }
      const gs2: GroupSet = {
        id: "gs-2",
        name: "Set 2",
        group_ids: ["g-2"],
        connection: null,
      }

      setupStore({
        ...emptyRoster(),
        groups: [group1, group2],
        group_sets: [gs1, gs2],
      })

      useProfileStore.getState().deleteGroupSet("gs-1")

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.group_sets).toHaveLength(1)
      expect(roster?.group_sets[0].id).toBe("gs-2")
      // g-1 was only in gs-1, so it should be removed
      expect(roster?.groups.find((g) => g.id === "g-1")).toBeUndefined()
      // g-2 is still in gs-2, so it should remain
      expect(roster?.groups.find((g) => g.id === "g-2")).toBeDefined()
    })

    it("does not delete system group sets", () => {
      const systemGs: GroupSet = {
        id: "sys-gs",
        name: "System",
        group_ids: [],
        connection: { kind: "system", system_type: "individual_students" },
      }
      setupStore({
        ...emptyRoster(),
        group_sets: [systemGs],
      })

      useProfileStore.getState().deleteGroupSet("sys-gs")

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.group_sets).toHaveLength(1) // unchanged
    })
  })

  describe("createGroup", () => {
    it("creates a group and adds to group set", () => {
      const gs: GroupSet = {
        id: "gs-1",
        name: "Set 1",
        group_ids: [],
        connection: null,
      }
      setupStore({
        ...emptyRoster(),
        students: [student1, student2],
        group_sets: [gs],
      })

      const groupId = useProfileStore
        .getState()
        .createGroup("gs-1", "Team Alpha", ["m-1", "m-2"])
      expect(groupId).toBeTruthy()

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.groups).toHaveLength(1)
      expect(roster?.groups[0].name).toBe("Team Alpha")
      expect(roster?.groups[0].origin).toBe("local")
      expect(roster?.groups[0].member_ids).toEqual(["m-1", "m-2"])
      expect(roster?.group_sets[0].group_ids).toContain(groupId)
    })
  })

  describe("deleteGroup", () => {
    it("removes group from all group sets", () => {
      const group: Group = {
        id: "g-1",
        name: "Group A",
        member_ids: ["m-1"],
        origin: "local",
        lms_group_id: null,
      }
      const gs1: GroupSet = {
        id: "gs-1",
        name: "Set 1",
        group_ids: ["g-1"],
        connection: null,
      }
      const gs2: GroupSet = {
        id: "gs-2",
        name: "Set 2",
        group_ids: ["g-1"],
        connection: null,
      }

      setupStore({
        ...emptyRoster(),
        groups: [group],
        group_sets: [gs1, gs2],
      })

      useProfileStore.getState().deleteGroup("g-1")

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.groups).toHaveLength(0)
      expect(roster?.group_sets[0].group_ids).toEqual([])
      expect(roster?.group_sets[1].group_ids).toEqual([])
    })
  })

  describe("updateGroup", () => {
    it("updates a local group", () => {
      const group: Group = {
        id: "g-1",
        name: "Old Name",
        member_ids: ["m-1"],
        origin: "local",
        lms_group_id: null,
      }
      setupStore({
        ...emptyRoster(),
        groups: [group],
      })

      useProfileStore.getState().updateGroup("g-1", { name: "New Name" })

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.groups[0].name).toBe("New Name")
    })

    it("does not update a non-local group", () => {
      const group: Group = {
        id: "g-lms",
        name: "LMS Group",
        member_ids: ["m-1"],
        origin: "lms",
        lms_group_id: "lms-1",
      }
      setupStore({
        ...emptyRoster(),
        groups: [group],
      })

      useProfileStore.getState().updateGroup("g-lms", { name: "Changed" })

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.groups[0].name).toBe("LMS Group")
    })
  })

  describe("createAssignment", () => {
    it("creates an assignment with generated ID", () => {
      const gs: GroupSet = {
        id: "gs-1",
        name: "Set 1",
        group_ids: [],
        connection: null,
      }
      setupStore({
        ...emptyRoster(),
        group_sets: [gs],
      })

      const id = useProfileStore.getState().createAssignment({
        name: "lab-1",
        description: "Lab 1",
        group_set_id: "gs-1",
        group_selection: { kind: "all", excluded_group_ids: [] },
      })

      expect(id).toBeTruthy()
      expect(id).toHaveLength(21)

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.assignments).toHaveLength(1)
      expect(roster?.assignments[0].id).toBe(id)
      expect(roster?.assignments[0].name).toBe("lab-1")
    })

    it("selects the assignment when select option is true", () => {
      setupStore()

      const id = useProfileStore.getState().createAssignment(
        {
          name: "lab-1",
          group_set_id: "gs-1",
          group_selection: { kind: "all", excluded_group_ids: [] },
        },
        { select: true },
      )

      const selection = useProfileStore.getState().assignmentSelection
      expect(selection).toEqual({ mode: "assignment", id })
    })
  })

  describe("updateAssignment — exclusion clearing", () => {
    it("clears exclusions when group_set_id changes with option", () => {
      setupStore({
        ...emptyRoster(),
        group_sets: [
          {
            id: "gs-1",
            name: "Set 1",
            group_ids: [],
            connection: null,
          },
          {
            id: "gs-2",
            name: "Set 2",
            group_ids: [],
            connection: null,
          },
        ],
        assignments: [
          {
            id: "a-1",
            name: "A1",
            group_set_id: "gs-1",
            group_selection: {
              kind: "all",
              excluded_group_ids: ["g-excluded"],
            },
          },
        ],
      })

      useProfileStore
        .getState()
        .updateAssignment(
          "a-1",
          { group_set_id: "gs-2" },
          { clearExclusionsOnGroupSetChange: true },
        )

      const a = useProfileStore.getState().document?.roster?.assignments[0]
      expect(a?.group_set_id).toBe("gs-2")
      expect(a?.group_selection).toEqual({
        kind: "all",
        excluded_group_ids: [],
      })
    })

    it("does not clear exclusions when group_set_id stays the same", () => {
      setupStore({
        ...emptyRoster(),
        group_sets: [
          {
            id: "gs-1",
            name: "Set 1",
            group_ids: [],
            connection: null,
          },
        ],
        assignments: [
          {
            id: "a-1",
            name: "A1",
            group_set_id: "gs-1",
            group_selection: {
              kind: "all",
              excluded_group_ids: ["g-excluded"],
            },
          },
        ],
      })

      useProfileStore
        .getState()
        .updateAssignment(
          "a-1",
          { name: "A1-updated" },
          { clearExclusionsOnGroupSetChange: true },
        )

      const a = useProfileStore.getState().document?.roster?.assignments[0]
      expect(a?.name).toBe("A1-updated")
      expect(a?.group_selection.excluded_group_ids).toEqual(["g-excluded"])
    })
  })

  describe("deleteAssignment", () => {
    it("removes assignment and resets selection", () => {
      setupStore({
        ...emptyRoster(),
        assignments: [
          {
            id: "a-1",
            name: "A1",
            group_set_id: "gs-1",
            group_selection: { kind: "all", excluded_group_ids: [] },
          },
          {
            id: "a-2",
            name: "A2",
            group_set_id: "gs-1",
            group_selection: { kind: "all", excluded_group_ids: [] },
          },
        ],
      })

      // Select a-1
      useProfileStore
        .getState()
        .setAssignmentSelection({ mode: "assignment", id: "a-1" })

      // Delete a-1
      useProfileStore.getState().deleteAssignment("a-1")

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.assignments).toHaveLength(1)
      expect(roster?.assignments[0].id).toBe("a-2")

      // Selection should reset to first remaining assignment
      const selection = useProfileStore.getState().assignmentSelection
      expect(selection).toEqual({ mode: "assignment", id: "a-2" })
    })

    it("removeAssignment backward compat alias works", () => {
      setupStore({
        ...emptyRoster(),
        assignments: [
          {
            id: "a-1",
            name: "A1",
            group_set_id: "gs-1",
            group_selection: { kind: "all", excluded_group_ids: [] },
          },
        ],
      })

      useProfileStore.getState().removeAssignment("a-1")

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.assignments).toHaveLength(0)
    })
  })

  describe("renameGroupSet", () => {
    it("renames a local group set", () => {
      setupStore({
        ...emptyRoster(),
        group_sets: [
          {
            id: "gs-1",
            name: "Old Name",
            group_ids: [],
            connection: null,
          },
        ],
      })

      useProfileStore.getState().renameGroupSet("gs-1", "New Name")

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.group_sets[0].name).toBe("New Name")
    })

    it("does not rename system group sets", () => {
      setupStore({
        ...emptyRoster(),
        group_sets: [
          {
            id: "sys-gs",
            name: "Individual Students",
            group_ids: [],
            connection: {
              kind: "system",
              system_type: "individual_students",
            },
          },
        ],
      })

      useProfileStore.getState().renameGroupSet("sys-gs", "Changed")

      const roster = useProfileStore.getState().document?.roster
      expect(roster?.group_sets[0].name).toBe("Individual Students")
    })
  })

  describe("addGroupToSet / removeGroupFromSet", () => {
    it("adds and removes group references", () => {
      const group: Group = {
        id: "g-1",
        name: "Group A",
        member_ids: [],
        origin: "local",
        lms_group_id: null,
      }
      setupStore({
        ...emptyRoster(),
        groups: [group],
        group_sets: [
          {
            id: "gs-1",
            name: "Set 1",
            group_ids: [],
            connection: null,
          },
        ],
      })

      useProfileStore.getState().addGroupToSet("gs-1", "g-1")
      expect(
        useProfileStore.getState().document?.roster?.group_sets[0].group_ids,
      ).toEqual(["g-1"])

      // Adding again should not duplicate
      useProfileStore.getState().addGroupToSet("gs-1", "g-1")
      expect(
        useProfileStore.getState().document?.roster?.group_sets[0].group_ids,
      ).toEqual(["g-1"])

      useProfileStore.getState().removeGroupFromSet("gs-1", "g-1")
      expect(
        useProfileStore.getState().document?.roster?.group_sets[0].group_ids,
      ).toEqual([])
    })
  })
})
