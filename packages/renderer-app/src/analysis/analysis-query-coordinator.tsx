import type { AnalysisDiscoverReposResult } from "@repo-edu/application-contract"
import type { AnalysisResult, BlameResult } from "@repo-edu/domain/analysis"
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useCallback, useMemo } from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { analysisSourceKeyFromSurface } from "../session/session-reducer.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../session/session-start.js"
import {
  selectEffectiveSelectedRepoPath,
  selectFileSelectionModeForScope,
  selectPendingRepoDiscoveryRequestForScope,
  selectSelectedAuthorsForScope,
  selectSelectedFilesForScope,
  selectSelectedRepoPathForScope,
  useAnalysisStore,
} from "../stores/analysis-store.js"
import { getErrorMessage } from "../utils/error-message.js"
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
  type AnalysisWorkflowStatus,
  type DiscoveryStatus,
} from "./analysis-contexts.js"
import {
  selectCurrentAnalysisResult,
  selectCurrentBlameResult,
} from "./analysis-observation.js"
import { discoverRepositories } from "./analysis-query-bodies.js"
import {
  type AnalysisQueryIdentity,
  analysisQueryKeys,
  analysisResultScopeKey,
  analysisSourceKeyParts,
  analysisSourceScopeKey,
  blameResultScopeKey,
  buildAnalysisQueryIdentity,
  buildBlameQueryIdentity,
} from "./analysis-query-keys.js"
import { useAnalysisSourceInput } from "./analysis-source-input.js"
import {
  EMPTY_PARTIAL_AUTHOR_LINES,
  useAnalysisTransientStore,
} from "./analysis-transient-store.js"
import {
  buildAuthorColorsByPersonId,
  buildAuthorDisplayByPersonId,
  buildRosterMatchByPersonId,
  filterAuthorStats,
  filterFileStats,
  mergeAuthorStats,
  mergeFileStats,
} from "./analysis-view-models.js"

function toAppErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}

