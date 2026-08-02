import type {
  DeliverySurface,
  WorkflowExecutionProfile,
} from "./workflow-core.js"
import type { WorkflowId } from "./workflow-payloads.js"

type WorkflowMetadata = WorkflowExecutionProfile & {
  delivery: readonly DeliverySurface[]
}

export const workflowCatalog: Record<WorkflowId, WorkflowMetadata> = {
  "course.list": {
    delivery: ["desktop", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "course.load": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "course.save": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "course.delete": {
    delivery: ["desktop"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "settings.loadApp": {
    delivery: ["desktop", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "settings.saveCredentials": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "settings.savePreferences": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "connection.verifyLmsDraft": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.listLmsCoursesDraft": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.verifyGitDraft": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.verifyLlmDraft": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "roster.importFromFile": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "roster.importFromLms": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "roster.exportMembers": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.fetchAvailableFromLms": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.connectFromLms": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.syncFromLms": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.previewImportFromFile": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.importFromFile": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.export": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "gitUsernames.import": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "validation.roster": {
    delivery: ["desktop", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "validation.assignment": {
    delivery: ["desktop", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "repo.create": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.clone": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.update": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.listNamespace": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.bulkClone": {
    delivery: ["desktop", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "userFile.inspectSelection": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "userFile.exportPreview": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "analysis.run": {
    delivery: ["desktop"],
    progress: "granular",
    cancellation: "cooperative",
  },
  "analysis.resolveSnapshotHead": {
    delivery: ["desktop"],
    progress: "none",
    cancellation: "cooperative",
  },
  "analysis.blame": {
    delivery: ["desktop"],
    progress: "granular",
    cancellation: "cooperative",
  },
  "analysis.discoverRepos": {
    delivery: ["desktop"],
    progress: "granular",
    cancellation: "best-effort",
  },
  "analysis.listFolderFiles": {
    delivery: ["desktop"],
    progress: "none",
    cancellation: "cooperative",
  },
  "analysis.readFolderFile": {
    delivery: ["desktop"],
    progress: "none",
    cancellation: "cooperative",
  },
  "examination.generateQuestions": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.stopGeneration": {
    delivery: ["desktop"],
    progress: "none",
    cancellation: "cooperative",
  },
  "examination.lookupQuestions": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.prepareSubmissionSource": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.lookupQuestionSummaries": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.archive.export": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.archive.import": {
    delivery: ["desktop"],
    progress: "milestone",
    cancellation: "cooperative",
  },
}
