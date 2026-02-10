import type {
  ExportSettings,
  Group,
  GroupSet,
  OperationConfigs,
  ProfileSettings,
  Roster,
  RosterMember,
} from "@repo-edu/backend-interface/types"
import { beforeEach, describe, expect, it } from "vitest"
import {
  selectAssignmentsForGroupSet,
  selectConnectedGroupSets,
  selectGroupById,
  selectGroupReferenceCount,
  selectGroupSets,
  selectGroupsForGroupSet,
  selectIsGroupEditable,
  selectIsGroupSetEditable,
  selectLocalGroupSets,
  selectRosterMemberById,
  selectRosterStaff,
  selectRosterStudents,
  selectStudents,
  selectSystemGroupSet,
  selectSystemSetsReady,
  useProfileStore,
} from "../profileStore"

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

const staffMember: RosterMember = {
  id: "staff-1",
  name: "Prof. X",
  email: "profx@example.com",
  student_number: null,
  git_username: null,
  git_username_status: "unknown",
  status: "active",
  lms_user_id: null,
  enrollment_type: "teacher",
  source: "lms",
}

const localGroup: Group = {
  id: "g-local",
  name: "Local Group",
  member_ids: ["m-1", "m-2"],
  origin: "local",
  lms_group_id: null,
}

const lmsGroup: Group = {
  id: "g-lms",
  name: "LMS Group",
  member_ids: ["m-1"],
  origin: "lms",
  lms_group_id: "lms-g-1",
}

const systemGroup: Group = {
  id: "sys-ind-m-1",
  name: "Alice",
  member_ids: ["m-1"],
  origin: "system",
  lms_group_id: null,
}

const localGroupSet: GroupSet = {
  id: "gs-local",
  name: "Local Set",
  group_ids: ["g-local"],
  connection: null,
  group_selection: { kind: "all", excluded_group_ids: [] },
}

const connectedGroupSet: GroupSet = {
  id: "gs-canvas",
  name: "Canvas Set",
  group_ids: ["g-lms"],
  connection: {
    kind: "canvas",
    course_id: "c1",
    group_set_id: "gs-canvas",
    last_updated: new Date().toISOString(),
  },
  group_selection: { kind: "all", excluded_group_ids: [] },
}

const systemGroupSet: GroupSet = {
  id: "sys-gs-individual",
  name: "Individual Students",
  group_ids: ["sys-ind-m-1"],
  connection: { kind: "system", system_type: "individual_students" },
  group_selection: { kind: "all", excluded_group_ids: [] },
}

function setupStore(roster: Roster) {
  useProfileStore.setState({
    document: {
      settings: createTestSettings(),
      roster,
      resolvedIdentityMode: "username",
    },
    status: "loaded",
  })
}

