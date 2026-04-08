import type {
  Assignment,
  Group,
  GroupSet,
  Roster,
  RosterMember,
} from "@repo-edu/domain/types"
import { isLmsGroupSetConnection } from "../utils/lms-provider.js"
import type { CourseState } from "./slices/types.js"

// Selectors
// ---------------------------------------------------------------------------

export const selectCourse = (state: CourseState) => state.course
export const selectRoster = (state: CourseState) => state.course?.roster ?? null
export const selectCourseStatus = (state: CourseState) => state.status
export const selectCourseError = (state: CourseState) => state.error
export const selectCourseWarnings = (state: CourseState) => state.warnings

const EMPTY_MEMBERS: RosterMember[] = []
const EMPTY_GROUPS: Group[] = []
const EMPTY_GROUP_SETS: GroupSet[] = []
const EMPTY_ASSIGNMENTS: Assignment[] = []
const EMPTY_EDITABLE_GROUP_TARGETS: EditableGroupTarget[] = []
const EMPTY_NAMES: string[] = []

function makeRosterDerivedSelector<T>(
  derive: (roster: Roster) => T,
  emptyValue: T,
) {
  let cachedRoster: Roster | null = null
  let cachedValue = emptyValue

  return (state: CourseState): T => {
    const roster = state.course?.roster ?? null
    if (!roster) {
      cachedRoster = null
      cachedValue = emptyValue
      return emptyValue
    }
    if (cachedRoster === roster) {
      return cachedValue
    }
    cachedRoster = roster
    cachedValue = derive(roster)
    return cachedValue
  }
}

export const selectStudents = (state: CourseState) =>
  state.course?.roster.students ?? EMPTY_MEMBERS
export const selectStaff = (state: CourseState) =>
  state.course?.roster.staff ?? EMPTY_MEMBERS
export const selectGroups = (state: CourseState) =>
  state.course?.roster.groups ?? EMPTY_GROUPS
export const selectGroupSets = (state: CourseState) =>
  state.course?.roster.groupSets ?? EMPTY_GROUP_SETS
export const selectAssignments = (state: CourseState) =>
  state.course?.roster.assignments ?? EMPTY_ASSIGNMENTS
export const selectAssignmentSelection = (state: CourseState) =>
  state.assignmentSelection

export const selectGroupById = (groupId: string) => (state: CourseState) =>
  state.course?.roster.groups.find((g) => g.id === groupId) ?? null
export const selectGroupSetById =
  (groupSetId: string) => (state: CourseState) =>
    state.course?.roster.groupSets.find((gs) => gs.id === groupSetId) ?? null
export const selectAssignmentById =
  (assignmentId: string) => (state: CourseState) =>
    state.course?.roster.assignments.find((a) => a.id === assignmentId) ?? null

export const selectCourseId = (state: CourseState) =>
  state.course?.lmsCourseId ?? null
export const selectGitConnectionId = (state: CourseState) =>
  state.course?.gitConnectionId ?? null
export const selectOrganization = (state: CourseState) =>
  state.course?.organization ?? null
export const selectLmsConnectionName = (state: CourseState) =>
  state.course?.lmsConnectionName ?? null
export const selectRepositoryTemplate = (state: CourseState) =>
  state.course?.repositoryTemplate ?? null
export const selectRepositoryCloneTargetDirectory = (state: CourseState) =>
  state.course?.repositoryCloneTargetDirectory ?? null
export const selectRepositoryCloneDirectoryLayout = (state: CourseState) =>
  state.course?.repositoryCloneDirectoryLayout ?? null

export const selectSystemSetsReady = (state: CourseState) =>
  state.systemSetsReady
export const selectRosterValidation = (state: CourseState) =>
  state.rosterValidation
export const selectAssignmentValidations = (state: CourseState) =>
  state.assignmentValidations
export const selectIssueCards = (state: CourseState) => state.issueCards
export const selectChecksStatus = (state: CourseState) => state.checksStatus
export const selectChecksError = (state: CourseState) => state.checksError
export const selectChecksDirty = (state: CourseState) => state.checksDirty

// Group set category selectors

export const selectSystemGroupSets = makeRosterDerivedSelector((roster) => {
  const next = roster.groupSets.filter((gs) => gs.connection?.kind === "system")
  return next.length > 0 ? next : EMPTY_GROUP_SETS
}, EMPTY_GROUP_SETS)

