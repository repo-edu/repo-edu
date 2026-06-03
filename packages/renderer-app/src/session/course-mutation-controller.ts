import type {
  AnalysisInputs,
  Assignment,
  GitIdentityMode,
  Group,
  IdSequences,
  PersistedCourse,
  Roster,
  RosterMember,
} from "@repo-edu/domain/types"
import type { CourseActions, HistoryEntry } from "../stores/slices/types.js"

export type CourseMutationActions = Pick<
  CourseActions,
  | "addMember"
  | "updateMember"
  | "removeMember"
  | "deleteMemberPermanently"
  | "setRoster"
  | "setIdSequences"
  | "addAssignment"
  | "updateAssignment"
  | "deleteAssignment"
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
  | "updateGroupSetTemplate"
  | "updateGroupSetColumnVisibility"
  | "updateGroupSetColumnSizing"
  | "setCourseId"
  | "setLmsConnectionId"
  | "setOrganization"
  | "setRepositoryTemplate"
  | "setRepositoryCloneTargetDirectory"
  | "setRepositoryCloneDirectoryLayout"
  | "setDisplayName"
  | "setSearchFolder"
  | "setAnalysisInputs"
  | "runChecks"
  | "undo"
  | "redo"
  | "clearHistory"
>

// Thin, behaviour-free delegation surface over course-store mutations. Every
// call funnels through `withCourseTarget`, whose concrete implementation
// (owned by SessionController) decides whether the originating course is still
// the active, mutable target before any write lands.
export abstract class CourseMutationController {
  protected abstract withCourseTarget(
    expectedCourseId: string,
    apply: (actions: CourseMutationActions) => void,
  ): void

  addMember(courseId: string, member: RosterMember): void {
    this.runCourseAction(courseId, "addMember", member)
  }

  updateMember(
    courseId: string,
    id: string,
    updates: Partial<RosterMember>,
  ): void {
    this.runCourseAction(courseId, "updateMember", id, updates)
  }

  removeMember(courseId: string, id: string): void {
    this.runCourseAction(courseId, "removeMember", id)
  }

  deleteMemberPermanently(courseId: string, id: string): void {
    this.runCourseAction(courseId, "deleteMemberPermanently", id)
  }

  setRoster(courseId: string, roster: Roster, description?: string): void {
    this.runCourseAction(courseId, "setRoster", roster, description)
  }

  setIdSequences(courseId: string, idSequences: IdSequences): void {
    this.runCourseAction(courseId, "setIdSequences", idSequences)
  }

  addAssignment(courseId: string, assignment: Omit<Assignment, "id">): void {
    this.runCourseAction(courseId, "addAssignment", assignment)
  }

  updateAssignment(
    courseId: string,
    id: string,
    updates: Partial<Assignment>,
  ): void {
    this.runCourseAction(courseId, "updateAssignment", id, updates)
  }

  deleteAssignment(courseId: string, id: string): void {
    this.runCourseAction(courseId, "deleteAssignment", id)
  }

  createGroup(
    courseId: string,
    groupSetId: string,
    name: string,
    memberIds: string[],
  ): string | null {
    return this.runCourseAction(
      courseId,
      "createGroup",
      groupSetId,
      name,
      memberIds,
    )
  }

  updateGroup(
    courseId: string,
    groupId: string,
    updates: Partial<Group>,
  ): void {
    this.runCourseAction(courseId, "updateGroup", groupId, updates)
  }

  deleteGroup(courseId: string, groupId: string): void {
    this.runCourseAction(courseId, "deleteGroup", groupId)
  }

  moveMemberToGroup(
    courseId: string,
    memberId: string,
    sourceGroupId: string,
    targetGroupId: string,
  ): void {
    this.runCourseAction(
      courseId,
      "moveMemberToGroup",
      memberId,
      sourceGroupId,
      targetGroupId,
    )
  }

  copyMemberToGroup(
    courseId: string,
    memberId: string,
    targetGroupId: string,
  ): void {
    this.runCourseAction(courseId, "copyMemberToGroup", memberId, targetGroupId)
  }

  createLocalGroupSet(
    courseId: string,
    name: string,
    groupIds?: string[],
  ): string | null {
    return this.runCourseAction(courseId, "createLocalGroupSet", name, groupIds)
  }

  copyGroupSet(courseId: string, groupSetId: string): string | null {
    return this.runCourseAction(courseId, "copyGroupSet", groupSetId)
  }

