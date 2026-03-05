import { createContext, useContext } from "react";
import type { WorkflowClient } from "@repo-edu/application-contract";

let currentClient: WorkflowClient | null = null;

export function setWorkflowClient(client: WorkflowClient): void {
  currentClient = client;
}

export function clearWorkflowClient(): void {
  currentClient = null;
}

export function getWorkflowClient(): WorkflowClient {
  if (!currentClient) {
    throw new Error(
      "WorkflowClient not initialized. Call setWorkflowClient() before using stores.",
    );
  }
  return currentClient;
}

const WorkflowClientContext = createContext<WorkflowClient | null>(null);

export const WorkflowClientProvider = WorkflowClientContext.Provider;

export function useWorkflowClient(): WorkflowClient {
  const client = useContext(WorkflowClientContext);
  if (!client) {
    throw new Error(
      "useWorkflowClient must be used within a WorkflowClientProvider.",
    );
  }
  return client;
}
