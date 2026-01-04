/**
 * Smoke tests for the new roster-centric stores.
 * These tests verify basic functionality without mocking Tauri commands.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAppSettingsStore } from "../appSettingsStore"
import { useConnectionsStore } from "../connectionsStore"
import { useOperationStore } from "../operationStore"
import { useOutputStore } from "../outputStore"
import { useProfileSettingsStore } from "../profileSettingsStore"
import { useRosterStore } from "../rosterStore"
import { useUiStore } from "../uiStore"
import {
  generateStudentId,
  generateAssignmentId,
  generateGroupId,
} from "../../utils/nanoid"
import type { Student } from "../../bindings/types"

describe("Store Smoke Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset all stores to initial state
    useAppSettingsStore.getState().reset()
    useProfileSettingsStore.getState().reset()
    useRosterStore.getState().reset()
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
      expect(useAppSettingsStore.getState().gitConnections["test"]).toEqual(
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
      expect(
        useAppSettingsStore.getState().gitConnections["test"],
      ).toBeUndefined()
    })
  })

  describe("profileSettingsStore", () => {
    it("smoke: initializes with correct defaults", () => {
      const state = useProfileSettingsStore.getState()
      expect(state.status).toBe("loading")
      expect(state.course).toEqual({ id: "", name: "" })
      expect(state.gitConnection).toBeNull()
    })

    it("smoke: setGitConnection updates git connection reference", () => {
      useProfileSettingsStore.getState().setGitConnection("my-github")
      expect(useProfileSettingsStore.getState().gitConnection).toBe("my-github")
    })
  })

  describe("rosterStore", () => {
    it("smoke: initializes with empty state", () => {
      const state = useRosterStore.getState()
      expect(state.status).toBe("empty")
      expect(state.roster).toBeNull()
    })

    it("smoke: addStudent creates roster and adds student", () => {
      const student: Student = {
        id: generateStudentId(),
        name: "Test Student",
        email: "test@example.com",
        student_number: null,
        git_username: null,
        git_username_status: "unknown",
        lms_user_id: null,
        custom_fields: {},
      }
      useRosterStore.getState().addStudent(student)

      const state = useRosterStore.getState()
      expect(state.roster?.students).toHaveLength(1)
      expect(state.roster?.students[0]).toEqual(student)
      expect(state.status).toBe("loaded")
    })

    it("smoke: removeStudent removes student and cascades to groups", () => {
      const studentId = generateStudentId()
      const assignmentId = generateAssignmentId()
      const groupId = generateGroupId()

      // Set up roster with student in a group
      useRosterStore.setState({
        roster: {
          source: null,
          students: [
            {
              id: studentId,
              name: "Test",
              email: "test@example.com",
              student_number: null,
              git_username: null,
              git_username_status: "unknown",
              lms_user_id: null,
              custom_fields: {},
            },
          ],
          assignments: [
            {
              id: assignmentId,
              name: "Assignment 1",
              groups: [
                {
                  id: groupId,
                  name: "Group 1",
                  member_ids: [studentId],
                },
              ],
              lms_group_set_id: null,
            },
          ],
        },
        status: "loaded",
      })

      // Remove student
      useRosterStore.getState().removeStudent(studentId)

      // Verify cascade
      const state = useRosterStore.getState()
      expect(state.roster?.students).toHaveLength(0)
      expect(state.roster?.assignments[0].groups[0].member_ids).toHaveLength(0)
    })

    it("smoke: selectAssignment updates selection", () => {
      const assignmentId = generateAssignmentId()
      useRosterStore.getState().selectAssignment(assignmentId)
      expect(useRosterStore.getState().selectedAssignmentId).toBe(assignmentId)
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
  })
})
