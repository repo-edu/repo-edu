import type {
  OrdinaryWorkflowId,
  WorkflowId,
} from "@repo-edu/application-contract"

/** Decision 21 owns these classes; the shared catalogue does not infer them. */
export const desktopWorkflowStarts = {
  "course.list": "ordinary",
  "course.load": "startup-or-ordinary",
  "course.save": "ordinary",
  "course.delete": "ordinary",
  "settings.loadApp": "startup",
  "settings.saveCredentials": "ordinary",
  "settings.savePreferences": "ordinary",
  "connection.verifyLmsDraft": "ordinary",
  "connection.listLmsCoursesDraft": "ordinary",
  "connection.verifyGitDraft": "ordinary",
  "connection.verifyLlmDraft": "ordinary",
  "roster.importFromFile": "exclusive",
  "roster.importFromLms": "ordinary",
  "roster.exportMembers": "exclusive",
  "groupSet.fetchAvailableFromLms": "ordinary",
  "groupSet.connectFromLms": "ordinary",
  "groupSet.syncFromLms": "ordinary",
  "groupSet.previewImportFromFile": "ordinary",
  "groupSet.importFromFile": "exclusive",
  "groupSet.export": "exclusive",
  "gitUsernames.import": "exclusive",
  "validation.roster": "ordinary",
  "validation.assignment": "ordinary",
  "repo.create": "exclusive",
  "repo.clone": "exclusive",
  "repo.update": "exclusive",
  "repo.listNamespace": "ordinary",
  "repo.bulkClone": "exclusive",
  "userFile.inspectSelection": "ordinary",
  "userFile.exportPreview": "exclusive",
  "analysis.run": "ordinary",
  "analysis.resolveSnapshotHead": "ordinary",
  "analysis.blame": "ordinary",
  "analysis.discoverRepos": "ordinary",
  "analysis.listFolderFiles": "ordinary",
  "analysis.readFolderFile": "ordinary",
  "examination.generateQuestions": "exclusive",
  "examination.lookupQuestions": "ordinary",
  "examination.prepareSubmissionSource": "ordinary",
  "examination.lookupQuestionSummaries": "ordinary",
  "examination.archive.export": "exclusive",
  "examination.archive.import": "exclusive",
} as const satisfies Record<WorkflowId, string>

type DesktopTrpcWorkflowId = {
  [K in WorkflowId]: (typeof desktopWorkflowStarts)[K] extends "exclusive"
    ? never
    : K
}[WorkflowId]

// The desktop classes and the shared contract must name the same tRPC set.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _trpcIdsAgree: Same<DesktopTrpcWorkflowId, OrdinaryWorkflowId> = true
void _trpcIdsAgree

/** Only these ids start over the ordinary tRPC wire. Exclusive commands never
 * have a tRPC procedure, wire path or client entry. */
export function isDesktopTrpcWorkflowId(
  id: WorkflowId,
): id is OrdinaryWorkflowId {
  return desktopWorkflowStarts[id] !== "exclusive"
}

export const desktopTrpcWorkflowIds: readonly OrdinaryWorkflowId[] = (
  Object.keys(desktopWorkflowStarts) as WorkflowId[]
).filter(isDesktopTrpcWorkflowId)

export const desktopShellActions = {
  pickUserFile: "session-changing",
  pickSaveTarget: "session-changing",
  pickDirectory: "session-changing",
  setNativeTheme: "presentation-only",
  downloadUpdate: "presentation-only",
} as const

export const desktopHostStarts = {
  "window-close": "close",
  "application-quit": "close",
  "menu-close": "close",
  "menu-quit": "close",
  "menu-update-restart": "update-restart",
} as const

export type DesktopHostStart = keyof typeof desktopHostStarts
export type DesktopShellAction = keyof typeof desktopShellActions
