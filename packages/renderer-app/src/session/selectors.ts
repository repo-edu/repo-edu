import type { SessionControllerSnapshot } from "./session-reducer.js"

export const selectBootstrapState = (snapshot: SessionControllerSnapshot) =>
  snapshot.bootstrap
export const selectActiveSurface = (snapshot: SessionControllerSnapshot) =>
  snapshot.activeSurface
export const selectActiveTab = (snapshot: SessionControllerSnapshot) =>
  snapshot.activeTab
export const selectActiveCourseId = (snapshot: SessionControllerSnapshot) =>
  snapshot.activeCourseId
export const selectActiveAnalysisSourceKey = (
  snapshot: SessionControllerSnapshot,
) => snapshot.activeAnalysisSourceKey
export const selectCourseLoadStatus = (snapshot: SessionControllerSnapshot) =>
  snapshot.courseLoadStatus
export const selectSettingsSyncStatus = (snapshot: SessionControllerSnapshot) =>
  snapshot.settingsSyncStatus
export const selectCourseSyncStatus = (snapshot: SessionControllerSnapshot) =>
  snapshot.courseSyncStatus
export const selectVisibleSyncScope = (
  snapshot: SessionControllerSnapshot,
): "settings" | "course" | null => {
  if (snapshot.settingsSyncStatus.state === "error") return "settings"
  if (snapshot.courseSyncStatus.state === "error") return "course"
  return null
}
export const selectCommandError = (snapshot: SessionControllerSnapshot) =>
  snapshot.commandError