  renameGroupSet(courseId: string, groupSetId: string, name: string): void {
    this.runCourseAction(courseId, "renameGroupSet", groupSetId, name)
  }

  deleteGroupSet(courseId: string, groupSetId: string): void {
    this.runCourseAction(courseId, "deleteGroupSet", groupSetId)
  }

  removeGroupFromSet(
    courseId: string,
    groupSetId: string,
    groupId: string,
  ): void {
    this.runCourseAction(courseId, "removeGroupFromSet", groupSetId, groupId)
  }

  updateGroupSetTemplate(
    courseId: string,
    groupSetId: string,
    template: string | null,
  ): void {
    this.runCourseAction(
      courseId,
      "updateGroupSetTemplate",
      groupSetId,
      template,
    )
  }

  updateGroupSetColumnVisibility(
    courseId: string,
    groupSetId: string,
    visibility: Record<string, boolean>,
  ): void {
    this.runCourseAction(
      courseId,
      "updateGroupSetColumnVisibility",
      groupSetId,
      visibility,
    )
  }

  updateGroupSetColumnSizing(
    courseId: string,
    groupSetId: string,
    sizing: Record<string, number>,
  ): void {
    this.runCourseAction(
      courseId,
      "updateGroupSetColumnSizing",
      groupSetId,
      sizing,
    )
  }

  setCourseId(courseId: string, lmsCourseId: string | null): void {
    this.runCourseAction(courseId, "setCourseId", lmsCourseId)
  }

  setLmsConnectionId(courseId: string, id: string | null): void {
    this.runCourseAction(courseId, "setLmsConnectionId", id)
  }

  setOrganization(courseId: string, organization: string | null): void {
    this.runCourseAction(courseId, "setOrganization", organization)
  }

  setRepositoryTemplate(
    courseId: string,
    template: PersistedCourse["repositoryTemplate"],
  ): void {
    this.runCourseAction(courseId, "setRepositoryTemplate", template)
  }

  setRepositoryCloneTargetDirectory(
    courseId: string,
    targetDirectory: PersistedCourse["repositoryCloneTargetDirectory"],
  ): void {
    this.runCourseAction(
      courseId,
      "setRepositoryCloneTargetDirectory",
      targetDirectory,
    )
  }

  setRepositoryCloneDirectoryLayout(
    courseId: string,
    layout: PersistedCourse["repositoryCloneDirectoryLayout"],
  ): void {
    this.runCourseAction(courseId, "setRepositoryCloneDirectoryLayout", layout)
  }

  setDisplayName(courseId: string, name: string): void {
    this.runCourseAction(courseId, "setDisplayName", name)
  }

  setSearchFolder(courseId: string, folder: string | null): void {
    this.runCourseAction(courseId, "setSearchFolder", folder)
  }

  setAnalysisInputs(courseId: string, patch: Partial<AnalysisInputs>): void {
    this.runCourseAction(courseId, "setAnalysisInputs", patch)
  }

  runChecks(courseId: string, identityMode: GitIdentityMode): void {
    this.runCourseAction(courseId, "runChecks", identityMode)
  }

  undo(courseId: string): HistoryEntry | null {
    return this.runCourseAction(courseId, "undo")
  }

  redo(courseId: string): HistoryEntry | null {
    return this.runCourseAction(courseId, "redo")
  }

  clearHistory(courseId: string): void {
    this.runCourseAction(courseId, "clearHistory")
  }

  // Runs compound course writes and success-dependent follow-up work only when
  // the originating course is still the active, mutable course.
  mutateCourse(
    courseId: string,
    mutation: (actions: CourseMutationActions) => void,
  ): void {
    this.withCourseTarget(courseId, mutation)
  }

  private runCourseAction<K extends keyof CourseMutationActions>(
    expectedCourseId: string,
    action: K,
    ...args: Parameters<CourseMutationActions[K]>
  ): ReturnType<CourseMutationActions[K]> | null {
    let result: ReturnType<CourseMutationActions[K]> | null = null
    this.withCourseTarget(expectedCourseId, (actions) => {
      const storeAction = actions[action] as (
        ...actionArgs: Parameters<CourseMutationActions[K]>
      ) => ReturnType<CourseMutationActions[K]>
      result = storeAction(...args) as ReturnType<CourseMutationActions[K]>
    })
    return result
  }
}
