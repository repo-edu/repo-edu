// New roster-centric stores
export { useAppSettingsStore } from "./appSettingsStore"
export { useConnectionsStore } from "./connectionsStore"
export { useOperationStore } from "./operationStore"
export {
  useOutputStore,
  selectOutputLines,
  selectOutputText,
} from "./outputStore"
export { useProfileSettingsStore } from "./profileSettingsStore"
export {
  useRosterStore,
  selectRoster,
  selectStudents,
  selectAssignments,
  selectSelectedAssignmentId,
  selectSelectedAssignment,
  selectGroups,
} from "./rosterStore"
export type { ActiveTab } from "./uiStore"
export { useUiStore } from "./uiStore"

// Legacy exports (kept for backward compatibility during migration)
// These will be removed once UI components are updated in Phase 6
export type { LmsFormState } from "./lmsFormStore"
export { lmsFormInitialState, useLmsFormStore } from "./lmsFormStore"
export type { RepoFormState } from "./repoFormStore"
export { repoFormInitialState, useRepoFormStore } from "./repoFormStore"
