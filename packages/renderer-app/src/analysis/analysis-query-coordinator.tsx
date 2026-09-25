import type {
  AnalysisDiscoverReposResult,
  AnalysisProgress,
  DiscoveredRepo,
} from "@repo-edu/application-contract"
import type { PersistedActiveSurface } from "@repo-edu/domain/active-surface"
import type {
  AnalysisBlameConfig,
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type Context,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { useAnalysisContext } from "../hooks/use-analysis-context.js"
import {
  selectActiveSurface,
  selectAnalysisConcurrency,
  selectDefaultExtensions,
} from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"
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
import { discoverRepositories } from "./analysis-query-bodies.js"
import { clearAnalysisQueries } from "./analysis-query-client.js"
import {
  type AnalysisQueryIdentity,
  analysisQueryKeys,
  analysisResultScopeKey,
  analysisSourceKeyParts,
  analysisSourceScopeKey,
  blameResultScopeKey,
  buildAnalysisOutputConfigKey,
  buildAnalysisQueryIdentity,
  buildBlameQueryIdentity,
  buildRosterOutputContextKey,
} from "./analysis-query-keys.js"
import { AnalysisSourceRunner } from "./analysis-source-runner.js"
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
import { buildEffectiveBlameWorkflowConfig } from "./analysis-workflow-inputs.js"

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

const AnalysisDiscoveryContext = createContext<AnalysisDiscoveryValue | null>(
  null,
)
const AnalysisSelectionContext = createContext<AnalysisSelectionValue | null>(
  null,
)
const AnalysisResultContext = createContext<AnalysisResultValue | null>(null)
const AnalysisBlameResultContext =
  createContext<AnalysisBlameResultValue | null>(null)
const AnalysisBlameStatusContext =
  createContext<AnalysisBlameStatusValue | null>(null)
const AnalysisBlameProgressContext =
  createContext<AnalysisBlameProgressValue | null>(null)
const AnalysisAuthorViewContext = createContext<AnalysisAuthorViewValue | null>(
  null,
)
const AnalysisFileViewContext = createContext<AnalysisFileViewValue | null>(
  null,
)

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

function toAppErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}

export function selectCurrentAnalysisResult(params: {
  snapshotCommitOid: string | null
  analysisIsFetching: boolean
  analysisIsError: boolean
  data: AnalysisResult | undefined
}): AnalysisResult | null {
  if (
    params.snapshotCommitOid === null ||
    params.analysisIsFetching ||
    params.analysisIsError
  ) {
    return null
  }
  return params.data ?? null
}

export function selectCurrentBlameResult(params: {
  blameIsFetching: boolean
  blameIsError: boolean
  data: BlameResult | undefined
}): BlameResult | null {
  if (params.blameIsFetching || params.blameIsError) return null
  return params.data ?? null
}

export function AnalysisCoordinatorProvider({
  children,
}: {
  children: ReactNode
}) {
  const client = useWorkflowClient()
  const queryClient = useQueryClient()
  const analysisContext = useAnalysisContext()
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const activeSourceParts = useMemo(
    () => analysisSourceKeyParts(analysisSourceKeyFromSurface(activeSurface)),
    [activeSurface],
  )
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
  const blameConfig = useAnalysisStore((state) => state.blameConfig)
  const showRenames = useAnalysisStore((state) => state.showRenames)

  const defaultExtensions = useSessionControllerSelector(
    selectDefaultExtensions,
  )
  const analysisConcurrency = useSessionControllerSelector(
    selectAnalysisConcurrency,
  )

  const analysisConfig = useMemo(() => {
    if (analysisContext.kind === "none") return null
    return resolveAnalysisConfig(
      {
        searchFolder: analysisContext.searchFolder,
        analysisInputs: analysisContext.analysisInputs,
      },
      defaultExtensions,
      analysisConcurrency.filesPerRepo,
    )
  }, [analysisConcurrency.filesPerRepo, analysisContext, defaultExtensions])

  const sourceRunnerInput = JSON.stringify({
    source: activeSourceParts,
    config:
      analysisConfig === null
        ? null
        : buildAnalysisOutputConfigKey(analysisConfig),
    roster: buildRosterOutputContextKey(analysisContext.rosterContext),
    kind: analysisContext.kind === "course" ? "course" : "folder",
    concurrency: analysisConcurrency,
  })
  // The result key fields define input equality; the host still takes full inputs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The content key replaces the identities of the course-derived objects.
  const createSourceRunner = useCallback(
    (surface: PersistedActiveSurface) =>
      analysisConfig === null
        ? null
        : new AnalysisSourceRunner(client, queryClient, {
            source: analysisSourceKeyParts(
              analysisSourceKeyFromSurface(surface),
            ),
            config: analysisConfig,
            rosterContext: analysisContext.rosterContext,
            kind: analysisContext.kind === "course" ? "course" : "folder",
            repoParallelism: analysisConcurrency.repoParallelism,
          }),
    [client, queryClient, sourceRunnerInput],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: The runner already keys source inputs, extensions and concurrency by content.
  const effectiveBlameConfig = useMemo<AnalysisBlameConfig | null>(() => {
    if (
      analysisContext.kind === "none" ||
      analysisContext.analysisInputs.blameSkip
    )
      return null
    return buildEffectiveBlameWorkflowConfig(
      {
        searchFolder: analysisContext.searchFolder,
        analysisInputs: analysisContext.analysisInputs,
      },
      blameConfig,
      defaultExtensions,
      analysisConcurrency.repoParallelism * analysisConcurrency.filesPerRepo,
    )
  }, [
    createSourceRunner,
    blameConfig,
    analysisContext.analysisInputs.blameSkip,
  ])

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
  const selectedSnapshotCommitOid =
    selectedSnapshotQuery.isFetching || selectedSnapshotQuery.isError
      ? null
      : (selectedSnapshotQuery.data ?? null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: The runner already keys the source, analysis config and roster by content.
  const selectedAnalysisIdentity = useMemo<AnalysisQueryIdentity | null>(() => {
    if (
      selectedRepoPath === null ||
      analysisConfig === null ||
      selectedSnapshotCommitOid === null
    ) {
      return null
    }
    return buildAnalysisQueryIdentity({
      source: activeSourceParts,
      repoPath: selectedRepoPath,
      snapshotCommitOid: selectedSnapshotCommitOid,
      config: analysisConfig,
      rosterContext: analysisContext.rosterContext,
    })
  }, [createSourceRunner, selectedRepoPath, selectedSnapshotCommitOid])

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
          clearAnalysisQueries(queryClient, {
            queryKey: analysisQueryKeys.repo(
              activeSourceParts,
              selectedRepoPath,
            ),
          })
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
      activeSourceParts,
      queryClient,
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
