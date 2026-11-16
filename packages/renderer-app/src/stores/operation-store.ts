import type {
  RepositoryCloneResult,
  RepositoryCreateResult,
  RepositoryUpdateResult,
} from "@repo-edu/application-contract"
import type { RepoOperationMode } from "@repo-edu/domain/types"
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
  reset: () => void
}

const initialState: OperationState = {
  selected: "create",
  status: "idle",
  error: null,
  lastResult: null,
}

export const useOperationStore = create<OperationState & OperationActions>(
  (set) => ({
    ...initialState,

    setSelected: (operation) => set({ selected: operation }),
    setStatus: (status) => set({ status }),
    setError: (error) => set({ error }),
    setLastResult: (result) => set({ lastResult: result }),
    reset: () => set(initialState),
  }),
)

export const selectSelectedOperation = (state: OperationState) => state.selected
export const selectOperationStatus = (state: OperationState) => state.status
export const selectOperationError = (state: OperationState) => state.error