export function AnalysisCoordinatorProvider({
  children,
}: {
  children: ReactNode
}) {
  const client = useWorkflowClient()
  const queryClient = useQueryClient()
  const {
    input: sourceInput,
    createSourceRunner,
    effectiveBlameConfig,
  } = useAnalysisSourceInput()
  const activeSurface = sourceInput.activeSurface
  const activeSourceParts = sourceInput.source
  const analysisConfig = sourceInput.config
  const activeSourceText = useMemo(
    () => analysisSourceScopeKey(activeSourceParts),
    [activeSourceParts],
  )

  const storedSelectedRepoPath = useAnalysisStore((state) =>
    selectSelectedRepoPathForScope(state, activeSourceText),
  )
  const setSelectedRepoPath = useAnalysisStore(
    (state) => state.setSelectedRepoPath,
  )
  const discoveryInput = useAnalysisStore((state) =>
    selectPendingRepoDiscoveryRequestForScope(state, activeSourceText),
  )
  const searchDepth = useAnalysisStore((state) => state.searchDepth)
  const showRenames = useAnalysisStore((state) => state.showRenames)

  const discoveryQueryKey =
    discoveryInput === null
      ? (["analysis", "discovery", "disabled"] as const)
      : analysisQueryKeys.discovery(
          activeSourceParts,
          discoveryInput.folder,
          discoveryInput.depth,
        )
  const discoveryQuery = useQuery<AnalysisDiscoverReposResult>({
    queryKey: discoveryQueryKey,
    enabled: false,
    queryFn: skipToken,
  })
  const discoveryCurrentFolder = useAnalysisTransientStore(
    (state) => state.discoveryProgress?.currentFolder ?? null,
  )
  const discoveredRepos = useMemo(
    () => discoveryQuery.data?.repos ?? [],
    [discoveryQuery.data],
  )
  const discoveredRepoPaths = useMemo(
    () => discoveredRepos.map((repo) => repo.path),
    [discoveredRepos],
  )
  const selectedRepoPath = useMemo(
    () =>
      selectEffectiveSelectedRepoPath({
        storedRepoPath: storedSelectedRepoPath,
        discoveredRepos,
      }),
    [discoveredRepos, storedSelectedRepoPath],
  )
  const discoveryStatus: DiscoveryStatus = discoveryQuery.isFetching
    ? "loading"
    : discoveryQuery.isError
      ? "error"
      : "idle"
  const discoveryError = discoveryQuery.isError
    ? toAppErrorMessage(discoveryQuery.error, "Discovery failed")
    : null
  const discoveryCompleted = discoveryQuery.isSuccess

  const selectedSnapshotQueryKey =
    selectedRepoPath === null || analysisConfig === null
      ? (["analysis", "snapshot-head", "disabled"] as const)
      : analysisQueryKeys.snapshotHead({
          source: activeSourceParts,
          repoPath: selectedRepoPath,
          until: analysisConfig.until ?? null,
        })
  const selectedSnapshotQuery = useQuery<string>({
    queryKey: selectedSnapshotQueryKey,
    enabled: false,
    queryFn: skipToken,
  })
  const selectedSnapshotCommitOid = selectedSnapshotQuery.isError
    ? null
    : (selectedSnapshotQuery.data ?? null)

  const selectedAnalysisIdentity = useMemo<AnalysisQueryIdentity | null>(() => {
    if (
      selectedRepoPath === null ||
      sourceInput.config === null ||
      selectedSnapshotCommitOid === null
    ) {
      return null
    }
    return buildAnalysisQueryIdentity({
      source: sourceInput.source,
      repoPath: selectedRepoPath,
      snapshotCommitOid: selectedSnapshotCommitOid,
      config: sourceInput.config,
      rosterContext: sourceInput.rosterContext,
    })
  }, [sourceInput, selectedRepoPath, selectedSnapshotCommitOid])

  const analysisScopeKey = useMemo(
    () =>
      selectedAnalysisIdentity === null
        ? null
        : analysisResultScopeKey(selectedAnalysisIdentity),
    [selectedAnalysisIdentity],
  )
  const selectedAuthors = useAnalysisStore((state) =>
    selectSelectedAuthorsForScope(state, analysisScopeKey),
  )
  const fileSelectionMode = useAnalysisStore((state) =>
    selectFileSelectionModeForScope(state, analysisScopeKey),
  )
  const selectedFiles = useAnalysisStore((state) =>
    selectSelectedFilesForScope(state, analysisScopeKey),
  )

  const selectedAnalysisQuery = useQuery<AnalysisResult>({
    queryKey:
      selectedAnalysisIdentity === null
        ? (["analysis", "result", "disabled"] as const)
        : analysisQueryKeys.result(selectedAnalysisIdentity),
    enabled: false,
    queryFn: skipToken,
  })

  const selectedAnalysisProgress = useAnalysisTransientStore((state) =>
    analysisScopeKey === null
      ? null
      : (state.analysisByRequestKey.get(analysisScopeKey)?.progress ?? null),
  )

  const result = selectCurrentAnalysisResult({
    snapshotCommitOid: selectedSnapshotCommitOid,
    analysisIsFetching: selectedAnalysisQuery.isFetching,
    analysisIsError: selectedAnalysisQuery.isError,
    data: selectedAnalysisQuery.data,
  })
  const analysisStatus: AnalysisWorkflowStatus =
    selectedSnapshotQuery.isFetching || selectedAnalysisQuery.isFetching
      ? "running"
      : selectedSnapshotQuery.isError || selectedAnalysisQuery.isError
        ? "error"
        : "idle"
  const analysisErrorMessage = selectedSnapshotQuery.isError
    ? toAppErrorMessage(selectedSnapshotQuery.error, "Snapshot failed")
    : selectedAnalysisQuery.isError
      ? toAppErrorMessage(selectedAnalysisQuery.error, "Analysis failed")
      : null

  const selectedBlameIdentity = useMemo(() => {
    if (
      selectedRepoPath === null ||
      selectedAnalysisIdentity === null ||
      effectiveBlameConfig === null ||
      result === null ||
      result.fileStats.length === 0
    ) {
      return null
    }
    return buildBlameQueryIdentity({
      source: activeSourceParts,
      repoPath: selectedRepoPath,
      analysis: selectedAnalysisIdentity,
      config: effectiveBlameConfig,
    })
  }, [
    activeSourceParts,
    effectiveBlameConfig,
    result,
    selectedAnalysisIdentity,
    selectedRepoPath,
  ])
  const selectedBlameScopeKey = useMemo(
    () =>
      selectedBlameIdentity === null
        ? null
        : blameResultScopeKey(selectedBlameIdentity),
    [selectedBlameIdentity],
  )
  const selectedBlameQuery = useQuery<BlameResult>({
    queryKey:
      selectedBlameIdentity === null
        ? (["analysis", "blame", "disabled"] as const)
        : analysisQueryKeys.blame(selectedBlameIdentity),
    enabled: false,
    queryFn: skipToken,
  })

  const selectedBlameTransient = useAnalysisTransientStore((state) =>
    selectedBlameScopeKey === null
      ? null
      : (state.blameByRequestKey.get(selectedBlameScopeKey) ?? null),
  )
  const blameResult = selectCurrentBlameResult({
    blameIsFetching: selectedBlameQuery.isFetching,
    blameIsError: selectedBlameQuery.isError,
    data: selectedBlameQuery.data,
  })
  const blameStatus: AnalysisWorkflowStatus = selectedBlameQuery.isFetching
    ? "running"
    : selectedBlameQuery.isError
      ? "error"
      : "idle"
  const blameErrorMessage = selectedBlameQuery.isError
    ? toAppErrorMessage(selectedBlameQuery.error, "Blame analysis failed")
    : null

  const mergedAuthorStats = useMemo(
    () =>
      mergeAuthorStats({
        result,
        blameResult,
        partialAuthorLines:
          selectedBlameTransient?.partialAuthorLines ??
          EMPTY_PARTIAL_AUTHOR_LINES,
      }),
    [blameResult, result, selectedBlameTransient?.partialAuthorLines],
  )
  const filteredAuthorStats = useMemo(
    () => filterAuthorStats(mergedAuthorStats, selectedAuthors),
    [mergedAuthorStats, selectedAuthors],
  )
  const mergedFileStats = useMemo(
    () => mergeFileStats({ result, blameResult }),
    [blameResult, result],
  )
  const filteredFileStats = useMemo(
    () =>
      filterFileStats({
        merged: mergedFileStats,
        fileSelectionMode,
        selectedFiles,
      }),
    [fileSelectionMode, mergedFileStats, selectedFiles],
  )
  const authorColorsByPersonId = useMemo(
    () => buildAuthorColorsByPersonId(mergedAuthorStats),
    [mergedAuthorStats],
  )
  const authorDisplayByPersonId = useMemo(
    () => buildAuthorDisplayByPersonId({ result, showRenames }),
    [result, showRenames],
  )
  const rosterMatchByPersonId = useMemo(
    () => buildRosterMatchByPersonId(result),
    [result],
  )

  // One control stops whatever the analysis source is running. Enablement and
  // click both read the reservation, so they cannot disagree.
  const cancelAnalysis = useCallback(() => {
    client.stop("analysis.run")
  }, [client])

  const runAnalysis = useMemo(
    () =>
      bindSessionStart("analysisRun", (start: SessionStart) => {
        if (selectedRepoPath === null) return
        client.change(() => {
          void createSourceRunner(activeSurface)
            ?.run(
              start,
              discoveredRepoPaths,
              selectedRepoPath,
              effectiveBlameConfig,
            )
            .catch(() => {})
        })
      }),
    [
      client,
      createSourceRunner,
      activeSurface,
      selectedRepoPath,
      discoveredRepoPaths,
      effectiveBlameConfig,
    ],
  )

  // Search only updates discovery; Start owns the chained analysis pass.
  const runRepoDiscovery = useMemo(
    () =>
      bindSessionStart(
        "analysisSearch",
        (start: SessionStart, folder: string) => {
          if (!folder) return
          client.change(() => {
            void client
              .execute(start, "analysis.discoverRepos", (scope) =>
                discoverRepositories(scope, queryClient, activeSurface, {
                  folder,
                  depth: searchDepth,
                }),
              )
              .catch(() => {})
          })
        },
      ),
    [client, queryClient, activeSurface, searchDepth],
  )

  const startAnalysis = useMemo(
    () =>
      bindSessionStart(
        "analysisStart",
        (start: SessionStart, folder: string) => {
          if (!folder) return
          client.change(() => {
            void client
              .execute(start, "analysis.discoverRepos", async (scope) => {
                const discovery = await discoverRepositories(
                  scope,
                  queryClient,
                  activeSurface,
                  {
                    folder,
                    depth: searchDepth,
                  },
                )
                scope.signal.throwIfAborted()
                scope.publish(() => {
                  const source = analysisSourceKeyParts(
                    analysisSourceKeyFromSurface(discovery.surface),
                  )
                  const selected = selectEffectiveSelectedRepoPath({
                    storedRepoPath: selectSelectedRepoPathForScope(
                      useAnalysisStore.getState(),
                      analysisSourceScopeKey(source),
                    ),
                    discoveredRepos: discovery.result.repos,
                  })
                  // Reserve before search retirement without awaiting the next queue turn.
                  // Search and analysis retain independent cancellation targets.
                  void createSourceRunner(discovery.surface)
                    ?.run(
                      start,
                      discovery.result.repos.map((repo) => repo.path),
                      selected,
                      effectiveBlameConfig,
                    )
                    .catch(() => {})
                })
              })
              .catch(() => {})
          })
        },
      ),
    [
      client,
      queryClient,
      activeSurface,
      searchDepth,
      createSourceRunner,
      effectiveBlameConfig,
    ],
  )

  const cancelDiscovery = useCallback(() => {
    client.stop("analysis.discoverRepos")
  }, [client])

  const selectRepository = useCallback(
    (repoPath: string) => {
      client.change(() => {
        setSelectedRepoPath(activeSourceText, repoPath)
      })
    },
    [client, activeSourceText, setSelectedRepoPath],
  )

  const analyseSelectedRepository = useMemo(
    () =>
      bindSessionStart("analysisSelected", (start: SessionStart) => {
        if (selectedRepoPath === null) return
        client.change(() => {
          void createSourceRunner(activeSurface)
            ?.run(
              start,
              [selectedRepoPath],
              selectedRepoPath,
              effectiveBlameConfig,
            )
            .catch(() => {})
        })
      }),
    [
      client,
      createSourceRunner,
      activeSurface,
      selectedRepoPath,
      effectiveBlameConfig,
    ],
  )

  const clearRepositoryDiscovery = useCallback(() => {
    setSelectedRepoPath(activeSourceText, null)
    useAnalysisStore
      .getState()
      .setPendingRepoDiscoveryRequest(activeSourceText, null)
  }, [activeSourceText, setSelectedRepoPath])

  const discoveryValue = useMemo<AnalysisDiscoveryValue>(
    () => ({
      discoveredRepos,
      discoveryStatus,
      discoveryError,
      discoveryCurrentFolder,
      discoveryCompleted,
      runRepoDiscovery,
      startAnalysis,
      clearRepositoryDiscovery,
      cancelDiscovery,
    }),
    [
      cancelDiscovery,
      discoveredRepos,
      discoveryCurrentFolder,
      discoveryError,
      discoveryStatus,
      discoveryCompleted,
      runRepoDiscovery,
      startAnalysis,
      clearRepositoryDiscovery,
    ],
  )

  const selectionValue = useMemo<AnalysisSelectionValue>(
    () => ({
      selectedRepoPath,
      selectRepository,
      analyseSelectedRepository,
      runAnalysis,
      cancelAnalysis,
      snapshotCommitOid: selectedSnapshotCommitOid,
      analysisIdentity: selectedAnalysisIdentity,
      analysisScopeKey,
    }),
    [
      analysisScopeKey,
      analyseSelectedRepository,
      cancelAnalysis,
      runAnalysis,
      selectedAnalysisIdentity,
      selectedRepoPath,
      selectedSnapshotCommitOid,
      selectRepository,
    ],
  )

  const resultValue = useMemo<AnalysisResultValue>(
    () => ({
      result,
      analysisStatus,
      analysisProgress: selectedAnalysisProgress,
      analysisErrorMessage,
    }),
    [analysisErrorMessage, analysisStatus, result, selectedAnalysisProgress],
  )

  const blameResultValue = useMemo<AnalysisBlameResultValue>(
    () => ({
      blameResult,
    }),
    [blameResult],
  )

  const blameStatusValue = useMemo<AnalysisBlameStatusValue>(
    () => ({
      blameStatus,
      blameErrorMessage,
    }),
    [blameErrorMessage, blameStatus],
  )

  const blameProgressValue = useMemo<AnalysisBlameProgressValue>(
    () => ({
      blameStatus,
      blameProgress: selectedBlameTransient?.progress ?? null,
      blamePartialAuthorLines:
        selectedBlameTransient?.partialAuthorLines ??
        EMPTY_PARTIAL_AUTHOR_LINES,
    }),
    [
      blameStatus,
      selectedBlameTransient?.partialAuthorLines,
      selectedBlameTransient?.progress,
    ],
  )

  const authorViewValue = useMemo<AnalysisAuthorViewValue>(
    () => ({
      mergedAuthorStats,
      filteredAuthorStats,
      authorColorsByPersonId,
      authorDisplayByPersonId,
      rosterMatchByPersonId,
    }),
    [
      authorColorsByPersonId,
      authorDisplayByPersonId,
      filteredAuthorStats,
      mergedAuthorStats,
      rosterMatchByPersonId,
    ],
  )

  const fileViewValue = useMemo<AnalysisFileViewValue>(
    () => ({
      mergedFileStats,
      filteredFileStats,
    }),
    [filteredFileStats, mergedFileStats],
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
