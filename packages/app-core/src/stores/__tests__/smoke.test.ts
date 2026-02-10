/**
 * Smoke tests for the stores.
 * These tests verify basic functionality without mocking Tauri commands.
 */

import type {
  ExportSettings,
  OperationConfigs,
  ProfileSettings,
  Roster,
  RosterMember,
} from "@repo-edu/backend-interface/types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  generateAssignmentId,
  generateGroupId,
  generateMemberId,
  generateStudentId,
} from "../../utils/nanoid"
import { useAppSettingsStore } from "../appSettingsStore"
import { useConnectionsStore } from "../connectionsStore"
import { useOperationStore } from "../operationStore"
import { useOutputStore } from "../outputStore"
import { useProfileStore } from "../profileStore"
import { useUiStore } from "../uiStore"

// Test fixture for ProfileSettings
function createTestSettings(
  overrides: Partial<ProfileSettings> = {},
): ProfileSettings {
  const defaultOperations: OperationConfigs = {
    target_org: "",
    repo_name_template: "{assignment}-{group}",
    create: { template_org: "" },
    clone: { target_dir: "", directory_layout: "flat" },
    delete: {},
  }
  const defaultExports: ExportSettings = {
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
    course: { id: "", name: "" },
    git_connection: null,
    operations: defaultOperations,
    exports: defaultExports,
    ...overrides,
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

describe("Store Smoke Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset all stores to initial state
    useAppSettingsStore.getState().reset()
    useProfileStore.getState().reset()
    useConnectionsStore.getState().resetAllStatuses()
    useOperationStore.getState().reset()
    useOutputStore.getState().clear()
    useUiStore.getState().reset()
  })

  describe("appSettingsStore", () => {
    it("smoke: initializes with correct defaults", () => {
      const state = useAppSettingsStore.getState()
      expect(state.status).toBe("loading")
      expect(state.theme).toBe("system")
      expect(state.lmsConnection).toBeNull()
      expect(state.gitConnections).toEqual({})
    })

    it("smoke: setTheme updates theme", () => {
      useAppSettingsStore.getState().setTheme("dark")
      expect(useAppSettingsStore.getState().theme).toBe("dark")
    })

    it("smoke: addGitConnection adds a connection", () => {
      const connection = {
        server_type: "GitHub" as const,
        connection: {
          access_token: "token",
          base_url: null,
          user: "user",
        },
        identity_mode: null,
      }
      useAppSettingsStore.getState().addGitConnection("test", connection)
      expect(useAppSettingsStore.getState().gitConnections.test).toEqual(
        connection,
      )
    })

    it("smoke: removeGitConnection removes a connection", () => {
      const connection = {
        server_type: "GitHub" as const,
        connection: {
          access_token: "token",
          base_url: null,
          user: "user",
        },
        identity_mode: null,
      }
      useAppSettingsStore.getState().addGitConnection("test", connection)
      useAppSettingsStore.getState().removeGitConnection("test")
      expect(useAppSettingsStore.getState().gitConnections.test).toBeUndefined()
    })
  })

  describe("profileStore", () => {
    it("smoke: initializes with correct defaults", () => {
      const state = useProfileStore.getState()
      expect(state.status).toBe("empty")
      expect(state.document).toBeNull()
    })

    it("smoke: setGitConnection updates git connection reference", () => {
      useProfileStore.setState({
        document: {
          settings: createTestSettings(),
          roster: null,
          resolvedIdentityMode: "email",
        },
        status: "loaded",
      })
      useProfileStore.getState().setGitConnection("my-github")
      expect(useProfileStore.getState().document?.settings.git_connection).toBe(
        "my-github",
      )
    })

    it("smoke: addMember creates roster and adds member", () => {
      useProfileStore.setState({
        document: {
          settings: createTestSettings(),
          roster: null,
          resolvedIdentityMode: "email",
        },
        status: "loaded",
      })

      const member: RosterMember = {
        id: generateMemberId(),
        name: "Test Student",
        email: "test@example.com",
        student_number: null,
        git_username: null,
        git_username_status: "unknown",
        status: "active",
        lms_user_id: null,
        enrollment_type: "student",
        source: "local",
      }
      useProfileStore.getState().addMember(member)

      const state = useProfileStore.getState()
      expect(state.document?.roster?.students).toHaveLength(1)
      expect(state.document?.roster?.students[0]).toEqual(member)
    })

    it("smoke: addStudent backward compat alias works", () => {
      useProfileStore.setState({
        document: {
          settings: createTestSettings(),
          roster: null,
          resolvedIdentityMode: "email",
        },
        status: "loaded",
      })

      const member: RosterMember = {
        id: generateMemberId(),
        name: "Test Student",
        email: "test@example.com",
        student_number: null,
        git_username: null,
        git_username_status: "unknown",
        status: "active",
        lms_user_id: null,
        enrollment_type: "student",
        source: "local",
      }
      useProfileStore.getState().addStudent(member)

      const state = useProfileStore.getState()
      expect(state.document?.roster?.students).toHaveLength(1)
    })

    it("smoke: removeMember removes member and cascades to groups", () => {
      const memberId = generateMemberId()
      const groupId = generateGroupId()

      useProfileStore.setState({
        document: {
          settings: createTestSettings(),
          roster: {
            connection: null,
            students: [
              {
                id: memberId,
                name: "Test",
                email: "test@example.com",
                student_number: null,
                git_username: null,
                git_username_status: "unknown",
                status: "active",
                lms_user_id: null,
                enrollment_type: "student",
                source: "local",
              },
            ],
            staff: [],
            groups: [
              {
                id: groupId,
                name: "Group 1",
                member_ids: [memberId],
                origin: "local",
                lms_group_id: null,
              },
            ],
            group_sets: [
              {
                id: "gs-1",
                name: "Set 1",
                group_ids: [groupId],
                connection: null,
                group_selection: { kind: "all", excluded_group_ids: [] },
              },
            ],
            assignments: [
              {
                id: "a-1",
                name: "Assignment 1",
                group_set_id: "gs-1",
              },
            ],
          },
          resolvedIdentityMode: "email",
        },
        status: "loaded",
      })

      useProfileStore.getState().removeMember(memberId)

      const state = useProfileStore.getState()
      expect(state.document?.roster?.students).toHaveLength(0)
      expect(state.document?.roster?.groups[0].member_ids).toHaveLength(0)
    })

    it("smoke: selectAssignment updates selection", () => {
      const assignmentId = generateAssignmentId()
      useProfileStore.getState().selectAssignment(assignmentId)
      const selection = useProfileStore.getState().assignmentSelection
      expect(selection).toEqual({ mode: "assignment", id: assignmentId })
    })

    it("smoke: setAssignmentSelection updates selection", () => {
      const assignmentId = generateAssignmentId()
      useProfileStore
        .getState()
        .setAssignmentSelection({ mode: "assignment", id: assignmentId })
      const selection = useProfileStore.getState().assignmentSelection
      expect(selection).toEqual({ mode: "assignment", id: assignmentId })
    })

    it("smoke: default selection prefers assignments", () => {
      const assignmentId = generateAssignmentId()
      const roster: Roster = {
        connection: null,
        students: [],
        staff: [],
        groups: [],
        group_sets: [
          {
            id: "gs-1",
            name: "Set 1",
            group_ids: [],
            connection: null,
            group_selection: { kind: "all", excluded_group_ids: [] },
          },
        ],
        assignments: [
          {
            id: assignmentId,
            name: "Assignment 1",
            group_set_id: "gs-1",
          },
        ],
      }

      useProfileStore.getState().setDocument({
        settings: createTestSettings(),
        roster,
        resolvedIdentityMode: "username",
      })

      const selection = useProfileStore.getState().assignmentSelection
      expect(selection).toEqual({ mode: "assignment", id: assignmentId })
    })

    it("smoke: default selection is null when no assignments", () => {
      const roster: Roster = {
        connection: null,
        students: [],
        staff: [],
        groups: [],
        group_sets: [
          {
            id: "gs-1",
            name: "Set 1",
            group_ids: [],
            connection: null,
            group_selection: { kind: "all", excluded_group_ids: [] },
          },
        ],
        assignments: [],
      }

      useProfileStore.getState().setDocument({
        settings: createTestSettings(),
        roster,
        resolvedIdentityMode: "username",
      })

      const selection = useProfileStore.getState().assignmentSelection
      expect(selection).toBeNull()
    })

    it("smoke: default selection is null when roster is empty", () => {
      const roster: Roster = emptyRoster()

      useProfileStore.getState().setDocument({
        settings: createTestSettings(),
        roster,
        resolvedIdentityMode: "username",
      })

      const selection = useProfileStore.getState().assignmentSelection
      expect(selection).toBeNull()
    })

    it("smoke: save restores loaded status on failure", async () => {
      useProfileStore.setState({
        document: {
          settings: createTestSettings(),
          roster: emptyRoster(),
          resolvedIdentityMode: "username",
        },
        status: "loaded",
      })

      // save will fail because commands.saveProfileAndRoster is not mocked
      // but we can verify the status is restored to "loaded" not "error"
      const result = await useProfileStore.getState().save("test-profile")
      expect(result).toBe(false)
      expect(useProfileStore.getState().status).toBe("loaded")
    })
  })

  describe("connectionsStore", () => {
    it("smoke: initializes with disconnected status", () => {
      const state = useConnectionsStore.getState()
      expect(state.lmsStatus).toBe("disconnected")
      expect(state.gitStatuses).toEqual({})
    })

    it("smoke: resetLmsStatus resets to disconnected", () => {
      useConnectionsStore.setState({ lmsStatus: "connected" })
      useConnectionsStore.getState().resetLmsStatus()
      expect(useConnectionsStore.getState().lmsStatus).toBe("disconnected")
    })
  })

  describe("operationStore", () => {
    it("smoke: initializes with create selected", () => {
      const state = useOperationStore.getState()
      expect(state.selected).toBe("create")
      expect(state.status).toBe("idle")
    })

    it("smoke: setSelected changes operation", () => {
      useOperationStore.getState().setSelected("clone")
      expect(useOperationStore.getState().selected).toBe("clone")
    })
  })

  describe("outputStore", () => {
    it("smoke: initializes with empty lines", () => {
      const state = useOutputStore.getState()
      expect(state.lines).toEqual([])
    })

    it("smoke: append adds a line", () => {
      useOutputStore.getState().append({ message: "Test", level: "info" })
      expect(useOutputStore.getState().lines).toHaveLength(1)
      expect(useOutputStore.getState().lines[0].message).toBe("Test")
    })

    it("smoke: clear removes all lines", () => {
      useOutputStore.getState().append({ message: "Test", level: "info" })
      useOutputStore.getState().clear()
      expect(useOutputStore.getState().lines).toHaveLength(0)
    })

    it("smoke: updateLastLine replaces info line", () => {
      useOutputStore.getState().append({ message: "Progress 1", level: "info" })
      useOutputStore
        .getState()
        .updateLastLine({ message: "Progress 2", level: "info" })
      expect(useOutputStore.getState().lines).toHaveLength(1)
      expect(useOutputStore.getState().lines[0].message).toBe("Progress 2")
    })

    it("smoke: updateLastLine appends after success line", () => {
      useOutputStore.getState().append({ message: "Done", level: "success" })
      useOutputStore
        .getState()
        .updateLastLine({ message: "Progress", level: "info" })
      expect(useOutputStore.getState().lines).toHaveLength(2)
    })
  })

  describe("uiStore", () => {
    it("smoke: initializes with roster tab", () => {
      const state = useUiStore.getState()
      expect(state.activeTab).toBe("roster")
      expect(state.activeProfile).toBeNull()
    })

    it("smoke: setActiveTab changes tab", () => {
      useUiStore.getState().setActiveTab("operation")
      expect(useUiStore.getState().activeTab).toBe("operation")
    })

    it("smoke: setActiveProfile updates profile", () => {
      useUiStore.getState().setActiveProfile("my-profile")
      expect(useUiStore.getState().activeProfile).toBe("my-profile")
    })

    it("smoke: setSidebarSelection updates sidebar selection", () => {
      useUiStore
        .getState()
        .setSidebarSelection({ kind: "group-set", id: "gs-1" })
      expect(useUiStore.getState().sidebarSelection).toEqual({
        kind: "group-set",
        id: "gs-1",
      })
    })
  })

  describe("ID generation", () => {
    it("smoke: generates valid 21-char URL-safe IDs", () => {
      const studentId = generateStudentId()
      const assignmentId = generateAssignmentId()
      const groupId = generateGroupId()

      expect(studentId).toHaveLength(21)
      expect(assignmentId).toHaveLength(21)
      expect(groupId).toHaveLength(21)

      // Check URL-safe characters
      const urlSafePattern = /^[0-9A-Za-z_-]+$/
      expect(studentId).toMatch(urlSafePattern)
      expect(assignmentId).toMatch(urlSafePattern)
      expect(groupId).toMatch(urlSafePattern)
    })

    it("smoke: generates unique IDs", () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateStudentId())
      }
      expect(ids.size).toBe(100)
    })

    it("smoke: generateMemberId returns valid ID", () => {
      const id = generateMemberId()
      expect(id).toHaveLength(21)
      expect(id).toMatch(/^[0-9A-Za-z_-]+$/)
    })
  })
})
