import type { WorkflowHandlerMap } from "@repo-edu/application-contract"
import { createAnalysisRunHandler } from "./analysis-handler.js"
import { createAnalysisBlameHandler } from "./blame-handler.js"
import type { AnalysisWorkflowPorts } from "./ports.js"

export function createAnalysisWorkflowHandlers(
  ports: AnalysisWorkflowPorts,
): Pick<
  WorkflowHandlerMap<"analysis.run" | "analysis.blame">,
  "analysis.run" | "analysis.blame"
> {
  return {
    ...createAnalysisRunHandler(ports),
    ...createAnalysisBlameHandler(ports),
  }
}
