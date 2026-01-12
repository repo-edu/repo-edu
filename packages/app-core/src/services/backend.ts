import type { BackendAPI } from "@repo-edu/backend-interface";

let currentBackend: BackendAPI | null = null;

export function setBackend(backend: BackendAPI) {
  currentBackend = backend;
}

export function getBackend(): BackendAPI {
  if (!currentBackend) {
    throw new Error("Backend not initialized. Call setBackend() first.");
  }
  return currentBackend;
}
