import type { WorkflowId } from "@repo-edu/application-contract"

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
  "groupSet.connectFromLms": "exclusive",
  "groupSet.syncFromLms": "exclusive",
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
  "examination.stopGeneration": "cancellation",
  "examination.lookupQuestions": "ordinary",
  "examination.prepareSubmissionSource": "ordinary",
  "examination.lookupQuestionSummaries": "ordinary",
  "examination.archive.export": "exclusive",
  "examination.archive.import": "exclusive",
} as const satisfies Record<WorkflowId, string>

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
