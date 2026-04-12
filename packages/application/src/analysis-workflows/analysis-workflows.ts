import type { WorkflowHandlerMap } from "@repo-edu/application-contract"
import { createAnalysisRunHandler } from "./analysis-handler.js"
import { createAnalysisBlameHandler } from "./blame-handler.js"
import { createDiscoverReposHandler } from "./discover-repos-handler.js"
import type { AnalysisWorkflowPorts } from "./ports.js"

type AnalysisWorkflowId =
  | "analysis.run"
  | "analysis.blame"
  | "analysis.discoverRepos"

export function createAnalysisWorkflowHandlers(
  ports: AnalysisWorkflowPorts,
): Pick<WorkflowHandlerMap<AnalysisWorkflowId>, AnalysisWorkflowId> {
  return {
    ...createAnalysisRunHandler(ports),
    ...createAnalysisBlameHandler(ports),
    ...createDiscoverReposHandler(ports),
  }
}
