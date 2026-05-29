import type { WorkflowClient } from "@repo-edu/application-contract"
import { createContext, useContext } from "react"
import type { AppWorkflowId } from "../session/workflow-types.js"

let currentClient: WorkflowClient<AppWorkflowId> | null = null

export function setWorkflowClient(client: WorkflowClient<AppWorkflowId>): void {
  currentClient = client
}

export function clearWorkflowClient(): void {
  currentClient = null
}

export function getWorkflowClient(): WorkflowClient<AppWorkflowId> {
  if (!currentClient) {
    throw new Error(
      "WorkflowClient not initialized. Call setWorkflowClient() before using stores.",
    )
  }
  return currentClient
}

const WorkflowClientContext =
  createContext<WorkflowClient<AppWorkflowId> | null>(null)

export const WorkflowClientProvider = WorkflowClientContext.Provider

export function useWorkflowClient(): WorkflowClient<AppWorkflowId> {
  const client = useContext(WorkflowClientContext)
  if (!client) {
    throw new Error(
      "useWorkflowClient must be used within a WorkflowClientProvider.",
    )
  }
  return client
}
