import {
  activeCourseIdFromSurface,
  type PersistedActiveSurface,
} from "@repo-edu/domain/settings"
import {
  idleSyncStatus,
  type PersistenceSyncStatus,
} from "../persistence/create-persister.js"
import type { ActiveTab } from "../types/index.js"

export type CourseLoadStatus =
  | { state: "empty"; message: null }
  | { state: "loading"; message: null }
  | { state: "loaded"; message: null }
  | { state: "error"; message: string }

export type SessionBootstrapState =
  | { status: "loading"; attempt: number }
  | { status: "ready"; attempt: number }
  | { status: "error"; attempt: number; message: string }

export type AnalysisSourceKey =
  | { kind: "course"; courseId: string }
  | { kind: "folder"; path: string }
  | { kind: "submission"; path: string; courseId: string | null }

export type SessionPendingState =
  | {
      kind: "enter"
      requestId: number
      targetSurface: PersistedActiveSurface
      leavingCourseId: string | null
    }
  | { kind: "delete"; requestId: number; courseId: string }

export type SessionControllerSnapshot = {
  bootstrap: SessionBootstrapState
  activeSurface: PersistedActiveSurface
  activeTab: ActiveTab
  activeCourseId: string | null
  activeAnalysisSourceKey: AnalysisSourceKey | null
  courseLoadStatus: CourseLoadStatus
  settingsSyncStatus: PersistenceSyncStatus
  courseSyncStatus: PersistenceSyncStatus
  pending: SessionPendingState | null
  commandError: string | null
  disposed: boolean
}

export const emptyCourseLoadStatus: CourseLoadStatus = {
  state: "empty",
  message: null,
}

export function analysisSourceKeyFromSurface(
  surface: PersistedActiveSurface,
): AnalysisSourceKey | null {
  if (surface.kind === "course") {
    return { kind: "course", courseId: surface.courseId }
  }
  if (surface.kind === "folder") {
    return { kind: "folder", path: surface.path }
  }
  if (surface.kind === "submission") {
    return {
      kind: "submission",
      path: surface.path,
      courseId: surface.courseId ?? null,
    }
  }
  return null
}

export function createInitialSessionSnapshot(): SessionControllerSnapshot {
  const activeSurface: PersistedActiveSurface = { kind: "home" }
  return {
    bootstrap: { status: "loading", attempt: 0 },
    activeSurface,
    activeTab: "roster",
    activeCourseId: activeCourseIdFromSurface(activeSurface),
    activeAnalysisSourceKey: analysisSourceKeyFromSurface(activeSurface),
    courseLoadStatus: emptyCourseLoadStatus,
    settingsSyncStatus: idleSyncStatus,
    courseSyncStatus: idleSyncStatus,
    pending: null,
    commandError: null,
    disposed: false,
  }
}

export type SessionReducerEvent =
  | { type: "bootstrap-start"; attempt: number }
  | { type: "bootstrap-ready"; attempt: number }
  | { type: "bootstrap-failed"; attempt: number; message: string }
  | {
      type: "enter-start"
      requestId: number
      targetSurface: PersistedActiveSurface
      leavingCourseId: string | null
    }
  | {
      type: "enter-commit"
      requestId: number
      activeSurface: PersistedActiveSurface
      activeTab: ActiveTab
      courseLoadStatus: CourseLoadStatus
    }
  | { type: "enter-failed"; requestId: number; message: string }
  | { type: "set-active-tab"; activeTab: ActiveTab }
  | { type: "set-course-load-status"; status: CourseLoadStatus }
  | {
      type: "set-sync-status"
      scope: "settings" | "course"
      status: PersistenceSyncStatus
    }
  | { type: "dismiss-sync-error"; scope: "settings" | "course" }
  | { type: "delete-start"; requestId: number; courseId: string }
  | {
      type: "delete-commit"
      requestId: number
      activeSurface: PersistedActiveSurface
      activeTab: ActiveTab
      courseLoadStatus: CourseLoadStatus
    }
  | { type: "delete-failed"; requestId: number; message: string }
  | { type: "clear-command-error" }
  | { type: "dispose" }

