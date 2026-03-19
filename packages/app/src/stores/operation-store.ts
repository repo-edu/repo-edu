import type {
  RepositoryCloneResult,
  RepositoryCreateResult,
  RepositoryUpdateResult,
} from "@repo-edu/application-contract"
import type {
  RepoOperationMode,
  RepoPreflightResult,
  RosterValidationResult,
} from "@repo-edu/domain/types"
import { create } from "zustand"

type OperationStatus = "idle" | "running" | "success" | "error"

type OperationState = {
  selected: RepoOperationMode
  status: OperationStatus
  error: string | null
  lastResult:
    | RepositoryCreateResult
    | RepositoryCloneResult
    | RepositoryUpdateResult
    | null
  validationResult: RosterValidationResult | null
  preflightResult: RepoPreflightResult | null
}

type OperationActions = {
  setSelected: (operation: RepoOperationMode) => void
  setStatus: (status: OperationStatus) => void
  setError: (error: string | null) => void
  setLastResult: (
    result:
      | RepositoryCreateResult
      | RepositoryCloneResult
      | RepositoryUpdateResult
      | null,
  ) => void
  setValidationResult: (result: RosterValidationResult | null) => void
  setPreflightResult: (result: RepoPreflightResult | null) => void
  reset: () => void
}

const initialState: OperationState = {
  selected: "create",
  status: "idle",
  error: null,
  lastResult: null,
  validationResult: null,
  preflightResult: null,
}

export const useOperationStore = create<OperationState & OperationActions>(
  (set) => ({
    ...initialState,

    setSelected: (operation) => set({ selected: operation }),
    setStatus: (status) => set({ status }),
    setError: (error) => set({ error }),
    setLastResult: (result) => set({ lastResult: result }),
    setValidationResult: (result) => set({ validationResult: result }),
    setPreflightResult: (result) => set({ preflightResult: result }),
    reset: () => set(initialState),
  }),
)

export const selectSelectedOperation = (state: OperationState) => state.selected
export const selectOperationStatus = (state: OperationState) => state.status
export const selectOperationError = (state: OperationState) => state.error
export const selectValidationResult = (state: OperationState) =>
  state.validationResult
export const selectPreflightResult = (state: OperationState) =>
  state.preflightResult
