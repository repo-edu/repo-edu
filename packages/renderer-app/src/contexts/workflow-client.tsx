import { createContext, useContext } from "react"
import type { SessionOperationGateway } from "../session/session-operations.js"

let currentClient: SessionOperationGateway | null = null

export function setWorkflowClient(client: SessionOperationGateway): void {
  currentClient = client
}

export function clearWorkflowClient(): void {
  currentClient = null
}

export function getWorkflowClient(): SessionOperationGateway {
  if (!currentClient) {
    throw new Error(
      "WorkflowClient not initialized. Call setWorkflowClient() before using stores.",
    )
  }
  return currentClient
}

const WorkflowClientContext = createContext<SessionOperationGateway | null>(
  null,
)

export const WorkflowClientProvider = WorkflowClientContext.Provider

export function useWorkflowClient(): SessionOperationGateway {
  const client = useContext(WorkflowClientContext)
  if (!client) {
    throw new Error(
      "useWorkflowClient must be used within a WorkflowClientProvider.",
    )
  }
  return client
}
