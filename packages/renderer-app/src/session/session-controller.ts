import {
  type AppSettingsLoadResult,
  isAppError,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import {
  type ActiveTab,
  activeCourseIdFromSurface,
  activeSurfaceEquals,
  activeSurfaceRecentSubmission,
  normalizeActiveSurface,
  type PersistedActiveSurface,
  type SubmissionFolderRecent,
} from "@repo-edu/domain/active-surface"
import type {
  LlmProviderKind,
  PersistedGitConnection,
  PersistedLlmConnection,
  PersistedLmsConnection,
} from "@repo-edu/domain/connection"
import { ensureSystemGroupSets } from "@repo-edu/domain/group-set"
import type {
  DateFormatPreference,
  PersistedAnalysisConcurrency,
  PersistedAnalysisSidebarSettings,
  SubmissionSurfaceState,
  SyntaxThemeId,
  ThemePreference,
  TimeFormatPreference,
} from "@repo-edu/domain/settings"
import {
  type AnalysisInputs,
  type CourseBacking,
  type CourseSummary,
  courseHasRoster,
  createBlankCourse,
  type PersistedCourse,
} from "@repo-edu/domain/types"
import { useConnectionsStore } from "../stores/connections-store.js"
import { useCourseStore } from "../stores/course-store.js"
import { useToastStore } from "../stores/toast-store.js"
import { useUiStore } from "../stores/ui-store.js"
import {
  resolveSupportedActiveTab,
  surfaceTabBacking,
} from "../utils/course-navigation.js"
import { getErrorMessage } from "../utils/error-message.js"
import { generateCourseId } from "../utils/nanoid.js"
import {
  type CourseMutationActions,
  CourseMutationController,
} from "./course-mutation-controller.js"
import { SessionPersistence } from "./session-persistence.js"
import {
  type CourseLoadStatus,
  canAdmitCourseMutation,
  canContinueTransaction,
  createInitialSessionSnapshot,
  emptyCourseLoadStatus,
  type SessionControllerSnapshot,
  type SessionReducerEvent,
  sessionReducer,
} from "./session-reducer.js"
import {
  type CredentialEvent,
  type PreferenceEvent,
  reduceCredentials,
  SessionSettings,
} from "./session-settings.js"
import {
  SessionSurfaceTransactions,
  type SessionTransactionReservation,
  type SessionTransactionScope,
} from "./session-surface-transactions.js"
import { publishCourseRemoval } from "./source-lifecycle-events.js"

type Listener = () => void

type SessionControllerOptions = {
  workflowClient: WorkflowClient
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

function seedLoadedCourseSummary(course: PersistedCourse): void {
  const uiStore = useUiStore.getState()
  if (!uiStore.courseListLoaded) return
  const summary = {
    id: course.id,
    backing: course.backing,
    displayName: course.displayName,
    updatedAt: course.updatedAt,
  }
  const existingIndex = uiStore.courseList.findIndex(
    (entry) => entry.id === course.id,
  )
  uiStore.setCourseList(
    existingIndex === -1
      ? [...uiStore.courseList, summary]
      : uiStore.courseList.map((entry, index) =>
          index === existingIndex ? summary : entry,
        ),
  )
}

export class SessionController extends CourseMutationController {
  private snapshot = createInitialSessionSnapshot()
  private readonly listeners = new Set<Listener>()
  private readonly settings: SessionSettings
  private readonly persistence: SessionPersistence
  private readonly transactions: SessionSurfaceTransactions
  private bootstrapAttempt = 0
  private bootstrapReservation: SessionTransactionReservation<void> | null =
    null
  private notifying = false
  private notificationRequested = false
  private started = false

  constructor(private readonly options: SessionControllerOptions) {
    super()
    this.settings = new SessionSettings(
      options.workflowClient,
      () => this.snapshot.settings,
      this.subscribe,
      () => {
        this.dispatch({ type: "settings-workers-retired" })
      },
      ({ credentials, preferences }) => {
        this.dispatch({
          type: "settings-workers-installed",
          credentialsWorkerId: credentials,
          preferencesWorkerId: preferences,
        })
      },
      (scope, workerId, status) => {
        this.dispatch({
          type: "settings-worker-status",
          scope,
          workerId,
          status,
        })
      },
    )
    this.persistence = new SessionPersistence(
      options.workflowClient,
      () =>
        activeCourseIdFromSurface(
          this.snapshot.settings.preferences.activeSurface,
        ),
      (status) => this.dispatch({ type: "set-course-sync-status", status }),
    )
    this.transactions = new SessionSurfaceTransactions({
      enter: (turnId, descriptor) =>
        this.dispatch({ type: "transaction-enter", turnId, descriptor }),
      start: (turnId, descriptor) =>
        this.dispatch({
          type: "transaction-start",
          turnId,
          descriptor: this.classifyTransaction(descriptor),
        }),
      canContinue: (turnId) => canContinueTransaction(this.snapshot, turnId),
      retire: (turnId) => {
        this.dispatch({ type: "transaction-retire", turnId })
      },
    })
  }

  start(): void {
    if (this.started || this.snapshot.lifecycle.kind === "disposed") return
    this.started = true
    this.startBootstrap()
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): SessionControllerSnapshot => this.snapshot

  retryBootstrap(): void {
    if (
      this.snapshot.bootstrap.status !== "error" ||
      this.snapshot.lifecycle.kind !== "live"
    )
      return
    this.persistence.clearCourse()
    this.settings.disposeWorkers()
    this.startBootstrap()
  }

  async activateSurface(surface: PersistedActiveSurface): Promise<boolean> {
    const targetSurface = normalizeActiveSurface(surface)
    const currentSurface = this.snapshot.settings.preferences.activeSurface
    if (activeSurfaceEquals(currentSurface, targetSurface)) return true
    const activeCourseId = activeCourseIdFromSurface(currentSurface)
    const leavingCourseId =
      activeCourseId !== activeCourseIdFromSurface(targetSurface)
        ? activeCourseId
        : null
    return await this.transactions.enqueue(
      { kind: "enter", targetSurface, leavingCourseId },
      async (scope) => await this.enterSurface(scope, targetSurface),
    )
  }

  async recoverMissingActiveCourse(
    fallbackSurface: PersistedActiveSurface,
  ): Promise<boolean> {
    const missingCourseId = activeCourseIdFromSurface(
      this.snapshot.settings.preferences.activeSurface,
    )
    if (
      missingCourseId === null ||
      useUiStore
        .getState()
        .courseList.some((course) => course.id === missingCourseId)
    ) {
      return await this.activateSurface(fallbackSurface)
    }
    const targetSurface = normalizeActiveSurface(fallbackSurface)
    return await this.transactions.enqueue(
      { kind: "enter", targetSurface, leavingCourseId: missingCourseId },
      async (scope) => {
        const previous = this.snapshot.courseLoadStatus
        try {
          const commit = await this.prepareDeletedCourseFallback(
            scope,
            targetSurface,
          )
          if (
            !this.commitSurface(scope, commit, [], () =>
              publishCourseRemoval(missingCourseId),
            )
          )
            return false
          return true
        } catch (error) {
          this.failCommand(
            scope,
            error,
            "Could not recover missing course.",
            previous,
          )
          return false
        }
      },
    )
  }

  setActiveTab(tab: ActiveTab): void {
    const backing = this.currentTabBacking()
    this.preference({
      type: "set-active-tab",
      tab: resolveSupportedActiveTab(tab, backing),
    })
  }

  dismissSyncError(scope: "settings" | "course"): void {
    this.dispatch({ type: "dismiss-sync-error", scope })
  }

  clearCommandError(): void {
    this.dispatch({ type: "clear-command-error" })
  }

  async flush(): Promise<void> {
    await this.transactions.flush()
    await Promise.all([this.settings.flush(), this.persistence.flush()])
  }

  async waitForIdle(): Promise<void> {
    await this.transactions.flush()
    await Promise.all([
      this.settings.waitForIdle(),
      this.persistence.waitForIdle(),
    ])
  }

  async requestClose(attemptId: string): Promise<void> {
    if (!this.dispatch({ type: "close-start", attemptId })) {
      if (
        this.snapshot.lifecycle.kind === "closing" &&
        this.snapshot.lifecycle.attemptId === attemptId
      )
        return
      throw new Error("The session is not available for this close attempt.")
    }
    try {
      await this.transactions.flush()
      await Promise.all([this.settings.flush(), this.persistence.flush()])
    } catch (error) {
      this.dispatch({ type: "close-restore", attemptId })
      throw error
    }
  }

  cancelClose(attemptId: string): boolean {
    return this.dispatch({ type: "close-restore", attemptId })
  }

  dispose(): void {
    if (this.snapshot.lifecycle.kind === "disposed") return
    this.dispatch({ type: "dispose" }, () => {
      void this.bootstrapReservation?.cancel().catch(() => undefined)
      this.bootstrapReservation = null
      this.settings.disposeWorkers()
      this.persistence.dispose()
    })
    this.listeners.clear()
  }

  async createCourse(input: CreateCourseInput): Promise<PersistedCourse> {
    const targetSurface: PersistedActiveSurface = {
      kind: "course",
      courseId: generateCourseId(),
    }
    const leavingCourseId = activeCourseIdFromSurface(
      this.snapshot.settings.preferences.activeSurface,
    )
    return await this.transactions.enqueue(
      { kind: "create", targetSurface, leavingCourseId },
      async (scope) => await this.createCourseBody(scope, input, targetSurface),
    )
  }

  async duplicateCourse(
    sourceId: string,
    displayName: string,
  ): Promise<PersistedCourse> {
    return await this.transactions.enqueue(
      { kind: "duplicate" },
      async (scope) => {
        const source = await this.resolveDetachedCourseSource(scope, sourceId)
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
        await this.persistence.saveDetached(scope, duplicate)
        return duplicate
      },
    )
  }

  async renameCourse(courseId: string, displayName: string): Promise<void> {
    await this.transactions.enqueue({ kind: "rename" }, async (scope) => {
      const trimmedDisplayName = displayName.trim()
      if (!trimmedDisplayName) return
      const activeCourse = useCourseStore.getState().course
      if (
        activeCourse?.id === courseId &&
        activeCourseIdFromSurface(
          this.snapshot.settings.preferences.activeSurface,
        ) === courseId
      ) {
        if (activeCourse.displayName === trimmedDisplayName) return
        useCourseStore.getState().setDisplayName(trimmedDisplayName)
        await this.persistence.flushActive(scope)
        return
      }
      const course = await this.persistence.loadCourse(courseId)
      await this.persistence.saveDetached(scope, {
        ...course,
        displayName: trimmedDisplayName,
      })
    })
  }

  async deleteCourse(courseId: string): Promise<void> {
    await this.transactions.enqueue(
      {
        kind: "delete",
        courseId,
        blocksCourseMutation: false,
      },
      async (scope) => {
        const deletesActiveCourse =
          activeCourseIdFromSurface(
            this.snapshot.settings.preferences.activeSurface,
          ) === courseId
        if (!deletesActiveCourse) {
          await this.persistence.deleteDetached(scope, courseId)
          publishCourseRemoval(courseId)
          return
        }
        try {
          try {
            await this.persistence.flushActiveTolerated(scope)
          } catch {
            /* deletion supersedes a stale save failure */
          }
          await this.persistence.deleteDetached(scope, courseId)
          const fallback = fallbackSurfaceForDeletedCourse(courseId)
          const commit = await this.prepareDeletedCourseFallback(
            scope,
            fallback,
          )
          this.commitSurface(scope, commit, [], () =>
            publishCourseRemoval(courseId),
          )
        } catch (error) {
          this.failCommand(scope, error, "Could not delete course.")
          throw error
        }
      },
    )
  }

  pruneLoadedSubmissionFoldersForCourses(
    courses: readonly Pick<CourseSummary, "id" | "backing">[],
  ): void {
    this.preference({ type: "prune-submissions-for-courses", courses })
  }

  setLastUsedCourseBacking(backing: CourseBacking): void {
    this.preference({ type: "set-last-used-course-backing", backing })
  }
  setFolderViewAnalysisInputs(patch: Partial<AnalysisInputs>): void {
    this.preference({ type: "set-folder-analysis-inputs", patch })
  }
  pushRecentFolder(path: string): void {
    this.preference({ type: "push-recent-folder", path })
  }
  removeRecentFolder(path: string): void {
    this.preference({ type: "remove-recent-folder", path })
  }
  clearRecentFolders(): void {
    this.preference({ type: "clear-recent-folders" })
  }
  pushRecentSubmissionFolder(recent: SubmissionFolderRecent): void {
    this.preference({ type: "push-recent-submission", recent })
  }
  removeRecentSubmissionFolder(recent: SubmissionFolderRecent): void {
    this.preference({ type: "remove-recent-submission", recent })
  }
  setSubmissionSurfaceState(
    recent: SubmissionFolderRecent,
    state: SubmissionSurfaceState,
  ): void {
    this.preference({ type: "set-submission-state", recent, state })
  }
  clearSubmissionSurfaceState(recent: SubmissionFolderRecent): void {
    this.preference({ type: "clear-submission-state", recent })
  }
  setTheme(theme: ThemePreference): void {
    this.preference({ type: "set-theme", theme })
  }
  setDateFormat(dateFormat: DateFormatPreference): void {
    this.preference({ type: "set-date-format", dateFormat })
  }
  setTimeFormat(timeFormat: TimeFormatPreference): void {
    this.preference({ type: "set-time-format", timeFormat })
  }
  setSyntaxTheme(syntaxTheme: SyntaxThemeId): void {
    this.preference({ type: "set-syntax-theme", syntaxTheme })
  }
  setDefaultExtensions(extensions: string[]): void {
    this.preference({ type: "set-default-extensions", extensions })
  }
  setExaminationModelForProvider(
    provider: LlmProviderKind,
    code: string,
  ): void {
    this.preference({ type: "set-examination-model", provider, code })
  }
  setRosterColumnVisibility(visibility: Record<string, boolean>): void {
    this.preference({ type: "set-roster-column-visibility", visibility })
  }
  setRosterColumnSizing(sizing: Record<string, number>): void {
    this.preference({ type: "set-roster-column-sizing", sizing })
  }
  setGroupsSidebarSize(size: number): void {
    this.preference({ type: "set-groups-sidebar-size", size })
  }
  setAnalysisSidebarSize(size: number): void {
    this.preference({ type: "set-analysis-sidebar-size", size })
  }
  setAnalysisDetailListSize(size: number): void {
    this.preference({ type: "set-analysis-detail-list-size", size })
  }
  setExaminationSubmissionSidebarSize(size: number): void {
    this.preference({ type: "set-examination-submission-sidebar-size", size })
  }
  setAnalysisSidebar(sidebar: PersistedAnalysisSidebarSettings | null): void {
    this.preference({ type: "set-analysis-sidebar", sidebar })
  }
  setAnalysisConcurrency(concurrency: PersistedAnalysisConcurrency): void {
    this.preference({ type: "set-analysis-concurrency", concurrency })
  }

  setActiveGitConnectionId(id: string | null): void {
    this.credential({ type: "set-active-git-connection", id })
  }
  addLmsConnection(connection: PersistedLmsConnection): void {
    this.credential({ type: "add-lms-connection", connection })
  }
  updateLmsConnection(id: string, connection: PersistedLmsConnection): void {
    this.credential({ type: "update-lms-connection", id, connection })
  }
  removeLmsConnection(id: string): void {
    this.credential({ type: "remove-lms-connection", id })
  }
  addGitConnection(connection: PersistedGitConnection): void {
    this.credential({ type: "add-git-connection", connection })
  }
  updateGitConnection(id: string, connection: PersistedGitConnection): void {
    this.credential({ type: "update-git-connection", id, connection })
  }
  removeGitConnection(id: string): void {
    this.credential({ type: "remove-git-connection", id })
  }
  setActiveLlmConnectionId(id: string | null): void {
    this.credential({ type: "set-active-llm-connection", id })
  }
  addLlmConnection(connection: PersistedLlmConnection): void {
    this.credential({ type: "add-llm-connection", connection })
  }
  updateLlmConnection(id: string, connection: PersistedLlmConnection): void {
    this.credential({ type: "update-llm-connection", id, connection })
  }
  removeLlmConnection(id: string): void {
    this.credential({ type: "remove-llm-connection", id })
  }

  private startBootstrap(): void {
    const attempt = ++this.bootstrapAttempt
    if (!this.dispatch({ type: "bootstrap-start", attempt })) return
    const reservation = this.transactions.reserve<void>({ kind: "bootstrap" })
    if (reservation === null) {
      this.dispatch({
        type: "bootstrap-failed",
        attempt,
        message: "The session is not accepting bootstrap work.",
      })
      return
    }
    this.bootstrapReservation = reservation
    void this.bootstrap(attempt, reservation)
  }

  private async bootstrap(
    attempt: number,
    reservation: SessionTransactionReservation<void>,
  ): Promise<void> {
    let settings: AppSettingsLoadResult
    try {
      settings = await this.options.workflowClient.run(
        "settings.loadApp",
        undefined,
      )
    } catch (error) {
      await reservation.cancel(error).catch(() => undefined)
      if (this.bootstrapReservation === reservation)
        this.bootstrapReservation = null
      this.dispatch({
        type: "bootstrap-failed",
        attempt,
        message: getErrorMessage(error, "Could not load app settings."),
      })
      return
    }

    try {
      await reservation.run(async (scope) => {
        if (
          !this.dispatch({
            type: "bootstrap-seed",
            attempt,
            credentials: settings.credentials,
            preferences: settings.preferences,
          })
        )
          throw new Error("The bootstrap attempt is no longer active.")

        emitSettingsRecoveryToasts(settings)

        const surface = normalizeActiveSurface(
          settings.preferences.activeSurface,
        )
        const commit = await this.prepareBootstrapSurfaceCommit(
          scope,
          surface,
          settings.preferences.activeTab,
        )
        if (!this.commitSurface(scope, commit))
          throw new Error("The bootstrap surface could not be committed.")
        this.settings.replaceWorkers(settings)
        this.dispatch({ type: "bootstrap-ready", attempt })
      })
    } catch (error) {
      if (this.snapshot.lifecycle.kind !== "disposed") {
        this.dispatch({
          type: "bootstrap-failed",
          attempt,
          message: getErrorMessage(error, "Could not load app settings."),
        })
      }
    } finally {
      if (this.bootstrapReservation === reservation)
        this.bootstrapReservation = null
    }
  }

  private async createCourseBody(
    scope: SessionTransactionScope,
    input: CreateCourseInput,
    targetSurface: PersistedActiveSurface & { kind: "course" },
  ): Promise<PersistedCourse> {
    const draft = createBlankCourse(
      targetSurface.courseId,
      new Date().toISOString(),
      {
        backing: input.backing,
        displayName: input.displayName,
        lmsConnectionId:
          input.backing === "lms" ? (input.lmsConnectionId ?? null) : null,
        lmsCourseId:
          input.backing === "lms" ? (input.lmsCourseId ?? null) : null,
      },
    )
    const previous = this.snapshot.courseLoadStatus
    try {
      if (
        activeCourseIdFromSurface(
          this.snapshot.settings.preferences.activeSurface,
        ) !== null
      ) {
        await this.persistence.flushActive(scope)
      }
      const stamp = await this.persistence.saveDetached(scope, draft)
      const stampedDraft = {
        ...draft,
        revision: stamp.revision,
        updatedAt: stamp.updatedAt,
      }
      const commit = await this.prepareSurfaceCommit(scope, targetSurface, {
        preferredTab: initialTabForBacking(stampedDraft.backing),
        preloadedCourse: stampedDraft,
      })
      if (
        !this.commitSurface(
          scope,
          commit,
          [
            {
              type: "set-last-used-course-backing",
              backing: stampedDraft.backing,
            },
          ],
          () => seedLoadedCourseSummary(stampedDraft),
        )
      )
        throw new Error(
          `Course "${stampedDraft.displayName}" was created but could not be opened.`,
        )
      return stampedDraft
    } catch (error) {
      this.failCommand(scope, error, "Could not create course.", previous)
      throw error
    }
  }

  private async enterSurface(
    scope: SessionTransactionScope,
    surface: PersistedActiveSurface,
    options: EnterSurfaceOptions = {},
  ): Promise<boolean> {
    const previous = this.snapshot.courseLoadStatus
    try {
      const currentCourseId = activeCourseIdFromSurface(
        this.snapshot.settings.preferences.activeSurface,
      )
      const nextCourseId = activeCourseIdFromSurface(surface)
      if (currentCourseId !== null && currentCourseId !== nextCourseId)
        await this.persistence.flushActive(scope)
      const commit = await this.prepareSurfaceCommit(scope, surface, options)
      return this.commitSurface(
        scope,
        commit,
        recentContributions(commit.surface),
      )
    } catch (error) {
      this.failCommand(scope, error, "Could not activate surface.", previous)
      return false
    }
  }

  private async prepareSurfaceCommit(
    scope: SessionTransactionScope,
    surface: PersistedActiveSurface,
    options: EnterSurfaceOptions = {},
  ): Promise<PreparedSurfaceCommit> {
    const courseId = activeCourseIdFromSurface(surface)
    if (courseId === null) {
      return {
        surface,
        tab: resolveSupportedActiveTab(
          options.preferredTab ?? this.snapshot.settings.preferences.activeTab,
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
      if (options.preloadedCourse?.id === courseId) {
        loadedCourse = normalizeLoadedCourse(options.preloadedCourse)
      } else {
        this.dispatch({
          type: "set-course-load-status",
          turnId: this.runningTurnId(scope),
          status: { state: "loading", message: null },
        })
        loadedCourse = normalizeLoadedCourse(
          await this.persistence.loadCourse(courseId),
        )
      }
      backing = loadedCourse.backing
    }
    if (!scope.canContinue())
      throw new Error("The surface transaction can no longer continue.")
    return {
      surface,
      tab: resolveSupportedActiveTab(
        options.preferredTab ?? this.snapshot.settings.preferences.activeTab,
        surfaceTabBacking(surface, backing ?? undefined),
      ),
      courseLoadStatus: { state: "loaded", message: null },
      courseId,
      loadedCourse,
    }
  }

  private async prepareBootstrapSurfaceCommit(
    scope: SessionTransactionScope,
    surface: PersistedActiveSurface,
    preferredTab: ActiveTab,
  ): Promise<PreparedSurfaceCommit> {
    try {
      return await this.prepareSurfaceCommit(scope, surface, { preferredTab })
    } catch (error) {
      if (
        activeCourseIdFromSurface(surface) !== null &&
        isMissingCourseError(error)
      ) {
        return await this.prepareSurfaceCommit(
          scope,
          { kind: "home" },
          { preferredTab },
        )
      }
      throw error
    }
  }

  private async prepareDeletedCourseFallback(
    scope: SessionTransactionScope,
    fallbackSurface: PersistedActiveSurface,
  ): Promise<PreparedSurfaceCommit> {
    try {
      return await this.prepareSurfaceCommit(scope, fallbackSurface)
    } catch {
      return await this.prepareSurfaceCommit(scope, { kind: "home" })
    }
  }

  private commitSurface(
    scope: SessionTransactionScope,
    commit: PreparedSurfaceCommit,
    preferenceEvents: readonly PreferenceEvent[] = [],
    extraEffect?: () => void,
  ): boolean {
    const turnId = this.runningTurnId(scope)
    return this.dispatch(
      {
        type: "surface-commit",
        turnId,
        surface: commit.surface,
        tab: commit.tab,
        courseLoadStatus: commit.courseLoadStatus,
        preferenceEvents,
      },
      () => {
        if (commit.courseId === null) this.persistence.clearCourse()
        else
          this.persistence.installCourse(commit.courseId, commit.loadedCourse)
        extraEffect?.()
      },
    )
  }

  private resolveDetachedCourseSource(
    scope: SessionTransactionScope,
    sourceId: string,
  ): Promise<PersistedCourse> {
    const activeCourse = useCourseStore.getState().course
    if (activeCourse?.id !== sourceId)
      return this.persistence.loadCourse(sourceId)
    return this.persistence.flushActive(scope).then(() => {
      const flushed = useCourseStore.getState().course
      return flushed?.id === sourceId
        ? flushed
        : this.persistence.loadCourse(sourceId)
    })
  }

  private currentTabBacking(): ReturnType<typeof surfaceTabBacking> {
    const surface = this.snapshot.settings.preferences.activeSurface
    const courseId = activeCourseIdFromSurface(surface)
    const course = useCourseStore.getState().course
    const backing =
      courseId !== null && course?.id === courseId ? course.backing : undefined
    return surfaceTabBacking(surface, backing)
  }

  private classifyTransaction(
    descriptor: Parameters<SessionSurfaceTransactions["reserve"]>[0],
  ): typeof descriptor {
    const activeCourseId = activeCourseIdFromSurface(
      this.snapshot.settings.preferences.activeSurface,
    )
    if (descriptor.kind === "enter" || descriptor.kind === "create") {
      return {
        ...descriptor,
        leavingCourseId:
          activeCourseId === activeCourseIdFromSurface(descriptor.targetSurface)
            ? null
            : activeCourseId,
      }
    }
    if (descriptor.kind === "delete") {
      return {
        ...descriptor,
        blocksCourseMutation: activeCourseId === descriptor.courseId,
      }
    }
    return descriptor
  }

  protected withCourseTarget(
    expectedCourseId: string,
    apply: (actions: CourseMutationActions) => void,
  ): void {
    const targetCourseId = useCourseStore.getState().course?.id ?? null
    if (
      targetCourseId !== expectedCourseId ||
      !canAdmitCourseMutation(this.snapshot, targetCourseId)
    )
      return
    apply(useCourseStore.getState())
  }

  private preference(event: PreferenceEvent): boolean {
    return this.dispatch({ type: "preference", event })
  }

  private credential(event: CredentialEvent): boolean {
    const removed = reduceCredentials(
      this.snapshot.settings.credentials,
      event,
    ).removed
    return this.dispatch({ type: "credential", event }, () => {
      if (removed?.kind === "lms")
        useConnectionsStore.getState().removeLmsConnectionStatus(removed.id)
      if (removed?.kind === "git")
        useConnectionsStore.getState().removeGitStatus(removed.id)
      if (removed?.kind === "llm")
        useConnectionsStore.getState().removeLlmStatus(removed.id)
    })
  }

  private failCommand(
    scope: SessionTransactionScope,
    error: unknown,
    fallback: string,
    courseLoadStatus?: CourseLoadStatus,
  ): void {
    this.dispatch({
      type: "command-failed",
      turnId: this.runningTurnId(scope),
      message: getErrorMessage(error, fallback),
      courseLoadStatus,
    })
  }

  private runningTurnId(scope: SessionTransactionScope): number {
    if (
      !scope.canContinue() ||
      this.snapshot.transactions.runningTurnId === null
    ) {
      throw new Error("The session transaction is no longer running.")
    }
    return this.snapshot.transactions.runningTurnId
  }

  private dispatch(event: SessionReducerEvent, effect?: () => void): boolean {
    const next = sessionReducer(this.snapshot, event)
    if (next === this.snapshot) return false
    this.snapshot = next
    effect?.()
    this.notifySubscribers()
    return true
  }

  private notifySubscribers(): void {
    if (this.notifying) {
      this.notificationRequested = true
      return
    }
    this.notifying = true
    const errors: unknown[] = []
    do {
      this.notificationRequested = false
      for (const listener of [...this.listeners]) {
        try {
          listener()
        } catch (error) {
          errors.push(error)
        }
      }
    } while (this.notificationRequested)
    this.notifying = false
    for (const error of errors) {
      console.error("Session subscriber failed", error)
    }
  }
}

function recentContributions(
  surface: PersistedActiveSurface,
): PreferenceEvent[] {
  if (surface.kind === "folder")
    return [{ type: "push-recent-folder", path: surface.path }]
  if (surface.kind !== "submission") return []
  const recent = activeSurfaceRecentSubmission(surface)
  return recent === null ? [] : [{ type: "push-recent-submission", recent }]
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

function emitSettingsRecoveryToasts(settings: AppSettingsLoadResult): void {
  for (const entry of settings.recovery) {
    const label =
      entry.unit === "unsupported-composite"
        ? "Unsupported app settings were backed aside"
        : `${entry.unit} settings were ${entry.reason}`
    useToastStore.getState().addToast(`${label}: ${entry.backupPath}`, {
      tone: "warning",
      durationMs: 10_000,
    })
  }
}

function isMissingCourseError(error: unknown): boolean {
  return (
    isAppError(error) &&
    error.type === "not-found" &&
    error.resource === "course"
  )
}
