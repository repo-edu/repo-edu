import { activeCourseIdFromSurface } from "@repo-edu/domain/active-surface"
import {
  resolveActiveGitConnection,
  resolveActiveLlmConnection,
} from "@repo-edu/domain/connection"
import type { PersistenceSyncStatus } from "../persistence/create-persister.js"
import type { SessionControllerSnapshot } from "./session-reducer.js"

export const selectBootstrapState = (snapshot: SessionControllerSnapshot) =>
  snapshot.bootstrap
export const selectLifecyclePhase = (snapshot: SessionControllerSnapshot) =>
  snapshot.lifecycle
export const selectPreferences = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.preferences
export const selectCredentials = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.credentials
export const selectActiveSurface = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.preferences.activeSurface
export const selectActiveTab = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.preferences.activeTab
export const selectActiveCourseId = (snapshot: SessionControllerSnapshot) =>
  activeCourseIdFromSurface(snapshot.settings.preferences.activeSurface)
export const selectCourseLoadStatus = (snapshot: SessionControllerSnapshot) =>
  snapshot.courseLoadStatus

export function selectSettingsSyncState(
  snapshot: SessionControllerSnapshot,
): PersistenceSyncStatus["state"] {
  const credentials = snapshot.settings.credentialsSyncStatus
  const preferences = snapshot.settings.preferencesSyncStatus
  if (credentials.state === "error" || preferences.state === "error")
    return "error"
  if (credentials.state === "saving" || preferences.state === "saving")
    return "saving"
  return "idle"
}

export function selectSettingsSyncErrorMessage(
  snapshot: SessionControllerSnapshot,
): string | null {
  const credentials = snapshot.settings.credentialsSyncStatus
  const preferences = snapshot.settings.preferencesSyncStatus
  if (credentials.state === "error" && preferences.state === "error")
    return `${credentials.message} ${preferences.message}`
  if (credentials.state === "error") return credentials.message
  if (preferences.state === "error") return preferences.message
  return null
}

export const selectCourseSyncStatus = (snapshot: SessionControllerSnapshot) =>
  snapshot.courseSyncStatus
export const selectVisibleSyncScope = (
  snapshot: SessionControllerSnapshot,
): "settings" | "course" | null => {
  if (selectSettingsSyncState(snapshot) === "error") return "settings"
  if (snapshot.courseSyncStatus.state === "error") return "course"
  return null
}
export const selectCommandError = (snapshot: SessionControllerSnapshot) =>
  snapshot.commandError

export const selectTheme = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.preferences.appearance.theme
export const selectExaminationModelsByProvider = (
  snapshot: SessionControllerSnapshot,
) => snapshot.settings.preferences.examinationModelsByProvider
export const selectRosterColumnVisibility = (
  snapshot: SessionControllerSnapshot,
) => snapshot.settings.preferences.rosterColumnVisibility
export const selectRosterColumnSizing = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.preferences.rosterColumnSizing
export const selectLmsConnections = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.credentials.lmsConnections
export const selectGitConnections = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.credentials.gitConnections
export const selectActiveGitConnectionId = (
  snapshot: SessionControllerSnapshot,
) => snapshot.settings.credentials.activeGitConnectionId
export const selectActiveGitConnection = (
  snapshot: SessionControllerSnapshot,
) =>
  resolveActiveGitConnection(
    snapshot.settings.credentials.gitConnections,
    snapshot.settings.credentials.activeGitConnectionId,
  )
export const selectLlmConnections = (snapshot: SessionControllerSnapshot) =>
  snapshot.settings.credentials.llmConnections
export const selectActiveLlmConnectionId = (
  snapshot: SessionControllerSnapshot,
) => snapshot.settings.credentials.activeLlmConnectionId
export const selectActiveLlmConnection = (
  snapshot: SessionControllerSnapshot,
) =>
  resolveActiveLlmConnection(
    snapshot.settings.credentials.llmConnections,
    snapshot.settings.credentials.activeLlmConnectionId,
  )
