import type { Group, GroupSet, Roster } from "@repo-edu/domain/types"
import { produceWithPatches } from "immer"
import { generateGroupId, generateGroupSetId } from "../../utils/nanoid.js"
import type {
  CourseActions,
  StoreGet,
  StoreInternals,
  StoreSet,
} from "./types.js"
import { HISTORY_LIMIT } from "./types.js"

export function createRosterActionsSlice(
  set: StoreSet,
  get: StoreGet,
  internals: StoreInternals,
): Pick<
  CourseActions,
  | "addMember"
  | "updateMember"
  | "removeMember"
  | "deleteMemberPermanently"
  | "setRoster"
  | "addAssignment"
  | "updateAssignment"
  | "deleteAssignment"
  | "setAssignmentSelection"
  | "createGroup"
  | "updateGroup"
  | "deleteGroup"
  | "moveMemberToGroup"
  | "copyMemberToGroup"
  | "createLocalGroupSet"
  | "copyGroupSet"
  | "renameGroupSet"
  | "deleteGroupSet"
  | "removeGroupFromSet"
  | "updateGroupSetSelection"
  | "updateGroupSetTemplate"
> {
  return {
    // ------------------------------------------------------------------
    // Member mutations
    // ------------------------------------------------------------------

    addMember: (member) => {
      internals.mutateRoster(`Add ${member.name}`, (roster) => {
        if (member.enrollmentType === "student") {
          roster.students.push(member)
        } else {
          roster.staff.push(member)
        }
      })
    },

    updateMember: (id, updates) => {
      internals.mutateRoster("Update member", (roster) => {
        const allMembers = [...roster.students, ...roster.staff]
        const member = allMembers.find((m) => m.id === id)
        if (member) Object.assign(member, updates)
      })
    },

    removeMember: (id) => {
      internals.mutateRoster("Remove member", (roster) => {
        const student = roster.students.find((m) => m.id === id)
        if (student) {
          student.status = "dropped"
          return
        }
        const staff = roster.staff.find((m) => m.id === id)
        if (staff) {
          staff.status = "dropped"
        }
      })
    },

    deleteMemberPermanently: (id) => {
      internals.mutateRoster("Delete member permanently", (roster) => {
        roster.students = roster.students.filter((m) => m.id !== id)
        roster.staff = roster.staff.filter((m) => m.id !== id)
        for (const group of roster.groups) {
          group.memberIds = group.memberIds.filter((mid) => mid !== id)
        }
      })
    },

    setRoster: (roster, description) => {
      const state = get()
      if (!state.course) return
      const [nextRoster, patches, inversePatches] = produceWithPatches(
        state.course.roster,
        () => roster,
      )
      if (patches.length === 0) return

      set((draft) => {
        if (!draft.course) return
        draft.course.roster = nextRoster as Roster
        draft.course.updatedAt = new Date().toISOString()
        draft.history.push({
          patches,
          inversePatches,
          description: description ?? "Replace roster",
        })
        if (draft.history.length > HISTORY_LIMIT) {
          draft.history.splice(0, draft.history.length - HISTORY_LIMIT)
        }
        draft.future = []
        draft.checksDirty = true
      })
      internals.markCourseMutated()
    },

    // ------------------------------------------------------------------
    // Assignment CRUD
    // ------------------------------------------------------------------

    addAssignment: (assignment) => {
      internals.mutateRoster(
        `Add assignment "${assignment.name}"`,
        (roster) => {
          roster.assignments.push(assignment)
        },
      )
    },

    updateAssignment: (id, updates) => {
      internals.mutateRoster("Update assignment", (roster) => {
        const assignment = roster.assignments.find((a) => a.id === id)
        if (assignment) Object.assign(assignment, updates)
      })
    },

    deleteAssignment: (id) => {
      internals.mutateRoster("Delete assignment", (roster) => {
        roster.assignments = roster.assignments.filter((a) => a.id !== id)
      })
      set((draft) => {
        if (draft.assignmentSelection === id) {
          draft.assignmentSelection = null
        }
      })
    },

    setAssignmentSelection: (id) => {
      set((draft) => {
        draft.assignmentSelection = id
      })
    },

    // ------------------------------------------------------------------
    // Group CRUD
    // ------------------------------------------------------------------

    createGroup: (groupSetId, name, memberIds) => {
      const id = generateGroupId()
      internals.mutateRoster(`Create group "${name}"`, (roster) => {
        const group: Group = {
          id,
          name,
          memberIds,
          origin: "local",
          lmsGroupId: null,
        }
        roster.groups.push(group)
        const groupSet = roster.groupSets.find((gs) => gs.id === groupSetId)
        if (groupSet) {
          groupSet.groupIds.push(id)
        }
      })
      return id
    },

    updateGroup: (groupId, updates) => {
      internals.mutateRoster("Update group", (roster) => {
        const group = roster.groups.find((g) => g.id === groupId)
        if (group && group.origin === "local") {
          Object.assign(group, updates)
        }
      })
    },

    deleteGroup: (groupId) => {
      internals.mutateRoster("Delete group", (roster) => {
        roster.groups = roster.groups.filter((g) => g.id !== groupId)
        for (const gs of roster.groupSets) {
          gs.groupIds = gs.groupIds.filter((gid) => gid !== groupId)
        }
      })
    },

    moveMemberToGroup: (memberId, sourceGroupId, targetGroupId) => {
      internals.mutateRoster("Move member", (roster) => {
        const source = roster.groups.find((g) => g.id === sourceGroupId)
        const target = roster.groups.find((g) => g.id === targetGroupId)
        if (source && target) {
          source.memberIds = source.memberIds.filter((id) => id !== memberId)
          if (!target.memberIds.includes(memberId)) {
            target.memberIds.push(memberId)
          }
        }
      })
    },

    copyMemberToGroup: (memberId, targetGroupId) => {
      internals.mutateRoster("Copy member to group", (roster) => {
        const target = roster.groups.find((g) => g.id === targetGroupId)
        if (target && !target.memberIds.includes(memberId)) {
          target.memberIds.push(memberId)
        }
      })
    },

    // ------------------------------------------------------------------
    // Group set CRUD
    // ------------------------------------------------------------------

    createLocalGroupSet: (name, groupIds) => {
      const id = generateGroupSetId()
      internals.mutateRoster(`Create group set "${name}"`, (roster) => {
        const groupSet: GroupSet = {
          id,
          name,
          groupIds: groupIds ?? [],
          connection: null,
          groupSelection: { kind: "all", excludedGroupIds: [] },
          repoNameTemplate: null,
        }
        roster.groupSets.push(groupSet)
      })
      return id
    },

    copyGroupSet: (groupSetId) => {
      const state = get()
      if (!state.course) return null
      const source = state.course.roster.groupSets.find(
        (gs) => gs.id === groupSetId,
      )
      if (!source) return null

      const newId = generateGroupSetId()
      const copiedGroupIds: string[] = []

      internals.mutateRoster(`Copy group set "${source.name}"`, (roster) => {
        for (const origGroupId of source.groupIds) {
          const origGroup = roster.groups.find((g) => g.id === origGroupId)
          if (!origGroup) continue
          const newGroupId = generateGroupId()
          copiedGroupIds.push(newGroupId)
          roster.groups.push({
            id: newGroupId,
            name: origGroup.name,
            memberIds: [...origGroup.memberIds],
            origin: "local",
            lmsGroupId: null,
          })
        }

        roster.groupSets.push({
          id: newId,
          name: `${source.name} (copy)`,
          groupIds: copiedGroupIds,
          connection: null,
          groupSelection: { kind: "all", excludedGroupIds: [] },
          repoNameTemplate: source.repoNameTemplate,
        })
      })

      return newId
    },

    renameGroupSet: (groupSetId, name) => {
      internals.mutateRoster(`Rename group set to "${name}"`, (roster) => {
        const gs = roster.groupSets.find((g) => g.id === groupSetId)
        if (gs && gs.connection?.kind !== "system") {
          gs.name = name
        }
      })
    },

    deleteGroupSet: (groupSetId) => {
      internals.mutateRoster("Delete group set", (roster) => {
        const gs = roster.groupSets.find((g) => g.id === groupSetId)
        if (!gs || gs.connection?.kind === "system") return

        // Remove assignments that reference this group set.
        roster.assignments = roster.assignments.filter(
          (a) => a.groupSetId !== groupSetId,
        )

        // Remove the group set.
        roster.groupSets = roster.groupSets.filter((g) => g.id !== groupSetId)

        // Remove orphaned groups that are no longer in any group set.
        const referencedGroupIds = new Set(
          roster.groupSets.flatMap((g) => g.groupIds),
        )
        roster.groups = roster.groups.filter((g) =>
          referencedGroupIds.has(g.id),
        )
      })
    },

    removeGroupFromSet: (groupSetId, groupId) => {
      internals.mutateRoster("Remove group from set", (roster) => {
        const gs = roster.groupSets.find((g) => g.id === groupSetId)
        if (gs) {
          gs.groupIds = gs.groupIds.filter((id) => id !== groupId)
        }
      })
    },

    updateGroupSetSelection: (groupSetId, selection) => {
      internals.mutateRoster("Update group set selection", (roster) => {
        const gs = roster.groupSets.find((g) => g.id === groupSetId)
        if (gs) gs.groupSelection = selection
      })
    },

    updateGroupSetTemplate: (groupSetId, template) => {
      internals.mutateRoster("Update group set template", (roster) => {
        const gs = roster.groupSets.find((g) => g.id === groupSetId)
        if (gs) gs.repoNameTemplate = template
      })
    },
  }
}
