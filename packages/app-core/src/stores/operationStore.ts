/**
 * Operation store - tracks selected operation and execution status.
 * Used for repo create/clone/delete operations.
 */

import type {
  RepoPreflightResult,
  ValidationResult,
} from "@repo-edu/backend-interface/types"
import { create } from "zustand"

type OperationType = "create" | "clone" | "delete"
type OperationStatus = "idle" | "running" | "success" | "error"

interface OperationState {
  selected: OperationType
  status: OperationStatus
  error: string | null
  // Operation result state (moved from uiStore)
  validationResult: ValidationResult | null
  preflightResult: RepoPreflightResult | null
}

interface OperationActions {
  setSelected: (operation: OperationType) => void
  setStatus: (status: OperationStatus) => void
  setError: (error: string | null) => void
  setValidationResult: (result: ValidationResult | null) => void
  setPreflightResult: (result: RepoPreflightResult | null) => void
  reset: () => void
}

interface OperationStore extends OperationState, OperationActions {}

const initialState: OperationState = {
  selected: "create",
  status: "idle",
  error: null,
  validationResult: null,
  preflightResult: null,
}

export const useOperationStore = create<OperationStore>((set) => ({
  ...initialState,

  setSelected: (operation) => set({ selected: operation }),

  setStatus: (status) => set({ status }),

  setError: (error) => set({ error }),

  setValidationResult: (result) => set({ validationResult: result }),

  setPreflightResult: (result) => set({ preflightResult: result }),

  reset: () => set(initialState),
}))

// Selector helpers
export const selectSelectedOperation = (state: OperationStore) => state.selected
export const selectOperationStatus = (state: OperationStore) => state.status
export const selectOperationError = (state: OperationStore) => state.error
export const selectValidationResult = (state: OperationStore) =>
  state.validationResult
export const selectPreflightResult = (state: OperationStore) =>
  state.preflightResult