describe("Profile Store Selectors", () => {
  beforeEach(() => {
    useProfileStore.getState().reset()
  })

  describe("member selectors", () => {
    it("selectStudents returns all students from roster", () => {
      setupStore({
        connection: null,
        students: [student1, student2],
        staff: [staffMember],
        groups: [],
        group_sets: [],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectStudents(state)).toHaveLength(2)
    })

    it("selectRosterStudents filters to enrollment_type=student", () => {
      setupStore({
        connection: null,
        students: [student1, student2],
        staff: [staffMember],
        groups: [],
        group_sets: [],
        assignments: [],
      })

      const state = useProfileStore.getState()
      const students = selectRosterStudents(state)
      expect(students).toHaveLength(2)
      expect(students.every((s) => s.enrollment_type === "student")).toBe(true)
    })

    it("selectRosterStaff returns staff members", () => {
      setupStore({
        connection: null,
        students: [student1],
        staff: [staffMember],
        groups: [],
        group_sets: [],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectRosterStaff(state)).toHaveLength(1)
      expect(selectRosterStaff(state)[0].name).toBe("Prof. X")
    })

    it("selectRosterMemberById finds member in students", () => {
      setupStore({
        connection: null,
        students: [student1, student2],
        staff: [staffMember],
        groups: [],
        group_sets: [],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectRosterMemberById("m-1")(state)?.name).toBe("Alice")
    })

    it("selectRosterMemberById finds member in staff", () => {
      setupStore({
        connection: null,
        students: [student1],
        staff: [staffMember],
        groups: [],
        group_sets: [],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectRosterMemberById("staff-1")(state)?.name).toBe("Prof. X")
    })

    it("selectRosterMemberById returns null for unknown", () => {
      setupStore({
        connection: null,
        students: [student1],
        staff: [],
        groups: [],
        group_sets: [],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectRosterMemberById("nonexistent")(state)).toBeNull()
    })
  })

  describe("group selectors", () => {
    it("selectGroupById finds a group", () => {
      setupStore({
        connection: null,
        students: [student1],
        staff: [],
        groups: [localGroup, lmsGroup],
        group_sets: [localGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectGroupById("g-local")(state)?.name).toBe("Local Group")
      expect(selectGroupById("nonexistent")(state)).toBeNull()
    })

    it("selectGroupsForGroupSet resolves groups by ID", () => {
      setupStore({
        connection: null,
        students: [student1, student2],
        staff: [],
        groups: [localGroup, lmsGroup],
        group_sets: [localGroupSet, connectedGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      const groups = selectGroupsForGroupSet("gs-local")(state)
      expect(groups).toHaveLength(1)
      expect(groups[0].name).toBe("Local Group")
    })

    it("selectIsGroupEditable returns true for local groups", () => {
      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [localGroup, lmsGroup, systemGroup],
        group_sets: [],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectIsGroupEditable("g-local")(state)).toBe(true)
      expect(selectIsGroupEditable("g-lms")(state)).toBe(false)
      expect(selectIsGroupEditable("sys-ind-m-1")(state)).toBe(false)
    })

    it("selectGroupReferenceCount counts sets referencing a group", () => {
      const sharedGroupSet: GroupSet = {
        id: "gs-shared",
        name: "Shared Set",
        group_ids: ["g-local"],
        connection: null,
        group_selection: { kind: "all", excluded_group_ids: [] },
      }

      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [localGroup, lmsGroup],
        group_sets: [localGroupSet, sharedGroupSet, connectedGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      // g-local is in localGroupSet and sharedGroupSet
      expect(selectGroupReferenceCount("g-local")(state)).toBe(2)
      // g-lms is only in connectedGroupSet
      expect(selectGroupReferenceCount("g-lms")(state)).toBe(1)
    })
  })

  describe("group set selectors", () => {
    it("selectGroupSets returns all group sets", () => {
      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [localGroup, lmsGroup, systemGroup],
        group_sets: [localGroupSet, connectedGroupSet, systemGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectGroupSets(state)).toHaveLength(3)
    })

    it("selectIsGroupSetEditable differentiates by connection type", () => {
      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [],
        group_sets: [localGroupSet, connectedGroupSet, systemGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      expect(selectIsGroupSetEditable("gs-local")(state)).toBe(true)
      expect(selectIsGroupSetEditable("gs-canvas")(state)).toBe(true)
      expect(selectIsGroupSetEditable("sys-gs-individual")(state)).toBe(false)
    })

    it("selectSystemGroupSet finds system group sets", () => {
      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [systemGroup],
        group_sets: [localGroupSet, systemGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      const indGS = selectSystemGroupSet("individual_students")(state)
      expect(indGS?.id).toBe("sys-gs-individual")
      expect(selectSystemGroupSet("staff")(state)).toBeNull()
    })

    it("selectConnectedGroupSets returns non-system connected sets", () => {
      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [],
        group_sets: [localGroupSet, connectedGroupSet, systemGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      const connected = selectConnectedGroupSets(state)
      expect(connected).toHaveLength(1)
      expect(connected[0].id).toBe("gs-canvas")
    })

    it("selectLocalGroupSets returns sets with null connection", () => {
      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [],
        group_sets: [localGroupSet, connectedGroupSet, systemGroupSet],
        assignments: [],
      })

      const state = useProfileStore.getState()
      const local = selectLocalGroupSets(state)
      expect(local).toHaveLength(1)
      expect(local[0].id).toBe("gs-local")
    })

    it("selectAssignmentsForGroupSet returns assignments using that set", () => {
      setupStore({
        connection: null,
        students: [],
        staff: [],
        groups: [localGroup],
        group_sets: [localGroupSet, connectedGroupSet],
        assignments: [
          {
            id: "a-1",
            name: "A1",
            group_set_id: "gs-local",
          },
          {
            id: "a-2",
            name: "A2",
            group_set_id: "gs-canvas",
          },
          {
            id: "a-3",
            name: "A3",
            group_set_id: "gs-local",
          },
        ],
      })

      const state = useProfileStore.getState()
      const forLocal = selectAssignmentsForGroupSet("gs-local")(state)
      expect(forLocal).toHaveLength(2)
      expect(forLocal.map((a) => a.id)).toEqual(["a-1", "a-3"])
    })

    it("selectSystemSetsReady reflects state", () => {
      const state = useProfileStore.getState()
      expect(selectSystemSetsReady(state)).toBe(false)

      useProfileStore.setState({ systemSetsReady: true })
      expect(selectSystemSetsReady(useProfileStore.getState())).toBe(true)
    })
  })
})