export function sessionReducer(
  state: SessionControllerSnapshot,
  event: SessionReducerEvent,
): SessionControllerSnapshot {
  switch (event.type) {
    case "bootstrap-start":
      return {
        ...state,
        bootstrap: { status: "loading", attempt: event.attempt },
        pending: null,
        commandError: null,
        disposed: false,
      }
    case "bootstrap-ready":
      if (state.bootstrap.attempt !== event.attempt) return state
      return {
        ...state,
        bootstrap: { status: "ready", attempt: event.attempt },
        commandError: null,
      }
    case "bootstrap-failed":
      if (state.bootstrap.attempt !== event.attempt) return state
      return {
        ...state,
        bootstrap: {
          status: "error",
          attempt: event.attempt,
          message: event.message,
        },
      }
    case "enter-start":
      return {
        ...state,
        pending: {
          kind: "enter",
          requestId: event.requestId,
          targetSurface: event.targetSurface,
          leavingCourseId: event.leavingCourseId,
        },
        commandError: null,
      }
    case "enter-commit":
      if (
        state.pending?.kind !== "enter" ||
        state.pending.requestId !== event.requestId
      ) {
        return state
      }
      return {
        ...state,
        activeSurface: event.activeSurface,
        activeTab: event.activeTab,
        activeCourseId: activeCourseIdFromSurface(event.activeSurface),
        activeAnalysisSourceKey: analysisSourceKeyFromSurface(
          event.activeSurface,
        ),
        courseLoadStatus: event.courseLoadStatus,
        pending: null,
        commandError: null,
      }
    case "enter-failed":
      if (
        state.pending?.kind !== "enter" ||
        state.pending.requestId !== event.requestId
      ) {
        return state
      }
      return {
        ...state,
        pending: null,
        commandError: event.message,
        courseLoadStatus: { state: "error", message: event.message },
      }
    case "set-active-tab":
      if (state.activeTab === event.activeTab) return state
      return { ...state, activeTab: event.activeTab }
    case "set-course-load-status":
      return { ...state, courseLoadStatus: event.status }
    case "set-sync-status":
      return event.scope === "settings"
        ? { ...state, settingsSyncStatus: event.status }
        : { ...state, courseSyncStatus: event.status }
    case "dismiss-sync-error":
      if (event.scope === "settings") {
        return state.settingsSyncStatus.state === "error"
          ? { ...state, settingsSyncStatus: idleSyncStatus }
          : state
      }
      return state.courseSyncStatus.state === "error"
        ? { ...state, courseSyncStatus: idleSyncStatus }
        : state
    case "delete-start":
      return {
        ...state,
        pending: {
          kind: "delete",
          requestId: event.requestId,
          courseId: event.courseId,
        },
        commandError: null,
      }
    case "delete-commit":
      if (
        state.pending?.kind !== "delete" ||
        state.pending.requestId !== event.requestId
      ) {
        return state
      }
      return {
        ...state,
        activeSurface: event.activeSurface,
        activeTab: event.activeTab,
        activeCourseId: activeCourseIdFromSurface(event.activeSurface),
        activeAnalysisSourceKey: analysisSourceKeyFromSurface(
          event.activeSurface,
        ),
        courseLoadStatus: event.courseLoadStatus,
        pending: null,
        commandError: null,
      }
    case "delete-failed":
      if (
        state.pending?.kind !== "delete" ||
        state.pending.requestId !== event.requestId
      ) {
        return state
      }
      return { ...state, pending: null, commandError: event.message }
    case "clear-command-error":
      return state.commandError === null
        ? state
        : { ...state, commandError: null }
    case "dispose":
      return { ...state, disposed: true, pending: null }
  }
}

export function canAdmitCourseMutation(
  snapshot: SessionControllerSnapshot,
  targetCourseId: string | null,
): boolean {
  if (snapshot.pending?.kind === "delete") {
    return targetCourseId !== snapshot.pending.courseId
  }
  if (snapshot.pending?.kind === "enter") {
    return targetCourseId !== snapshot.pending.leavingCourseId
  }
  return (
    targetCourseId !== null &&
    snapshot.activeCourseId !== null &&
    targetCourseId === snapshot.activeCourseId
  )
}
