import type { WorkflowHandlerMap } from "@repo-edu/application-contract"
import { createAnalysisRunHandler } from "./analysis-handler.js"
import { createAnalysisBlameHandler } from "./blame-handler.js"
import { createDiscoverReposHandler } from "./discover-repos-handler.js"
import type { AnalysisWorkflowPorts } from "./ports.js"
import { createAnalysisSnapshotHeadHandler } from "./snapshot-head-handler.js"
import { createSubmissionFolderHandlers } from "./submission-folder-handler.js"

type AnalysisWorkflowId =
  | "analysis.run"
  | "analysis.resolveSnapshotHead"
  | "analysis.blame"
  | "analysis.discoverRepos"
  | "analysis.listFolderFiles"
  | "analysis.readFolderFile"

export function createAnalysisWorkflowHandlers(
  ports: AnalysisWorkflowPorts,
): Pick<WorkflowHandlerMap<AnalysisWorkflowId>, AnalysisWorkflowId> {
  return {
    ...createAnalysisSnapshotHeadHandler(ports),
    ...createAnalysisRunHandler(ports),
    ...createAnalysisBlameHandler(ports),
    ...createDiscoverReposHandler(ports),
    ...createSubmissionFolderHandlers(ports),
  }
}
