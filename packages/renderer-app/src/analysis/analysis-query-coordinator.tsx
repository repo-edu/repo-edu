import { type ReactNode, useMemo } from "react"
import { useAnalysisCommands } from "./analysis-commands.js"
import {
  AnalysisAuthorViewContext,
  type AnalysisAuthorViewValue,
  AnalysisBlameProgressContext,
  type AnalysisBlameProgressValue,
  AnalysisBlameResultContext,
  type AnalysisBlameResultValue,
  AnalysisBlameStatusContext,
  type AnalysisBlameStatusValue,
  AnalysisDiscoveryContext,
  type AnalysisDiscoveryValue,
  AnalysisFileViewContext,
  type AnalysisFileViewValue,
  AnalysisResultContext,
  type AnalysisResultValue,
  AnalysisSelectionContext,
  type AnalysisSelectionValue,
} from "./analysis-contexts.js"
import { useAnalysisObservation } from "./analysis-observation.js"
import { useAnalysisSourceInput } from "./analysis-source-input.js"
import { useAnalysisViews } from "./analysis-views.js"

export function AnalysisCoordinatorProvider({
  children,
}: {
  children: ReactNode
}) {
  const source = useAnalysisSourceInput()
  const observation = useAnalysisObservation(source)
  const commands = useAnalysisCommands({ ...source, observation })
  const views = useAnalysisViews(observation)

  const discoveryValue = useMemo<AnalysisDiscoveryValue>(
    () => ({
      discoveredRepos: observation.discoveredRepos,
      discoveryStatus: observation.discoveryStatus,
      discoveryError: observation.discoveryError,
      discoveryCurrentFolder: observation.discoveryCurrentFolder,
      discoveryCompleted: observation.discoveryCompleted,
      runRepoDiscovery: commands.runRepoDiscovery,
      startAnalysis: commands.startAnalysis,
      clearRepositoryDiscovery: commands.clearRepositoryDiscovery,
      cancelDiscovery: commands.cancelDiscovery,
    }),
    [
      commands.cancelDiscovery,
      commands.clearRepositoryDiscovery,
      commands.runRepoDiscovery,
      commands.startAnalysis,
      observation.discoveredRepos,
      observation.discoveryCompleted,
      observation.discoveryCurrentFolder,
      observation.discoveryError,
      observation.discoveryStatus,
    ],
  )

  const selectionValue = useMemo<AnalysisSelectionValue>(
    () => ({
      selectedRepoPath: observation.selectedRepoPath,
      selectRepository: commands.selectRepository,
      analyseSelectedRepository: commands.analyseSelectedRepository,
      runAnalysis: commands.runAnalysis,
      cancelAnalysis: commands.cancelAnalysis,
      snapshotCommitOid: observation.selectedSnapshotCommitOid,
      analysisIdentity: observation.selectedAnalysisIdentity,
      analysisScopeKey: observation.analysisScopeKey,
    }),
    [
      commands.analyseSelectedRepository,
      commands.cancelAnalysis,
      commands.runAnalysis,
      commands.selectRepository,
      observation.analysisScopeKey,
      observation.selectedAnalysisIdentity,
      observation.selectedRepoPath,
      observation.selectedSnapshotCommitOid,
    ],
  )

  const resultValue = useMemo<AnalysisResultValue>(
    () => ({
      result: observation.result,
      analysisStatus: observation.analysisStatus,
      analysisProgress: observation.selectedAnalysisProgress,
      analysisErrorMessage: observation.analysisErrorMessage,
    }),
    [
      observation.analysisErrorMessage,
      observation.analysisStatus,
      observation.result,
      observation.selectedAnalysisProgress,
    ],
  )

  const blameResultValue = useMemo<AnalysisBlameResultValue>(
    () => ({
      blameResult: observation.blameResult,
    }),
    [observation.blameResult],
  )

  const blameStatusValue = useMemo<AnalysisBlameStatusValue>(
    () => ({
      blameStatus: observation.blameStatus,
      blameErrorMessage: observation.blameErrorMessage,
    }),
    [observation.blameErrorMessage, observation.blameStatus],
  )

  const blameProgressValue = useMemo<AnalysisBlameProgressValue>(
    () => ({
      blameStatus: observation.blameStatus,
      blameProgress: observation.blameProgress,
      blamePartialAuthorLines: observation.blamePartialAuthorLines,
    }),
    [
      observation.blamePartialAuthorLines,
      observation.blameProgress,
      observation.blameStatus,
    ],
  )

  const authorViewValue = useMemo<AnalysisAuthorViewValue>(
    () => ({
      mergedAuthorStats: views.mergedAuthorStats,
      filteredAuthorStats: views.filteredAuthorStats,
      authorColorsByPersonId: views.authorColorsByPersonId,
      authorDisplayByPersonId: views.authorDisplayByPersonId,
      rosterMatchByPersonId: views.rosterMatchByPersonId,
    }),
    [
      views.authorColorsByPersonId,
      views.authorDisplayByPersonId,
      views.filteredAuthorStats,
      views.mergedAuthorStats,
      views.rosterMatchByPersonId,
    ],
  )

  const fileViewValue = useMemo<AnalysisFileViewValue>(
    () => ({
      mergedFileStats: views.mergedFileStats,
      filteredFileStats: views.filteredFileStats,
    }),
    [views.filteredFileStats, views.mergedFileStats],
  )

  return (
    <AnalysisDiscoveryContext.Provider value={discoveryValue}>
      <AnalysisSelectionContext.Provider value={selectionValue}>
        <AnalysisResultContext.Provider value={resultValue}>
          <AnalysisBlameResultContext.Provider value={blameResultValue}>
            <AnalysisBlameStatusContext.Provider value={blameStatusValue}>
              <AnalysisBlameProgressContext.Provider value={blameProgressValue}>
                <AnalysisAuthorViewContext.Provider value={authorViewValue}>
                  <AnalysisFileViewContext.Provider value={fileViewValue}>
                    {children}
                  </AnalysisFileViewContext.Provider>
                </AnalysisAuthorViewContext.Provider>
              </AnalysisBlameProgressContext.Provider>
            </AnalysisBlameStatusContext.Provider>
          </AnalysisBlameResultContext.Provider>
        </AnalysisResultContext.Provider>
      </AnalysisSelectionContext.Provider>
    </AnalysisDiscoveryContext.Provider>
  )
}