export const selectSystemGroupSet =
  (systemType: string) => (state: CourseState) =>
    (state.course?.roster.groupSets ?? []).find(
      (gs) =>
        gs.connection?.kind === "system" &&
        gs.connection.systemType === systemType,
    ) ?? null

export const selectConnectedGroupSets = makeRosterDerivedSelector((roster) => {
  const next = roster.groupSets.filter((gs) =>
    isLmsGroupSetConnection(gs.connection),
  )
  return next.length > 0 ? next : EMPTY_GROUP_SETS
}, EMPTY_GROUP_SETS)

export const selectLocalGroupSets = makeRosterDerivedSelector((roster) => {
  const next = roster.groupSets.filter(
    (gs) => gs.connection === null || gs.connection.kind === "import",
  )
  return next.length > 0 ? next : EMPTY_GROUP_SETS
}, EMPTY_GROUP_SETS)

export const selectGroupsForGroupSet = (groupSetId: string) => {
  return makeRosterDerivedSelector((roster) => {
    const groupSet = roster.groupSets.find(
      (candidate) => candidate.id === groupSetId,
    )
    if (!groupSet) {
      return EMPTY_GROUPS
    }

    if (groupSet.nameMode === "unnamed") {
      return groupSet.teams.map((team) => ({
        id: team.id,
        name: team.gitUsernames.join("-"),
        memberIds: [] as string[],
        origin: "local" as const,
        lmsGroupId: null,
      }))
    }

    const groupIds = new Set(groupSet.groupIds)
    const next = roster.groups.filter((group) => groupIds.has(group.id))
    return next.length > 0 ? next : EMPTY_GROUPS
  }, EMPTY_GROUPS)
}

export const selectAssignmentsForGroupSet = (groupSetId: string) => {
  return makeRosterDerivedSelector((roster) => {
    const next = roster.assignments.filter(
      (assignment) => assignment.groupSetId === groupSetId,
    )
    return next.length > 0 ? next : EMPTY_ASSIGNMENTS
  }, EMPTY_ASSIGNMENTS)
}

/** All (groupSetId, group[]) pairs for editable (local) group sets. */
export type EditableGroupTarget = {
  groupSetId: string
  groupSetName: string
  groups: { id: string; name: string }[]
}
type NamedGroupSet = Extract<GroupSet, { nameMode: "named" }>

export const selectEditableGroupTargets = makeRosterDerivedSelector(
  (roster) => {
    const next = roster.groupSets
      .filter(
        (gs): gs is NamedGroupSet =>
          gs.nameMode === "named" &&
          (gs.connection === null || gs.connection.kind === "import"),
      )
      .map((gs) => ({
        groupSetId: gs.id,
        groupSetName: gs.name,
        groups: gs.groupIds
          .map((gid) => roster.groups.find((g) => g.id === gid))
          .filter((g): g is Group => g !== undefined && g.origin === "local")
          .map((g) => ({ id: g.id, name: g.name })),
      }))
    return next.length > 0 ? next : EMPTY_EDITABLE_GROUP_TARGETS
  },
  EMPTY_EDITABLE_GROUP_TARGETS,
)

export const selectOtherGroupSetNames = (
  groupId: string,
  currentGroupSetId: string,
) => {
  return makeRosterDerivedSelector((roster): string[] => {
    const next = roster.groupSets
      .filter(
        (groupSet) =>
          groupSet.id !== currentGroupSetId &&
          groupSet.nameMode === "named" &&
          groupSet.groupIds.includes(groupId),
      )
      .map((groupSet) => groupSet.name)
    return next.length > 0 ? next : EMPTY_NAMES
  }, EMPTY_NAMES)
}

export const selectGroupReferenceCount =
  (groupId: string) => (state: CourseState) => {
    const roster = state.course?.roster
    if (!roster) return 0
    return roster.groupSets.filter(
      (gs) => gs.nameMode === "named" && gs.groupIds.includes(groupId),
    ).length
  }

export const selectCanUndo = (state: CourseState) => state.history.length > 0
export const selectCanRedo = (state: CourseState) => state.future.length > 0
export const selectNextUndoDescription = (state: CourseState) =>
  state.history.length > 0
    ? state.history[state.history.length - 1].description
    : null
export const selectNextRedoDescription = (state: CourseState) =>
  state.future.length > 0
    ? state.future[state.future.length - 1].description
    : null
