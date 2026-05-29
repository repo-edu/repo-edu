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
export const selectVisibleSyncStatus = (snapshot: SessionControllerSnapshot) =>
  snapshot.settingsSyncStatus.state === "error"
    ? { scope: "settings" as const, status: snapshot.settingsSyncStatus }
    : snapshot.courseSyncStatus.state === "error"
      ? { scope: "course" as const, status: snapshot.courseSyncStatus }
      : null
