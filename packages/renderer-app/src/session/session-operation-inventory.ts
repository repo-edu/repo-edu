import type { WorkflowId } from "@repo-edu/application-contract"

// Decision 21 assigns these classes. Read-only host work can still supply
// command input, so its renderer publication belongs to the session.
export const sessionWorkflowClasses = {
  "course.list": "session-changing",
  "course.load": "session-changing",
  "course.save": "session-changing",
  "course.delete": "session-changing",
  "settings.loadApp": "session-changing",
  "settings.saveCredentials": "session-changing",
  "settings.savePreferences": "session-changing",
  "connection.verifyLmsDraft": "presentation-only",
  "connection.listLmsCoursesDraft": "presentation-only",
  "connection.verifyGitDraft": "presentation-only",
  "connection.verifyLlmDraft": "presentation-only",
  "roster.importFromFile": "command",
  "roster.importFromLms": "session-changing",
  "roster.exportMembers": "command",
  "groupSet.fetchAvailableFromLms": "session-changing",
  "groupSet.connectFromLms": "command",
  "groupSet.syncFromLms": "command",
  "groupSet.previewImportFromFile": "session-changing",
  "groupSet.importFromFile": "command",
  "groupSet.export": "command",
  "gitUsernames.import": "command",
  "validation.roster": "presentation-only",
  "validation.assignment": "presentation-only",
  "repo.create": "command",
  "repo.clone": "command",
  "repo.update": "command",
  "repo.listNamespace": "session-changing",
  "repo.bulkClone": "command",
  "userFile.inspectSelection": "session-changing",
  "userFile.exportPreview": "command",
  "analysis.run": "session-changing",
  "analysis.resolveSnapshotHead": "session-changing",
  "analysis.blame": "session-changing",
  "analysis.discoverRepos": "session-changing",
  "analysis.listFolderFiles": "session-changing",
  "analysis.readFolderFile": "session-changing",
  "examination.generateQuestions": "command",
  "examination.stopGeneration": "request-control",
  "examination.lookupQuestions": "session-changing",
  "examination.prepareSubmissionSource": "session-changing",
  "examination.lookupQuestionSummaries": "session-changing",
  "examination.archive.export": "command",
  "examination.archive.import": "command",
} as const satisfies Record<
  WorkflowId,
  "presentation-only" | "session-changing" | "command" | "request-control"
>

type WorkflowOfClass<C extends string> = {
  [K in WorkflowId]: (typeof sessionWorkflowClasses)[K] extends C ? K : never
}[WorkflowId]

export type PresentationWorkflowId = WorkflowOfClass<"presentation-only">
export type SessionQueryWorkflowId = WorkflowOfClass<"session-changing">
export type SessionWorkflowId = WorkflowOfClass<"session-changing" | "command">

export function isSessionWorkflow(id: WorkflowId): id is SessionWorkflowId {
  const classification = sessionWorkflowClasses[id]
  return classification === "session-changing" || classification === "command"
}

export const sessionDirectClasses = {
  pickUserFile: "session-changing",
  pickSaveTarget: "session-changing",
  pickDirectory: "session-changing",
  setNativeTheme: "presentation-only",
  downloadUpdate: "presentation-only",
  quitAndInstall: "session-changing",
  bootstrapReady: "session-changing",
} as const

export type SessionDirectId = {
  [K in keyof typeof sessionDirectClasses]: (typeof sessionDirectClasses)[K] extends "session-changing"
    ? K
    : never
}[keyof typeof sessionDirectClasses]

export type SessionOperationId = SessionWorkflowId | SessionDirectId
export type PresentationDirectId = Exclude<
  keyof typeof sessionDirectClasses,
  SessionDirectId
>

export function sessionOperationKind(
  operation: SessionOperationId,
): "operation" | "command" {
  const classification = Object.hasOwn(sessionWorkflowClasses, operation)
    ? sessionWorkflowClasses[operation as WorkflowId]
    : Object.hasOwn(sessionDirectClasses, operation)
      ? sessionDirectClasses[operation as SessionDirectId]
      : undefined
  if (classification === "command") return "command"
  if (classification === "session-changing") return "operation"
  throw new Error("The entry is not a session-changing operation.")
}
