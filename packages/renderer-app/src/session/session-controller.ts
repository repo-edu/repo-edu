import {
  type CourseSaveStamp,
  isAppError,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import { ensureSystemGroupSets } from "@repo-edu/domain/group-set"
import {
  activeCourseIdFromSurface,
  activeSurfaceEquals,
  activeSurfaceRecentSubmission,
  normalizeActiveSurface,
  type PersistedActiveSurface,
  type PersistedAppSettings,
} from "@repo-edu/domain/settings"
import {
  type AnalysisInputs,
  type Assignment,
  type CourseBacking,
  courseHasRoster,
  createBlankCourse,
  type GitIdentityMode,
  type Group,
  type IdSequences,
  type PersistedCourse,
  type Roster,
  type RosterMember,
} from "@repo-edu/domain/types"
import { createCoursePersisterWorker } from "../persistence/course-persister.js"
import {
  idleSyncStatus,
  type Persister,
} from "../persistence/create-persister.js"
import { runWithRetry } from "../persistence/retry.js"
import {
  composePersistedSettings,
  createSettingsPersisterWorker,
} from "../persistence/settings-persister.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { useCourseStore } from "../stores/course-store.js"
import type { CourseActions, HistoryEntry } from "../stores/slices/types.js"
import { useUiStore } from "../stores/ui-store.js"
import type { ActiveTab } from "../types/index.js"
import {
  resolveSupportedActiveTab,
  surfaceTabBacking,
} from "../utils/course-navigation.js"
import { getErrorMessage } from "../utils/error-message.js"
import { generateCourseId } from "../utils/nanoid.js"
import {
  type CourseLoadStatus,
  canAdmitCourseMutation,
  createInitialSessionSnapshot,
  emptyCourseLoadStatus,
  type SessionControllerSnapshot,
  sessionReducer,
} from "./session-reducer.js"

type Listener = () => void

type SessionControllerOptions = {
  workflowClient: WorkflowClient
}

type ActiveCourseWorkerSlot = {
  courseId: string
  worker: Persister
}

type CreateCourseInput = {
  backing: CourseBacking
  displayName: string
  lmsConnectionId?: string | null
  lmsCourseId?: string | null
}

type PreparedSurfaceCommit = {
  surface: PersistedActiveSurface
  tab: ActiveTab
  courseLoadStatus: CourseLoadStatus
  courseId: string | null
  loadedCourse: PersistedCourse | null
}

type EnterSurfaceOptions = {
  preferredTab?: ActiveTab
  preloadedCourse?: PersistedCourse
}

type PrepareSurfaceCommitOptions = {
  preferredTab?: ActiveTab
  requestId?: number
  preloadedCourse?: PersistedCourse
}

type CourseMutationActions = Pick<
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

function initialTabForBacking(backing: CourseBacking): ActiveTab {
  return backing === "lms" ? "roster" : "groups-assignments"
}

function fallbackSurfaceForDeletedCourse(
  courseId: string,
): PersistedActiveSurface {
  const fallback = useUiStore
    .getState()
    .courseList.find((course) => course.id !== courseId)
  return fallback === undefined
    ? { kind: "home" }
    : { kind: "course", courseId: fallback.id }
}

export class SessionController {
  private readonly workflowClient: WorkflowClient
  private snapshot = createInitialSessionSnapshot()
  private readonly listeners = new Set<Listener>()
  private settingsWorker: Persister | null = null
  private activeCourseWorkerSlot: ActiveCourseWorkerSlot | null = null
  private readonly pendingOperations = new Set<Promise<void>>()
  private transitionQueue: Promise<unknown> = Promise.resolve()
  private transitionRequestId = 0
  private bootstrapAttempt = 0
  private disposed = false
  private started = false

  constructor({ workflowClient }: SessionControllerOptions) {
    this.workflowClient = workflowClient
  }

  // Bootstrap is started explicitly rather than from the constructor so a
  // controller instance never mutates global stores or spawns workers before
  // the owning effect has committed it. The effect calls start() once; a
  // disposed controller can never bootstrap.
  start(): void {
    if (this.started || this.disposed) return
    this.started = true
    void this.trackOperation(this.bootstrap())
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): SessionControllerSnapshot => this.snapshot

  retryBootstrap(): void {
    if (this.disposed) return
    this.disposeWorkers()
    useCourseStore.getState().clear()
    void this.trackOperation(this.bootstrap())
  }

  async activateSurface(surface: PersistedActiveSurface): Promise<boolean> {
    return await this.trackOperation(
      this.enqueueTransition(() => this.enterSurface(surface)),
    )
  }

  async recoverMissingActiveCourse(
    fallbackSurface: PersistedActiveSurface,
  ): Promise<boolean> {
    return await this.trackOperation(
      this.enqueueTransition(() =>
        this.recoverMissingActiveCourseInternal(fallbackSurface),
      ),
    )
  }

  setActiveTab(tab: ActiveTab): void {
    const backing = this.currentTabBacking()
    this.dispatch({
      type: "set-active-tab",
      activeTab: resolveSupportedActiveTab(tab, backing),
    })
  }

  dismissSyncError(scope: "settings" | "course"): void {
    this.dispatch({ type: "dismiss-sync-error", scope })
  }

  clearCommandError(): void {
    this.dispatch({ type: "clear-command-error" })
  }

  async flush(): Promise<void> {
    await this.waitForTrackedOperations()
    await Promise.all([
      this.settingsWorker?.flush(),
      this.activeCourseWorkerSlot?.worker.flush(),
    ])
  }

  async waitForIdle(): Promise<void> {
    await this.waitForTrackedOperations()
    await Promise.all([
      this.settingsWorker?.waitForIdle(),
      this.activeCourseWorkerSlot?.worker.waitForIdle(),
    ])
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.disposeWorkers()
    this.dispatch({ type: "dispose" })
    this.listeners.clear()
  }

  async createCourse(input: CreateCourseInput): Promise<PersistedCourse> {
    return await this.trackOperation(
      this.enqueueTransition(() => this.createCourseInternal(input)),
    )
  }

  private async createCourseInternal(
    input: CreateCourseInput,
  ): Promise<PersistedCourse> {
    const backing = input.backing
    const draft = createBlankCourse(
      generateCourseId(),
      new Date().toISOString(),
      {
        backing,
        displayName: input.displayName,
        lmsConnectionId:
          backing === "lms" ? (input.lmsConnectionId ?? null) : null,
        lmsCourseId: backing === "lms" ? (input.lmsCourseId ?? null) : null,
      },
    )

    const stamp = await this.saveCourseDetached(draft)
    const stampedDraft: PersistedCourse = {
      ...draft,
      revision: stamp.revision,
      updatedAt: stamp.updatedAt,
    }
    const activated = await this.enterSurface(
      { kind: "course", courseId: stampedDraft.id },
      {
        preferredTab: initialTabForBacking(stampedDraft.backing),
        preloadedCourse: stampedDraft,
      },
    )
    if (activated) {
      useAppSettingsStore
        .getState()
        .setLastUsedCourseBacking(stampedDraft.backing)
    } else {
      throw new Error(
        `Course "${stampedDraft.displayName}" was created but could not be opened.`,
      )
    }
    return stampedDraft
  }

  async duplicateCourse(
    sourceId: string,
    displayName: string,
  ): Promise<PersistedCourse> {
    return await this.trackOperation(
      this.enqueueTransition(() =>
        this.duplicateCourseInternal(sourceId, displayName),
      ),
    )
  }

  private async duplicateCourseInternal(
    sourceId: string,
    displayName: string,
  ): Promise<PersistedCourse> {
    const source = await this.resolveDetachedCourseSource(sourceId)
    const duplicate = createBlankCourse(
      generateCourseId(),
      new Date().toISOString(),
      {
        backing: source.backing,
        displayName,
        lmsConnectionId: source.lmsConnectionId,
        organization: source.organization,
        lmsCourseId: source.lmsCourseId,
        repositoryTemplate: source.repositoryTemplate,
        searchFolder: source.searchFolder,
        analysisInputs: { ...source.analysisInputs },
      },
    )
    await this.saveCourseDetached(duplicate)
    return duplicate
  }

  async renameCourse(courseId: string, displayName: string): Promise<void> {
    await this.trackOperation(
      this.enqueueTransition(() =>
        this.renameCourseInternal(courseId, displayName),
      ),
    )
  }

  private async renameCourseInternal(
    courseId: string,
    displayName: string,
  ): Promise<void> {
    const trimmedDisplayName = displayName.trim()
    if (!trimmedDisplayName) return

    const activeCourse = useCourseStore.getState().course
    if (
      this.snapshot.activeCourseId === courseId &&
      activeCourse?.id === courseId
    ) {
      if (activeCourse.displayName === trimmedDisplayName) return
      this.setDisplayName(courseId, trimmedDisplayName)
      await this.activeCourseWorkerSlot?.worker.flush()
      return
    }

    const course = await this.workflowClient.run("course.load", { courseId })
    await this.saveCourseDetached({
      ...course,
      displayName: trimmedDisplayName,
    })
  }

  async deleteCourse(courseId: string): Promise<void> {
    await this.trackOperation(
      this.enqueueTransition(() => this.deleteCourseInternal(courseId)),
    )
  }

  private async deleteCourseInternal(courseId: string): Promise<void> {
    if (this.snapshot.activeCourseId !== courseId) {
      await this.workflowClient.run("course.delete", { courseId })
      useAnalysisStore.getState().removeSourcesForCourse(courseId)
      return
    }

    const requestId = this.nextRequestId()
    this.dispatch({ type: "delete-start", requestId, courseId })

    try {
      try {
        await this.activeCourseWorkerSlot?.worker.flush()
      } catch {
        // A stale save failure should not block deletion of the course that
        // owns it; the course is about to be removed regardless.
      }
      await this.workflowClient.run("course.delete", { courseId })
      // The course is gone server-side regardless of which transition owns
      // pending, so drop its analysis sources now.
      useAnalysisStore.getState().removeSourcesForCourse(courseId)

      const fallbackSurface = fallbackSurfaceForDeletedCourse(courseId)
      const commit = await this.prepareDeletedCourseFallback(fallbackSurface)
      const committed = this.dispatch({
        type: "delete-commit",
        requestId,
        activeSurface: commit.surface,
        activeTab: commit.tab,
        courseLoadStatus: commit.courseLoadStatus,
      })
      if (!committed) return
      this.applyPreparedSurfaceCommit(commit)
      this.syncAnalysisSource()
      this.recordSuccessfulSurfaceEntry(commit.surface)
    } catch (error) {
      this.dispatch({
        type: "delete-failed",
        requestId,
        message: getErrorMessage(error, "Could not delete course."),
      })
      throw error
    }
  }

  pruneLoadedSubmissionFoldersForCourses(
    courses: readonly Pick<PersistedCourse, "id" | "backing">[],
  ): void {
    useAppSettingsStore.getState().pruneSubmissionFoldersForCourses(courses)
  }

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

  private async bootstrap(): Promise<void> {
    const attempt = ++this.bootstrapAttempt
    this.dispatch({ type: "bootstrap-start", attempt })
    try {
      const settings = await this.workflowClient.run(
        "settings.loadApp",
        undefined,
      )
      if (this.disposed || attempt !== this.bootstrapAttempt) return

      useAppSettingsStore.getState().hydrate(settings)
      const surface = normalizeActiveSurface(settings.activeSurface)
      const commit = await this.prepareBootstrapSurfaceCommit(
        surface,
        settings.activeTab,
      )
      if (this.disposed || attempt !== this.bootstrapAttempt) return

      const requestId = this.nextRequestId()
      this.dispatch({
        type: "enter-start",
        requestId,
        targetSurface: commit.surface,
        leavingCourseId: null,
      })
      const committed = this.dispatch({
        type: "enter-commit",
        requestId,
        activeSurface: commit.surface,
        activeTab: commit.tab,
        courseLoadStatus: commit.courseLoadStatus,
      })
      if (committed) {
        this.applyPreparedSurfaceCommit(commit)
        this.syncAnalysisSource()
      }
      this.createSettingsWorker(settings)
      this.dispatch({ type: "bootstrap-ready", attempt })
    } catch (error) {
      if (this.disposed || attempt !== this.bootstrapAttempt) return
      this.dispatch({
        type: "bootstrap-failed",
        attempt,
        message: getErrorMessage(error, "Could not load app settings."),
      })
    }
  }

  private async enterSurface(
    surface: PersistedActiveSurface,
    options: EnterSurfaceOptions = {},
  ): Promise<boolean> {
    const nextSurface = normalizeActiveSurface(surface)
    const current = this.snapshot
    const previousCourseLoadStatus = current.courseLoadStatus
    if (
      activeSurfaceEquals(current.activeSurface, nextSurface) &&
      options.preferredTab === undefined
    ) {
      return true
    }

    const requestId = this.nextRequestId()
    const leavingCourseId =
      current.activeCourseId !== null &&
      current.activeCourseId !== activeCourseIdFromSurface(nextSurface)
        ? current.activeCourseId
        : null
    this.dispatch({
      type: "enter-start",
      requestId,
      targetSurface: nextSurface,
      leavingCourseId,
    })

    try {
      if (leavingCourseId !== null) {
        await this.activeCourseWorkerSlot?.worker.flush()
      }
      if (this.isStaleEnterRequest(requestId)) return false

      const commit = await this.prepareSurfaceCommit(nextSurface, {
        preferredTab: options.preferredTab,
        preloadedCourse: options.preloadedCourse,
        requestId,
      })
      if (this.isStaleEnterRequest(requestId)) return false

      const committed = this.dispatch({
        type: "enter-commit",
        requestId,
        activeSurface: commit.surface,
        activeTab: commit.tab,
        courseLoadStatus: commit.courseLoadStatus,
      })
      if (!committed) return false
      this.applyPreparedSurfaceCommit(commit)
      this.syncAnalysisSource()
      this.recordSuccessfulSurfaceEntry(commit.surface)
      return true
    } catch (error) {
      this.dispatch({
        type: "enter-failed",
        requestId,
        message: getErrorMessage(error, "Could not activate surface."),
        courseLoadStatus: previousCourseLoadStatus,
      })
      return false
    }
  }

  private async recoverMissingActiveCourseInternal(
    fallbackSurface: PersistedActiveSurface,
  ): Promise<boolean> {
    const missingCourseId = this.snapshot.activeCourseId
    const courseList = useUiStore.getState().courseList
    if (
      missingCourseId === null ||
      courseList.some((course) => course.id === missingCourseId)
    ) {
      return await this.enterSurface(fallbackSurface)
    }

    const requestId = this.nextRequestId()
    const previousCourseLoadStatus = this.snapshot.courseLoadStatus
    const nextSurface = normalizeActiveSurface(fallbackSurface)
    this.dispatch({
      type: "enter-start",
      requestId,
      targetSurface: nextSurface,
      leavingCourseId: missingCourseId,
    })

    try {
      const commit = await this.prepareDeletedCourseFallback(nextSurface)
      const committed = this.dispatch({
        type: "enter-commit",
        requestId,
        activeSurface: commit.surface,
        activeTab: commit.tab,
        courseLoadStatus: commit.courseLoadStatus,
      })
      if (!committed) return false
      useAnalysisStore.getState().removeSourcesForCourse(missingCourseId)
      this.applyPreparedSurfaceCommit(commit)
      this.syncAnalysisSource()
      this.recordSuccessfulSurfaceEntry(commit.surface)
      return true
    } catch (error) {
      this.dispatch({
        type: "enter-failed",
        requestId,
        message: getErrorMessage(error, "Could not recover missing course."),
        courseLoadStatus: previousCourseLoadStatus,
      })
      return false
    }
  }

  private async prepareSurfaceCommit(
    surface: PersistedActiveSurface,
    options: PrepareSurfaceCommitOptions = {},
  ): Promise<PreparedSurfaceCommit> {
    const { preferredTab, requestId, preloadedCourse } = options
    const courseId = activeCourseIdFromSurface(surface)
    if (courseId === null) {
      return {
        surface,
        tab: resolveSupportedActiveTab(
          preferredTab ?? this.snapshot.activeTab,
          surfaceTabBacking(surface, undefined),
        ),
        courseLoadStatus: emptyCourseLoadStatus,
        courseId: null,
        loadedCourse: null,
      }
    }

    const existingCourse = useCourseStore.getState().course
    let backing =
      existingCourse?.id === courseId ? existingCourse.backing : null
    let loadedCourse: PersistedCourse | null = null
    if (existingCourse?.id !== courseId) {
      if (preloadedCourse !== undefined && preloadedCourse.id === courseId) {
        loadedCourse = normalizeLoadedCourse(preloadedCourse)
        backing = loadedCourse.backing
      } else {
        if (requestId !== undefined && this.isStaleEnterRequest(requestId)) {
          throw new Error("Stale activation request")
        }
        this.dispatch({
          type: "set-course-load-status",
          status: { state: "loading", message: null },
        })
        const course = await this.workflowClient.run("course.load", {
          courseId,
        })
        if (requestId !== undefined && this.isStaleEnterRequest(requestId)) {
          throw new Error("Stale activation request")
        }
        loadedCourse = normalizeLoadedCourse(course)
        backing = loadedCourse.backing
      }
    }

    return {
      surface,
      tab: resolveSupportedActiveTab(
        preferredTab ?? this.snapshot.activeTab,
        surfaceTabBacking(surface, backing ?? undefined),
      ),
      courseLoadStatus: { state: "loaded", message: null },
      courseId,
      loadedCourse,
    }
  }

  private async prepareBootstrapSurfaceCommit(
    surface: PersistedActiveSurface,
    preferredTab: ActiveTab,
  ): Promise<PreparedSurfaceCommit> {
    try {
      return await this.prepareSurfaceCommit(surface, { preferredTab })
    } catch (error) {
      if (
        activeCourseIdFromSurface(surface) !== null &&
        isMissingCourseError(error)
      ) {
        return await this.prepareSurfaceCommit(
          { kind: "home" },
          { preferredTab },
        )
      }
      throw error
    }
  }

  private async prepareDeletedCourseFallback(
    fallbackSurface: PersistedActiveSurface,
  ): Promise<PreparedSurfaceCommit> {
    try {
      return await this.prepareSurfaceCommit(fallbackSurface)
    } catch {
      return await this.prepareSurfaceCommit({ kind: "home" })
    }
  }

  private applyPreparedSurfaceCommit(commit: PreparedSurfaceCommit): void {
    if (commit.courseId === null) {
      this.disposeActiveCourseWorker()
      useCourseStore.getState().clear()
      return
    }

    if (commit.loadedCourse !== null) {
      useCourseStore.getState().hydrate(commit.loadedCourse)
    }
    this.ensureActiveCourseWorker(commit.courseId)
  }

  // One-shot detached writes (create, duplicate, inactive rename) save a course
  // that is not owned by the active worker, so they retry retryable failures
  // here on the same schedule the active worker uses for the live document.
  private async saveCourseDetached(
    course: PersistedCourse,
  ): Promise<CourseSaveStamp> {
    return await runWithRetry(
      () => this.workflowClient.run("course.save", course),
      { isCancelled: () => this.disposed },
    )
  }

  private async resolveDetachedCourseSource(
    sourceId: string,
  ): Promise<PersistedCourse> {
    const activeCourse = useCourseStore.getState().course
    if (activeCourse?.id === sourceId) {
      await this.activeCourseWorkerSlot?.worker.flush()
      const flushedCourse = useCourseStore.getState().course
      if (flushedCourse?.id === sourceId) return flushedCourse
    }
    return await this.workflowClient.run("course.load", { courseId: sourceId })
  }

  private ensureActiveCourseWorker(courseId: string): void {
    if (
      this.activeCourseWorkerSlot?.courseId === courseId &&
      this.activeCourseWorkerSlot.worker
    ) {
      return
    }

    this.disposeActiveCourseWorker()
    const worker = createCoursePersisterWorker({
      workflowClient: this.workflowClient,
      getSnapshot: () => {
        const course = useCourseStore.getState().course
        return course?.id === courseId ? course : null
      },
      subscribe: (listener) => useCourseStore.subscribe(listener),
      setSyncStatus: (status) =>
        this.dispatch({ type: "set-sync-status", scope: "course", status }),
      applySaveResult: (result, snapshot) => {
        if (
          this.activeCourseWorkerSlot?.courseId !== snapshot.id ||
          this.snapshot.activeCourseId !== snapshot.id
        ) {
          return
        }
        useCourseStore.getState().applySaveStamp(snapshot.id, result)
      },
    })
    this.activeCourseWorkerSlot = { courseId, worker }
  }

  private createSettingsWorker(initialBaseline?: PersistedAppSettings): void {
    this.settingsWorker?.dispose()
    this.settingsWorker = createSettingsPersisterWorker({
      workflowClient: this.workflowClient,
      getSnapshot: () =>
        composePersistedSettings(
          this.snapshot,
          useAppSettingsStore.getState().settings,
        ),
      subscribe: (listener) => {
        const unsubscribeSession = this.subscribe(listener)
        const unsubscribeSettings = useAppSettingsStore.subscribe(listener)
        return () => {
          unsubscribeSession()
          unsubscribeSettings()
        }
      },
      initialBaseline,
      setSyncStatus: (status) =>
        this.dispatch({ type: "set-sync-status", scope: "settings", status }),
    })
  }

  private recordSuccessfulSurfaceEntry(surface: PersistedActiveSurface): void {
    const settingsStore = useAppSettingsStore.getState()
    if (surface.kind === "folder") {
      settingsStore.pushRecentFolder(surface.path)
      return
    }
    if (surface.kind === "submission") {
      const recent = activeSurfaceRecentSubmission(surface)
      if (recent !== null) {
        settingsStore.pushRecentSubmissionFolder(recent)
      }
    }
  }

  private syncAnalysisSource(): void {
    useAnalysisStore
      .getState()
      .activateSource(this.snapshot.activeAnalysisSourceKey)
  }

  private currentTabBacking(): ReturnType<typeof surfaceTabBacking> {
    const course = useCourseStore.getState().course
    const courseId = activeCourseIdFromSurface(this.snapshot.activeSurface)
    const backing =
      courseId !== null && course?.id === courseId ? course.backing : undefined
    return surfaceTabBacking(this.snapshot.activeSurface, backing)
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

  private withCourseTarget(
    expectedCourseId: string,
    apply: (actions: CourseMutationActions) => void,
  ): void {
    if (this.disposed || this.snapshot.disposed) return
    const targetCourseId = useCourseStore.getState().course?.id ?? null
    if (targetCourseId !== expectedCourseId) return
    if (!canAdmitCourseMutation(this.snapshot, targetCourseId)) return
    apply(useCourseStore.getState())
  }

  private nextRequestId(): number {
    this.transitionRequestId += 1
    return this.transitionRequestId
  }

  private isStaleEnterRequest(requestId: number): boolean {
    return (
      this.snapshot.pending?.kind !== "enter" ||
      this.snapshot.pending.requestId !== requestId
    )
  }

  private disposeWorkers(): void {
    this.settingsWorker?.dispose()
    this.settingsWorker = null
    this.disposeActiveCourseWorker()
  }

  private disposeActiveCourseWorker(): void {
    if (this.activeCourseWorkerSlot === null) return
    this.activeCourseWorkerSlot.worker.dispose()
    this.activeCourseWorkerSlot = null
    this.dispatch({
      type: "set-sync-status",
      scope: "course",
      status: idleSyncStatus,
    })
  }

  private dispatch(event: Parameters<typeof sessionReducer>[1]): boolean {
    const next = sessionReducer(this.snapshot, event)
    if (next === this.snapshot) return false
    this.snapshot = next
    for (const listener of this.listeners) {
      listener()
    }
    return true
  }

  private trackOperation<T>(operation: Promise<T>): Promise<T> {
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    )
    this.pendingOperations.add(tracked)
    return operation.finally(() => {
      this.pendingOperations.delete(tracked)
    })
  }

  private enqueueTransition<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.transitionQueue.then(operation, operation)
    this.transitionQueue = queued.then(
      () => undefined,
      () => undefined,
    )
    return queued
  }

  private async waitForTrackedOperations(): Promise<void> {
    while (this.pendingOperations.size > 0) {
      await Promise.allSettled([...this.pendingOperations])
    }
  }
}

function normalizeLoadedCourse(course: PersistedCourse): PersistedCourse {
  if (!courseHasRoster(course)) return course
  const normalized = structuredClone(course) as PersistedCourse
  const result = ensureSystemGroupSets(
    normalized.roster,
    normalized.idSequences,
  )
  return { ...normalized, idSequences: result.idSequences }
}

function isMissingCourseError(error: unknown): boolean {
  return (
    isAppError(error) &&
    error.type === "not-found" &&
    error.resource === "course"
  )
}
