import type { RendererHost } from "@repo-edu/renderer-host-contract"
import { clearRendererHost, setRendererHost } from "./contexts/renderer-host.js"
import {
  clearWorkflowClient,
  setWorkflowClient,
} from "./contexts/workflow-client.js"
import type { SessionOperationGateway } from "./session/session-operations.js"

export type AppConfiguration = {
  workflowClient: SessionOperationGateway
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
