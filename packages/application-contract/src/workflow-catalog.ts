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
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "course.load": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "course.save": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "course.delete": {
    delivery: ["desktop", "docs"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "settings.loadApp": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "settings.saveCredentials": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "settings.savePreferences": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "connection.verifyLmsDraft": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.listLmsCoursesDraft": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.verifyGitDraft": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "connection.verifyLlmDraft": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "roster.importFromFile": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "roster.importFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "roster.exportMembers": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.fetchAvailableFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.connectFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.syncFromLms": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "groupSet.previewImportFromFile": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.importFromFile": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "groupSet.export": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "gitUsernames.import": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "validation.roster": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "validation.assignment": {
    delivery: ["desktop", "docs", "cli"],
    progress: "none",
    cancellation: "non-cancellable",
  },
  "repo.create": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.clone": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.update": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.listNamespace": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "repo.bulkClone": {
    delivery: ["desktop", "docs", "cli"],
    progress: "milestone",
    cancellation: "best-effort",
  },
  "userFile.inspectSelection": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "userFile.exportPreview": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "analysis.run": {
    delivery: ["desktop", "docs"],
    progress: "granular",
    cancellation: "cooperative",
  },
  "analysis.blame": {
    delivery: ["desktop", "docs"],
    progress: "granular",
    cancellation: "cooperative",
  },
  "analysis.discoverRepos": {
    delivery: ["desktop", "docs"],
    progress: "granular",
    cancellation: "best-effort",
  },
  "analysis.listFolderFiles": {
    delivery: ["desktop", "docs"],
    progress: "none",
    cancellation: "cooperative",
  },
  "analysis.readFolderFile": {
    delivery: ["desktop", "docs"],
    progress: "none",
    cancellation: "cooperative",
  },
  "examination.generateQuestions": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.stopGeneration": {
    delivery: ["desktop", "docs"],
    progress: "none",
    cancellation: "cooperative",
  },
  "examination.lookupQuestions": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.prepareSubmissionSource": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.lookupQuestionSummaries": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.archive.export": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
  "examination.archive.import": {
    delivery: ["desktop", "docs"],
    progress: "milestone",
    cancellation: "cooperative",
  },
}
