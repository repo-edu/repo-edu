import type {
  AnalysisProgress,
  DiscoveredRepo,
} from "@repo-edu/application-contract"
import type {
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"
import { type Context, createContext, useContext } from "react"
import type { AnalysisQueryIdentity } from "./analysis-query-keys.js"
import type {
  buildAuthorDisplayByPersonId,
  buildRosterMatchByPersonId,
} from "./analysis-view-models.js"

export type AnalysisWorkflowStatus = "idle" | "running" | "error"
export type DiscoveryStatus = "idle" | "loading" | "error"

export type AnalysisDiscoveryValue = {
  discoveredRepos: readonly DiscoveredRepo[]
  discoveryStatus: DiscoveryStatus
  discoveryError: string | null
  discoveryCurrentFolder: string | null
  discoveryCompleted: boolean
  runRepoDiscovery: (folder: string) => void
  startAnalysis: (folder: string) => void
  clearRepositoryDiscovery: () => void
  cancelDiscovery: () => void
}

export type AnalysisSelectionValue = {
  selectedRepoPath: string | null
  selectRepository: (repoPath: string) => void
  analyseSelectedRepository: () => void
  runAnalysis: () => void
  cancelAnalysis: () => void
  snapshotCommitOid: string | null
  analysisIdentity: AnalysisQueryIdentity | null
  analysisScopeKey: string | null
}

export type AnalysisResultValue = {
  result: AnalysisResult | null
  analysisStatus: AnalysisWorkflowStatus
  analysisProgress: AnalysisProgress | null
  analysisErrorMessage: string | null
}

export type AnalysisBlameResultValue = {
  blameResult: BlameResult | null
}

export type AnalysisBlameStatusValue = {
  blameStatus: AnalysisWorkflowStatus
  blameErrorMessage: string | null
}

export type AnalysisBlameProgressValue = {
  blameStatus: AnalysisWorkflowStatus
  blameProgress: AnalysisProgress | null
  blamePartialAuthorLines: ReadonlyMap<string, number>
}

export type AnalysisAuthorViewValue = {
  mergedAuthorStats: AuthorStats[]
  filteredAuthorStats: AuthorStats[]
  authorColorsByPersonId: ReadonlyMap<string, string>
  authorDisplayByPersonId: ReturnType<typeof buildAuthorDisplayByPersonId>
  rosterMatchByPersonId: ReturnType<typeof buildRosterMatchByPersonId>
}

export type AnalysisFileViewValue = {
  mergedFileStats: FileStats[]
  filteredFileStats: FileStats[]
}

export const AnalysisDiscoveryContext =
  createContext<AnalysisDiscoveryValue | null>(null)
export const AnalysisSelectionContext =
  createContext<AnalysisSelectionValue | null>(null)
export const AnalysisResultContext = createContext<AnalysisResultValue | null>(
  null,
)
export const AnalysisBlameResultContext =
  createContext<AnalysisBlameResultValue | null>(null)
export const AnalysisBlameStatusContext =
  createContext<AnalysisBlameStatusValue | null>(null)
export const AnalysisBlameProgressContext =
  createContext<AnalysisBlameProgressValue | null>(null)
export const AnalysisAuthorViewContext =
  createContext<AnalysisAuthorViewValue | null>(null)
export const AnalysisFileViewContext =
  createContext<AnalysisFileViewValue | null>(null)

function useRequiredAnalysisContext<T>(
  context: Context<T | null>,
  name: string,
): T {
  const value = useContext(context)
  if (value === null) {
    throw new Error(`${name} must be used inside AnalysisCoordinatorProvider.`)
  }
  return value
}

export function useAnalysisDiscovery(): AnalysisDiscoveryValue {
  return useRequiredAnalysisContext(
    AnalysisDiscoveryContext,
    "useAnalysisDiscovery",
  )
}

export function useAnalysisSelection(): AnalysisSelectionValue {
  return useRequiredAnalysisContext(
    AnalysisSelectionContext,
    "useAnalysisSelection",
  )
}

export function useAnalysisResult(): AnalysisResultValue {
  return useRequiredAnalysisContext(AnalysisResultContext, "useAnalysisResult")
}

export function useAnalysisBlameResult(): AnalysisBlameResultValue {
  return useRequiredAnalysisContext(
    AnalysisBlameResultContext,
    "useAnalysisBlameResult",
  )
}

export function useAnalysisBlameStatus(): AnalysisBlameStatusValue {
  return useRequiredAnalysisContext(
    AnalysisBlameStatusContext,
    "useAnalysisBlameStatus",
  )
}

export function useAnalysisBlameProgress(): AnalysisBlameProgressValue {
  return useRequiredAnalysisContext(
    AnalysisBlameProgressContext,
    "useAnalysisBlameProgress",
  )
}

export function useAnalysisAuthorView(): AnalysisAuthorViewValue {
  return useRequiredAnalysisContext(
    AnalysisAuthorViewContext,
    "useAnalysisAuthorView",
  )
}

export function useAnalysisFileView(): AnalysisFileViewValue {
  return useRequiredAnalysisContext(
    AnalysisFileViewContext,
    "useAnalysisFileView",
  )
}
