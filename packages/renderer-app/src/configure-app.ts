import type { WorkflowClient } from "@repo-edu/application-contract"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { clearRendererHost, setRendererHost } from "./contexts/renderer-host.js"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "./contexts/workflow-client.js"
import type { AppWorkflowId } from "./session/workflow-types.js"

export type AppConfiguration = {
  workflowClient: WorkflowClient<AppWorkflowId>
  rendererHost: RendererHost
}

export function configureApp({
  workflowClient,
  rendererHost,
}: AppConfiguration): () => void {
  setWorkflowClient(workflowClient)
  setRendererHost(rendererHost)

  return () => {
    clearWorkflowClient()
    clearRendererHost()
  }
}
