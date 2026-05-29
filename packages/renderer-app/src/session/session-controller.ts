import type { WorkflowClient } from "@repo-edu/application-contract"
import { ensureSystemGroupSets } from "@repo-edu/domain/group-set"
import {
  activeCourseIdFromSurface,
  activeSurfaceEquals,
  activeSurfaceRecentSubmission,
  normalizeActiveSurface,
  type PersistedActiveSurface,
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
  private transitionRequestId = 0
  private bootstrapAttempt = 0
  private disposed = false

  constructor({ workflowClient }: SessionControllerOptions) {
    this.workflowClient = workflowClient
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
    return await this.trackOperation(this.enterSurface(surface))
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
    return await this.trackOperation(this.createCourseInternal(input))
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

    await this.workflowClient.run("course.save", draft)
    useAppSettingsStore.getState().setLastUsedCourseBacking(draft.backing)
    await this.enterSurface(
      { kind: "course", courseId: draft.id },
      initialTabForBacking(draft.backing),
    )
    return draft
  }

  async duplicateCourse(
    sourceId: string,
    displayName: string,
  ): Promise<PersistedCourse> {
    return await this.trackOperation(
      this.duplicateCourseInternal(sourceId, displayName),
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
    await this.workflowClient.run("course.save", duplicate)
    return duplicate
  }

  async renameCourse(courseId: string, displayName: string): Promise<void> {
    await this.trackOperation(this.renameCourseInternal(courseId, displayName))
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
      this.setDisplayName(trimmedDisplayName)
      await this.activeCourseWorkerSlot?.worker.flush()
      return
    }

    const course = await this.workflowClient.run("course.load", { courseId })
    await this.workflowClient.run("course.save", {
      ...course,
      displayName: trimmedDisplayName,
    })
  }

  async deleteCourse(courseId: string): Promise<void> {
    await this.trackOperation(this.deleteCourseInternal(courseId))
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
      await this.activeCourseWorkerSlot?.worker.flush()
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
  ): boolean {
    return useAppSettingsStore
      .getState()
      .pruneSubmissionFoldersForCourses(courses)
  }

  addMember(member: RosterMember): void {
    this.runCourseAction("addMember", member)
  }

  updateMember(id: string, updates: Partial<RosterMember>): void {
    this.runCourseAction("updateMember", id, updates)
  }

  removeMember(id: string): void {
    this.runCourseAction("removeMember", id)
  }

  deleteMemberPermanently(id: string): void {
    this.runCourseAction("deleteMemberPermanently", id)
  }

  setRoster(roster: Roster, description?: string): void {
    this.runCourseAction("setRoster", roster, description)
  }

  setIdSequences(idSequences: IdSequences): void {
    this.runCourseAction("setIdSequences", idSequences)
  }

  addAssignment(assignment: Omit<Assignment, "id">): void {
    this.runCourseAction("addAssignment", assignment)
  }

  updateAssignment(id: string, updates: Partial<Assignment>): void {
    this.runCourseAction("updateAssignment", id, updates)
  }

  deleteAssignment(id: string): void {
    this.runCourseAction("deleteAssignment", id)
  }

  createGroup(
    groupSetId: string,
    name: string,
    memberIds: string[],
  ): string | null {
    return this.runCourseAction("createGroup", groupSetId, name, memberIds)
  }

  updateGroup(groupId: string, updates: Partial<Group>): void {
    this.runCourseAction("updateGroup", groupId, updates)
  }

  deleteGroup(groupId: string): void {
    this.runCourseAction("deleteGroup", groupId)
  }

  moveMemberToGroup(
    memberId: string,
    sourceGroupId: string,
    targetGroupId: string,
  ): void {
    this.runCourseAction(
      "moveMemberToGroup",
      memberId,
      sourceGroupId,
      targetGroupId,
    )
  }

  copyMemberToGroup(memberId: string, targetGroupId: string): void {
    this.runCourseAction("copyMemberToGroup", memberId, targetGroupId)
  }

  createLocalGroupSet(name: string, groupIds?: string[]): string | null {
    return this.runCourseAction("createLocalGroupSet", name, groupIds)
  }

  copyGroupSet(groupSetId: string): string | null {
    return this.runCourseAction("copyGroupSet", groupSetId)
  }

  renameGroupSet(groupSetId: string, name: string): void {
    this.runCourseAction("renameGroupSet", groupSetId, name)
  }

  deleteGroupSet(groupSetId: string): void {
    this.runCourseAction("deleteGroupSet", groupSetId)
  }

  removeGroupFromSet(groupSetId: string, groupId: string): void {
    this.runCourseAction("removeGroupFromSet", groupSetId, groupId)
  }

  updateGroupSetTemplate(groupSetId: string, template: string | null): void {
    this.runCourseAction("updateGroupSetTemplate", groupSetId, template)
  }

  updateGroupSetColumnVisibility(
    groupSetId: string,
    visibility: Record<string, boolean>,
  ): void {
    this.runCourseAction(
      "updateGroupSetColumnVisibility",
      groupSetId,
      visibility,
    )
  }

  updateGroupSetColumnSizing(
    groupSetId: string,
    sizing: Record<string, number>,
  ): void {
    this.runCourseAction("updateGroupSetColumnSizing", groupSetId, sizing)
  }

  setCourseId(courseId: string | null): void {
    this.runCourseAction("setCourseId", courseId)
  }

  setLmsConnectionId(id: string | null): void {
    this.runCourseAction("setLmsConnectionId", id)
  }

  setOrganization(organization: string | null): void {
    this.runCourseAction("setOrganization", organization)
  }

  setRepositoryTemplate(template: PersistedCourse["repositoryTemplate"]): void {
    this.runCourseAction("setRepositoryTemplate", template)
  }

  setRepositoryCloneTargetDirectory(
    targetDirectory: PersistedCourse["repositoryCloneTargetDirectory"],
  ): void {
    this.runCourseAction("setRepositoryCloneTargetDirectory", targetDirectory)
  }

  setRepositoryCloneDirectoryLayout(
    layout: PersistedCourse["repositoryCloneDirectoryLayout"],
  ): void {
    this.runCourseAction("setRepositoryCloneDirectoryLayout", layout)
  }

  setDisplayName(name: string): void {
    this.runCourseAction("setDisplayName", name)
  }

  setSearchFolder(folder: string | null): void {
    this.runCourseAction("setSearchFolder", folder)
  }

  setAnalysisInputs(patch: Partial<AnalysisInputs>): void {
    this.runCourseAction("setAnalysisInputs", patch)
  }

  runChecks(identityMode: GitIdentityMode): void {
    this.runCourseAction("runChecks", identityMode)
  }

  undo(): HistoryEntry | null {
    return this.runCourseAction("undo")
  }

  redo(): HistoryEntry | null {
    return this.runCourseAction("redo")
  }

  clearHistory(): void {
    this.runCourseAction("clearHistory")
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
      const commit = await this.prepareSurfaceCommit(
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
      this.createSettingsWorker()
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
    preferredTab?: ActiveTab,
  ): Promise<boolean> {
    const nextSurface = normalizeActiveSurface(surface)
    const current = this.snapshot
    if (
      activeSurfaceEquals(current.activeSurface, nextSurface) &&
      preferredTab === undefined
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

      const commit = await this.prepareSurfaceCommit(
        nextSurface,
        preferredTab,
        requestId,
      )
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
      })
      return false
    }
  }

  private async prepareSurfaceCommit(
    surface: PersistedActiveSurface,
    preferredTab?: ActiveTab,
    requestId?: number,
  ): Promise<PreparedSurfaceCommit> {
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
      if (requestId !== undefined && this.isStaleEnterRequest(requestId)) {
        throw new Error("Stale activation request")
      }
      this.dispatch({
        type: "set-course-load-status",
        status: { state: "loading", message: null },
      })
      const course = await this.workflowClient.run("course.load", { courseId })
      if (requestId !== undefined && this.isStaleEnterRequest(requestId)) {
        throw new Error("Stale activation request")
      }
      loadedCourse = normalizeLoadedCourse(course)
      backing = loadedCourse.backing
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

  private createSettingsWorker(): void {
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

  private runCourseAction<K extends keyof CourseActions>(
    action: K,
    ...args: Parameters<CourseActions[K]>
  ): ReturnType<CourseActions[K]> | null {
    const targetCourseId = useCourseStore.getState().course?.id ?? null
    if (!canAdmitCourseMutation(this.snapshot, targetCourseId)) {
      return null
    }
    const storeAction = useCourseStore.getState()[action] as (
      ...actionArgs: Parameters<CourseActions[K]>
    ) => ReturnType<CourseActions[K]>
    return storeAction(...args) as ReturnType<CourseActions[K]>
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
    this.activeCourseWorkerSlot?.worker.dispose()
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

  private async waitForTrackedOperations(): Promise<void> {
    while (this.pendingOperations.size > 0) {
      await Promise.allSettled([...this.pendingOperations])
    }
  }
}

function normalizeLoadedCourse(course: PersistedCourse): PersistedCourse {
  if (!courseHasRoster(course)) return course
  const result = ensureSystemGroupSets(course.roster, course.idSequences)
  if (result.idSequences === course.idSequences) return course
  return { ...course, idSequences: result.idSequences }
}
