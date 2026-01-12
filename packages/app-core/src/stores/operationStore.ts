/**
 * Operation store - tracks selected operation and execution status.
 * Used for repo create/clone/delete operations.
 */

import { create } from "zustand"

type OperationType = "create" | "clone" | "delete"
type OperationStatus = "idle" | "running" | "success" | "error"

interface OperationState {
  selected: OperationType
  status: OperationStatus
  error: string | null
}

interface OperationActions {
  setSelected: (operation: OperationType) => void
  setStatus: (status: OperationStatus) => void
  setError: (error: string | null) => void
  reset: () => void
}

interface OperationStore extends OperationState, OperationActions {}

const initialState: OperationState = {
  selected: "create",
  status: "idle",
  error: null,
}

export const useOperationStore = create<OperationStore>((set) => ({
  ...initialState,

  setSelected: (operation) => set({ selected: operation }),

  setStatus: (status) => set({ status }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}))

// Selector helpers
export const selectSelectedOperation = (state: OperationStore) => state.selected
export const selectOperationStatus = (state: OperationStore) => state.status
export const selectOperationError = (state: OperationStore) => state.error
