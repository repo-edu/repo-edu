import {
  activeCourseIdFromSurface,
  type PersistedActiveSurface,
} from "@repo-edu/domain/active-surface"
import type {
  PersistedAppCredentials,
  PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import {
  idleSyncStatus,
  type PersistenceSyncStatus,
} from "../persistence/create-persister.js"
import {
  type CredentialEvent,
  createInitialSessionSettingsState,
  type PreferenceEvent,
  reduceCredentials,
  reducePreferences,
  type SessionSettingsState,
  type SettingsWorkerScope,
} from "./session-settings.js"

export type CourseLoadStatus =
  | { state: "empty"; message: null }
  | { state: "loading"; message: null }
  | { state: "loaded"; message: null }
  | { state: "error"; message: string }

export type SessionBootstrapState =
  | { status: "loading"; attempt: number }
  | { status: "ready"; attempt: number }
  | { status: "error"; attempt: number; message: string }

export type SessionLifecyclePhase =
  | { kind: "live" }
  | { kind: "closing"; attemptId: string }
  | { kind: "disposed" }

export type AnalysisSourceKey =
  | { kind: "course"; courseId: string }
  | { kind: "folder"; path: string }
  | { kind: "submission"; path: string; courseId: string | null }

export type SessionTransactionDescriptor =
  | { kind: "bootstrap" }
  | {
      kind: "enter"
      targetSurface: PersistedActiveSurface
      leavingCourseId: string | null
    }
  | {
      kind: "create"
      targetSurface: PersistedActiveSurface
      leavingCourseId: string | null
    }
  | { kind: "duplicate" }
  | { kind: "rename" }
  | { kind: "delete"; courseId: string; blocksCourseMutation: boolean }

export type SessionTransactionsState = {
  admitted: ReadonlyMap<number, SessionTransactionDescriptor>
  runningTurnId: number | null
}

export type SessionControllerSnapshot = {
  bootstrap: SessionBootstrapState
  lifecycle: SessionLifecyclePhase
  settings: SessionSettingsState
  courseLoadStatus: CourseLoadStatus
  courseSyncStatus: PersistenceSyncStatus
  transactions: SessionTransactionsState
  commandError: string | null
}

export const emptyCourseLoadStatus: CourseLoadStatus = {
  state: "empty",
  message: null,
}

export function analysisSourceKeyFromSurface(
  surface: PersistedActiveSurface,
): AnalysisSourceKey | null {
  if (surface.kind === "course")
    return { kind: "course", courseId: surface.courseId }
  if (surface.kind === "folder") return { kind: "folder", path: surface.path }
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
  return {
    bootstrap: { status: "loading", attempt: 0 },
    lifecycle: { kind: "live" },
    settings: createInitialSessionSettingsState(),
    courseLoadStatus: emptyCourseLoadStatus,
    courseSyncStatus: idleSyncStatus,
    transactions: { admitted: new Map(), runningTurnId: null },
    commandError: null,
  }
}

export type SessionReducerEvent =
  | { type: "bootstrap-start"; attempt: number }
  | {
      type: "bootstrap-seed"
      attempt: number
      credentials: PersistedAppCredentials
      preferences: PersistedAppPreferences
    }
  | { type: "bootstrap-ready"; attempt: number }
  | { type: "bootstrap-failed"; attempt: number; message: string }
  | { type: "close-start"; attemptId: string }
  | { type: "close-restore"; attemptId: string }
  | { type: "preference"; event: PreferenceEvent }
  | { type: "credential"; event: CredentialEvent }
  | {
      type: "settings-workers-installed"
      credentialsWorkerId: number
      preferencesWorkerId: number
    }
  | { type: "settings-workers-retired" }
  | {
      type: "settings-worker-status"
      scope: SettingsWorkerScope
      workerId: number
      status: PersistenceSyncStatus
    }
  | { type: "dismiss-sync-error"; scope: "settings" | "course" }
  | {
      type: "transaction-enter"
      turnId: number
      descriptor: SessionTransactionDescriptor
    }
  | {
      type: "transaction-start"
      turnId: number
      descriptor: SessionTransactionDescriptor
    }
  | { type: "transaction-retire"; turnId: number }
  | {
      type: "surface-commit"
      turnId: number
      surface: PersistedActiveSurface
      tab: PersistedAppPreferences["activeTab"]
      courseLoadStatus: CourseLoadStatus
      preferenceEvents: readonly PreferenceEvent[]
    }
  | { type: "set-course-load-status"; turnId: number; status: CourseLoadStatus }
  | { type: "set-course-sync-status"; status: PersistenceSyncStatus }
  | {
      type: "command-failed"
      turnId: number
      message: string
      courseLoadStatus?: CourseLoadStatus
    }
  | { type: "clear-command-error" }
  | { type: "dispose" }

function updateSettings(
  state: SessionControllerSnapshot,
  settings: SessionSettingsState,
): SessionControllerSnapshot {
  return settings === state.settings ? state : { ...state, settings }
}

function retireTurn(
  transactions: SessionTransactionsState,
  turnId: number,
): SessionTransactionsState {
  if (!transactions.admitted.has(turnId)) return transactions
  const admitted = new Map(transactions.admitted)
  admitted.delete(turnId)
  return {
    admitted,
    runningTurnId:
      transactions.runningTurnId === turnId ? null : transactions.runningTurnId,
  }
}

export function sessionReducer(
  state: SessionControllerSnapshot,
  event: SessionReducerEvent,
): SessionControllerSnapshot {
  if (state.lifecycle.kind === "disposed" && event.type !== "dispose")
    return state

  switch (event.type) {
    case "bootstrap-start":
      if (state.bootstrap.status === "loading" && state.bootstrap.attempt !== 0)
        return state
      return {
        ...state,
        bootstrap: { status: "loading", attempt: event.attempt },
        courseLoadStatus: emptyCourseLoadStatus,
        commandError: null,
      }
    case "bootstrap-seed":
      if (
        state.bootstrap.status !== "loading" ||
        state.bootstrap.attempt !== event.attempt
      )
        return state
      return {
        ...state,
        settings: {
          ...state.settings,
          credentials: event.credentials,
          preferences: {
            ...event.preferences,
            activeSurface: state.settings.preferences.activeSurface,
            activeTab: state.settings.preferences.activeTab,
          },
        },
      }
    case "bootstrap-ready":
      if (
        state.bootstrap.status !== "loading" ||
        state.bootstrap.attempt !== event.attempt
      )
        return state
      return {
        ...state,
        bootstrap: { status: "ready", attempt: event.attempt },
        commandError: null,
      }
    case "bootstrap-failed":
      if (
        state.bootstrap.status !== "loading" ||
        state.bootstrap.attempt !== event.attempt
      )
        return state
      return {
        ...state,
        bootstrap: {
          status: "error",
          attempt: event.attempt,
          message: event.message,
        },
      }
    case "close-start":
      return state.lifecycle.kind === "live"
        ? {
            ...state,
            lifecycle: { kind: "closing", attemptId: event.attemptId },
          }
        : state
    case "close-restore":
      return state.lifecycle.kind === "closing" &&
        state.lifecycle.attemptId === event.attemptId
        ? { ...state, lifecycle: { kind: "live" } }
        : state
    case "preference": {
      if (state.lifecycle.kind !== "live") return state
      const preferences = reducePreferences(
        state.settings.preferences,
        event.event,
      )
      return updateSettings(
        state,
        preferences === state.settings.preferences
          ? state.settings
          : { ...state.settings, preferences },
      )
    }
    case "credential": {
      if (state.lifecycle.kind !== "live") return state
      const credentials = reduceCredentials(
        state.settings.credentials,
        event.event,
      ).credentials
      return updateSettings(
        state,
        credentials === state.settings.credentials
          ? state.settings
          : { ...state.settings, credentials },
      )
    }
    case "settings-workers-installed":
      return {
        ...state,
        settings: {
          ...state.settings,
          credentialsWorkerId: event.credentialsWorkerId,
          preferencesWorkerId: event.preferencesWorkerId,
          credentialsSyncStatus: idleSyncStatus,
          preferencesSyncStatus: idleSyncStatus,
        },
      }
    case "settings-workers-retired":
      return {
        ...state,
        settings: {
          ...state.settings,
          credentialsWorkerId: null,
          preferencesWorkerId: null,
          credentialsSyncStatus: idleSyncStatus,
          preferencesSyncStatus: idleSyncStatus,
        },
      }
    case "settings-worker-status": {
      if (state.lifecycle.kind === "disposed") return state
      const workerId =
        event.scope === "credentials"
          ? state.settings.credentialsWorkerId
          : state.settings.preferencesWorkerId
      if (workerId !== event.workerId) return state
      return {
        ...state,
        settings: {
          ...state.settings,
          ...(event.scope === "credentials"
            ? { credentialsSyncStatus: event.status }
            : { preferencesSyncStatus: event.status }),
        },
      }
    }
    case "dismiss-sync-error":
      if (event.scope === "course") {
        return state.courseSyncStatus.state === "error"
          ? { ...state, courseSyncStatus: idleSyncStatus }
          : state
      }
      return {
        ...state,
        settings: {
          ...state.settings,
          credentialsSyncStatus:
            state.settings.credentialsSyncStatus.state === "error"
              ? idleSyncStatus
              : state.settings.credentialsSyncStatus,
          preferencesSyncStatus:
            state.settings.preferencesSyncStatus.state === "error"
              ? idleSyncStatus
              : state.settings.preferencesSyncStatus,
        },
      }
    case "transaction-enter": {
      if (
        state.lifecycle.kind !== "live" ||
        state.transactions.admitted.has(event.turnId)
      )
        return state
      const admitted = new Map(state.transactions.admitted)
      admitted.set(event.turnId, event.descriptor)
      return {
        ...state,
        transactions: { ...state.transactions, admitted },
        commandError: null,
      }
    }
    case "transaction-start":
      if (
        !state.transactions.admitted.has(event.turnId) ||
        state.transactions.runningTurnId !== null
      )
        return state
      return {
        ...state,
        transactions: {
          admitted: new Map(state.transactions.admitted).set(
            event.turnId,
            event.descriptor,
          ),
          runningTurnId: event.turnId,
        },
      }
    case "transaction-retire": {
      const transactions = retireTurn(state.transactions, event.turnId)
      return transactions === state.transactions
        ? state
        : { ...state, transactions }
    }
    case "surface-commit": {
      if (state.transactions.runningTurnId !== event.turnId) return state
      const switchingCourse =
        activeCourseIdFromSurface(state.settings.preferences.activeSurface) !==
        activeCourseIdFromSurface(event.surface)
      let preferences = reducePreferences(state.settings.preferences, {
        type: "set-navigation",
        surface: event.surface,
        tab: event.tab,
      })
      for (const contribution of event.preferenceEvents) {
        preferences = reducePreferences(preferences, contribution)
      }
      return {
        ...state,
        settings: { ...state.settings, preferences },
        courseLoadStatus: event.courseLoadStatus,
        courseSyncStatus: switchingCourse
          ? idleSyncStatus
          : state.courseSyncStatus,
        commandError: null,
      }
    }
    case "set-course-load-status":
      return state.transactions.runningTurnId === event.turnId
        ? { ...state, courseLoadStatus: event.status }
        : state
    case "set-course-sync-status":
      return { ...state, courseSyncStatus: event.status }
    case "command-failed":
      if (state.transactions.runningTurnId !== event.turnId) return state
      return {
        ...state,
        ...(event.courseLoadStatus === undefined
          ? {}
          : { courseLoadStatus: event.courseLoadStatus }),
        commandError: event.message,
      }
    case "clear-command-error":
      return state.commandError === null
        ? state
        : { ...state, commandError: null }
    case "dispose":
      return {
        ...state,
        lifecycle: { kind: "disposed" },
        transactions: { admitted: new Map(), runningTurnId: null },
      }
  }
}

export function transactionDescriptor(
  snapshot: SessionControllerSnapshot,
  turnId: number,
): SessionTransactionDescriptor | null {
  return snapshot.transactions.admitted.get(turnId) ?? null
}

export function canContinueTransaction(
  snapshot: SessionControllerSnapshot,
  turnId: number,
): boolean {
  return (
    snapshot.lifecycle.kind !== "disposed" &&
    snapshot.transactions.runningTurnId === turnId
  )
}

export function canAdmitCourseMutation(
  snapshot: SessionControllerSnapshot,
  targetCourseId: string | null,
): boolean {
  if (snapshot.lifecycle.kind !== "live") return false
  if (
    targetCourseId === null ||
    targetCourseId !==
      activeCourseIdFromSurface(snapshot.settings.preferences.activeSurface)
  )
    return false
  const running = snapshot.transactions.runningTurnId
  if (running === null) return true
  const descriptor = snapshot.transactions.admitted.get(running)
  if (descriptor?.kind === "delete" && descriptor.blocksCourseMutation)
    return targetCourseId !== descriptor.courseId
  if (
    (descriptor?.kind === "enter" || descriptor?.kind === "create") &&
    descriptor.leavingCourseId !== null
  ) {
    return targetCourseId !== descriptor.leavingCourseId
  }
  return true
}
