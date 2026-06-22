import type {
  AnalysisDiscoverReposResult,
  AnalysisProgress,
  DiscoveredRepo,
} from "@repo-edu/application-contract"
import type {
  AnalysisBlameConfig,
  AnalysisConfig,
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { nanoid } from "nanoid"
import {
  type Context,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { useAnalysisContext } from "../hooks/use-analysis-context.js"
import { selectActiveAnalysisSourceKey } from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"
import {
  type AnalysisDiscoveryCommandOutcome,
  type AnalysisDiscoveryOutcome,
  type AnalysisDiscoveryRequest,
  selectEffectiveSelectedRepoPath,
  selectFileSelectionModeForScope,
  selectLastDiscoveryOutcomeForScope,
  selectPendingRepoDiscoveryRequestForScope,
  selectSelectedAuthorsForScope,
  selectSelectedFilesForScope,
  selectSelectedRepoPathForScope,
  useAnalysisStore,
} from "../stores/analysis-store.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { refreshSourceSnapshotHeadQueries } from "./analysis-query-client.js"
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
  lastDiscoveryOutcome: AnalysisDiscoveryOutcome
  runRepoDiscovery: (folder: string) => void
  cancelDiscovery: () => void
}

export type AnalysisSelectionValue = {
  selectedRepoPath: string | null
  selectRepository: (repoPath: string | null) => void
  runAnalysis: (repoPath: string) => void
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

export type AnalysisBlameValue = AnalysisBlameResultValue &
  AnalysisBlameStatusValue &
  AnalysisBlameProgressValue

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

export type AnalysisCoordinatorValue = AnalysisDiscoveryValue &
  AnalysisSelectionValue &
  AnalysisResultValue &
  AnalysisBlameValue &
  AnalysisAuthorViewValue &
  AnalysisFileViewValue

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

export function useAnalysisBlame(): AnalysisBlameValue {
  return {
    ...useAnalysisBlameResult(),
    ...useAnalysisBlameStatus(),
    ...useAnalysisBlameProgress(),
  }
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

export function useAnalysisCoordinator(): AnalysisCoordinatorValue {
  return {
    ...useAnalysisDiscovery(),
    ...useAnalysisSelection(),
    ...useAnalysisResult(),
    ...useAnalysisBlame(),
    ...useAnalysisAuthorView(),
    ...useAnalysisFileView(),
  }
}

async function mapBounded<T>(
  items: readonly T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      await fn(items[index])
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(maxConcurrency, items.length)) },
    () => worker(),
  )
  await Promise.all(workers)
}

export type CohortPrefetchRun = {
  readonly queryKeys: Set<readonly unknown[]>
}

export function createCohortPrefetchRun(): CohortPrefetchRun {
  return { queryKeys: new Set() }
}

export function abortCohortPrefetchRun(
  queryClient: QueryClient,
  run: CohortPrefetchRun,
): void {
  for (const queryKey of run.queryKeys) {
    const query = queryClient.getQueryCache().find({ queryKey, exact: true })
    if (query === undefined || query.getObserversCount() > 0) continue
    void queryClient.cancelQueries({ queryKey, exact: true })
  }
}

function registerCohortPrefetchQuery(
  run: CohortPrefetchRun,
  queryKey: readonly unknown[],
): void {
  run.queryKeys.add(queryKey)
}

function toAppErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}

export function selectEffectiveDiscoveryOutcome(params: {
  commandOutcome: AnalysisDiscoveryCommandOutcome
  discoveryIsSuccess: boolean
}): AnalysisDiscoveryOutcome {
  if (params.commandOutcome === "cancelled") return "cancelled"
  return params.discoveryIsSuccess ? "completed" : "none"
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
  const activeSourceKey = useSessionControllerSelector(
    selectActiveAnalysisSourceKey,
  )
  const activeSourceParts = useMemo(
    () => analysisSourceKeyParts(activeSourceKey),
    [activeSourceKey],
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
  const commandDiscoveryOutcome = useAnalysisStore((state) =>
    selectLastDiscoveryOutcomeForScope(state, activeSourceText),
  )
  const setPendingRepoDiscoveryRequest = useAnalysisStore(
    (state) => state.setPendingRepoDiscoveryRequest,
  )
  const setLastDiscoveryOutcome = useAnalysisStore(
    (state) => state.setLastDiscoveryOutcome,
  )
  const markAutoDiscoveryRequest = useAnalysisStore(
    (state) => state.markAutoDiscoveryRequest,
  )
  const searchDepth = useAnalysisStore((state) => state.searchDepth)
  const blameConfig = useAnalysisStore((state) => state.blameConfig)
  const showRenames = useAnalysisStore((state) => state.showRenames)

  const defaultExtensions = useAppSettingsStore(
    (state) => state.settings.defaultExtensions,
  )
  const analysisConcurrency = useAppSettingsStore(
    (state) => state.settings.analysisConcurrency,
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

  const effectiveBlameConfig = useMemo<AnalysisBlameConfig | null>(() => {
    if (analysisContext.kind === "none") return null
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
    analysisConcurrency.filesPerRepo,
    analysisConcurrency.repoParallelism,
    analysisContext,
    blameConfig,
    defaultExtensions,
  ])

  const cohortPrefetchRunRef = useRef<CohortPrefetchRun | null>(null)
  const abortCohortPrefetch = useCallback(() => {
    const run = cohortPrefetchRunRef.current
    if (run === null) return
    cohortPrefetchRunRef.current = null
    abortCohortPrefetchRun(queryClient, run)
  }, [queryClient])

  useEffect(() => {
    const sourceParts = activeSourceParts
    return () => {
      abortCohortPrefetch()
      void queryClient.cancelQueries({
        queryKey: analysisQueryKeys.source(sourceParts),
      })
    }
  }, [abortCohortPrefetch, activeSourceParts, queryClient])

  const discoveryQueryKey =
    discoveryInput === null
      ? (["analysis", "discovery", "disabled"] as const)
      : analysisQueryKeys.discovery(
          activeSourceParts,
          discoveryInput.folder,
          discoveryInput.depth,
        )
  const discoveryQuery = useQuery({
    queryKey: discoveryQueryKey,
    enabled: discoveryInput !== null,
    queryFn: async ({ signal }): Promise<AnalysisDiscoverReposResult> => {
      if (discoveryInput === null) {
        throw new Error("Discovery query ran without input.")
      }
      const requestId = nanoid()
      const transient = useAnalysisTransientStore.getState()
      transient.startDiscovery(requestId)
      try {
        return await client.run(
          "analysis.discoverRepos",
          {
            searchFolder: discoveryInput.folder,
            maxDepth: discoveryInput.depth,
          },
          {
            signal,
            onProgress: (progress) => {
              useAnalysisTransientStore
                .getState()
                .setDiscoveryProgress(requestId, progress)
            },
          },
        )
      } finally {
        useAnalysisTransientStore.getState().finishDiscovery(requestId)
      }
    },
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
  const lastDiscoveryOutcome = selectEffectiveDiscoveryOutcome({
    commandOutcome: commandDiscoveryOutcome,
    discoveryIsSuccess: discoveryQuery.isSuccess,
  })

  const prefetchRepoAnalysis = useCallback(
    async (
      repoPath: string,
      run: CohortPrefetchRun,
      isCurrentBatch: () => boolean,
      config: AnalysisConfig,
    ): Promise<void> => {
      if (analysisContext.kind === "none" || !isCurrentBatch()) return
      const snapshotKey = analysisQueryKeys.snapshotHead({
        source: activeSourceParts,
        repoPath,
        until: config.until ?? null,
      })
      registerCohortPrefetchQuery(run, snapshotKey)
      const snapshotCommitOid = await queryClient.ensureQueryData({
        queryKey: snapshotKey,
        queryFn: ({ signal }) =>
          client.run(
            "analysis.resolveSnapshotHead",
            {
              repositoryAbsolutePath: repoPath,
              until: config.until,
            },
            { signal },
          ),
      })
      if (!isCurrentBatch()) return
      const identity = buildAnalysisQueryIdentity({
        source: activeSourceParts,
        repoPath,
        snapshotCommitOid,
        config,
        rosterContext: analysisContext.rosterContext,
      })
      const prefetchAnalysisScopeKey = analysisResultScopeKey(identity)
      const prefetchAnalysisQueryKey = analysisQueryKeys.result(identity)
      registerCohortPrefetchQuery(run, prefetchAnalysisQueryKey)
      await queryClient.ensureQueryData({
        queryKey: prefetchAnalysisQueryKey,
        queryFn: async ({ signal }) => {
          const requestId = nanoid()
          const transient = useAnalysisTransientStore.getState()
          transient.startAnalysis(prefetchAnalysisScopeKey, requestId)
          try {
            return await client.run(
              "analysis.run",
              {
                repositoryAbsolutePath: repoPath,
                config,
                snapshotCommitOid,
                analysisSource:
                  analysisContext.kind === "course"
                    ? {
                        kind: "course",
                        ...(analysisContext.rosterContext
                          ? { rosterContext: analysisContext.rosterContext }
                          : {}),
                      }
                    : { kind: "folder" },
              },
              {
                signal,
                onProgress: (progress) => {
                  useAnalysisTransientStore
                    .getState()
                    .setAnalysisProgress(
                      prefetchAnalysisScopeKey,
                      requestId,
                      progress,
                    )
                },
              },
            )
          } finally {
            useAnalysisTransientStore
              .getState()
              .finishAnalysis(prefetchAnalysisScopeKey, requestId)
          }
        },
      })
    },
    [
      activeSourceParts,
      analysisContext.kind,
      analysisContext.rosterContext,
      client,
      queryClient,
    ],
  )

  useEffect(() => {
    if (
      !discoveryInput ||
      !discoveryQuery.isSuccess ||
      discoveryQuery.dataUpdatedAt === 0
    ) {
      return
    }
    const firstRepoPath = discoveredRepos[0]?.path ?? null
    if (firstRepoPath !== null) {
      const normalizedFolder = discoveryInput.folder.replaceAll("\\", "/")
      const normalizedRepo = firstRepoPath.replaceAll("\\", "/")
      if (
        discoveredRepos.length === 1 &&
        normalizedFolder.startsWith(`${normalizedRepo}/`)
      ) {
        if (analysisContext.searchFolder === firstRepoPath) return
        if (analysisContext.kind === "folder") {
          void analysisContext.activateFolderPath(firstRepoPath)
        } else {
          analysisContext.updateCourseSearchFolder(firstRepoPath)
        }
      }
    }
  }, [
    analysisContext,
    discoveredRepos,
    discoveryInput,
    discoveryQuery.dataUpdatedAt,
    discoveryQuery.isSuccess,
  ])

  useEffect(() => {
    if (
      !discoveryQuery.data ||
      discoveryQuery.dataUpdatedAt === 0 ||
      analysisConfig === null ||
      discoveredRepoPaths.length === 0
    ) {
      return
    }
    const run = createCohortPrefetchRun()
    cohortPrefetchRunRef.current = run
    const isCurrentRun = () => cohortPrefetchRunRef.current === run
    void mapBounded(
      discoveredRepoPaths,
      analysisConcurrency.repoParallelism,
      async (repoPath) => {
        if (!isCurrentRun()) return
        await prefetchRepoAnalysis(
          repoPath,
          run,
          isCurrentRun,
          analysisConfig,
        ).catch(() => {})
      },
    )
      .catch(() => {})
      .finally(() => {
        if (cohortPrefetchRunRef.current === run) {
          cohortPrefetchRunRef.current = null
        }
      })
    return () => {
      if (cohortPrefetchRunRef.current === run) {
        abortCohortPrefetch()
      }
    }
  }, [
    abortCohortPrefetch,
    analysisConcurrency.repoParallelism,
    analysisConfig,
    discoveredRepoPaths,
    discoveryQuery.data,
    discoveryQuery.dataUpdatedAt,
    prefetchRepoAnalysis,
  ])

  const selectedSnapshotQueryKey =
    selectedRepoPath === null || analysisConfig === null
      ? (["analysis", "snapshot-head", "disabled"] as const)
      : analysisQueryKeys.snapshotHead({
          source: activeSourceParts,
          repoPath: selectedRepoPath,
          until: analysisConfig.until ?? null,
        })
  const selectedSnapshotQuery = useQuery({
    queryKey: selectedSnapshotQueryKey,
    enabled: selectedRepoPath !== null && analysisConfig !== null,
    queryFn: ({ signal }) => {
      if (selectedRepoPath === null || analysisConfig === null) {
        throw new Error("Snapshot-head query ran without input.")
      }
      return client.run(
        "analysis.resolveSnapshotHead",
        {
          repositoryAbsolutePath: selectedRepoPath,
          until: analysisConfig.until,
        },
        { signal },
      )
    },
  })
  const selectedSnapshotCommitOid =
    selectedSnapshotQuery.isFetching || selectedSnapshotQuery.isError
      ? null
      : (selectedSnapshotQuery.data ?? null)

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
  }, [
    activeSourceParts,
    analysisConfig,
    analysisContext.rosterContext,
    selectedRepoPath,
    selectedSnapshotCommitOid,
  ])

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

  const selectedAnalysisQuery = useQuery({
    queryKey:
      selectedAnalysisIdentity === null
        ? (["analysis", "result", "disabled"] as const)
        : analysisQueryKeys.result(selectedAnalysisIdentity),
    enabled: selectedAnalysisIdentity !== null && analysisConfig !== null,
    queryFn: async ({ signal }): Promise<AnalysisResult> => {
      if (
        selectedRepoPath === null ||
        selectedAnalysisIdentity === null ||
        analysisScopeKey === null ||
        analysisConfig === null
      ) {
        throw new Error("Analysis query ran without input.")
      }
      const requestKey = analysisScopeKey
      const requestId = nanoid()
      const transient = useAnalysisTransientStore.getState()
      transient.startAnalysis(requestKey, requestId)
      try {
        return await client.run(
          "analysis.run",
          {
            repositoryAbsolutePath: selectedRepoPath,
            config: analysisConfig,
            snapshotCommitOid: selectedAnalysisIdentity.snapshotCommitOid,
            analysisSource:
              analysisContext.kind === "course"
                ? {
                    kind: "course",
                    ...(analysisContext.rosterContext
                      ? { rosterContext: analysisContext.rosterContext }
                      : {}),
                  }
                : { kind: "folder" },
          },
          {
            signal,
            onProgress: (progress) => {
              useAnalysisTransientStore
                .getState()
                .setAnalysisProgress(requestKey, requestId, progress)
            },
          },
        )
      } finally {
        useAnalysisTransientStore
          .getState()
          .finishAnalysis(requestKey, requestId)
      }
    },
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
      result.fileStats.length === 0 ||
      analysisContext.analysisInputs.blameSkip
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
    analysisContext.analysisInputs.blameSkip,
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
  const selectedBlameFiles = useMemo(
    () =>
      result?.fileStats
        .map((file) => file.path)
        .sort((left, right) => left.localeCompare(right)) ?? [],
    [result],
  )

  const selectedBlameQuery = useQuery({
    queryKey:
      selectedBlameIdentity === null
        ? (["analysis", "blame", "disabled"] as const)
        : analysisQueryKeys.blame(selectedBlameIdentity),
    enabled: selectedBlameIdentity !== null && effectiveBlameConfig !== null,
    queryFn: async ({ signal }): Promise<BlameResult> => {
      if (
        selectedRepoPath === null ||
        selectedBlameIdentity === null ||
        selectedBlameScopeKey === null ||
        selectedAnalysisIdentity === null ||
        effectiveBlameConfig === null ||
        result === null ||
        selectedBlameFiles.length === 0
      ) {
        throw new Error("Blame query ran without input.")
      }
      const requestKey = selectedBlameScopeKey
      const requestId = nanoid()
      const transient = useAnalysisTransientStore.getState()
      transient.startBlame(requestKey, requestId)
      try {
        return await client.run(
          "analysis.blame",
          {
            repositoryAbsolutePath: selectedRepoPath,
            config: effectiveBlameConfig,
            personDbBaseline: result.personDbBaseline,
            files: selectedBlameFiles,
            snapshotCommitOid: selectedAnalysisIdentity.snapshotCommitOid,
          },
          {
            signal,
            onProgress: (progress) => {
              const transientStore = useAnalysisTransientStore.getState()
              transientStore.setBlameProgress(requestKey, requestId, progress)
              if (progress.partialAuthorLines) {
                const next = new Map<string, number>()
                for (const entry of progress.partialAuthorLines) {
                  next.set(entry.personId, entry.lines)
                }
                transientStore.setBlamePartialAuthorLines(
                  requestKey,
                  requestId,
                  next,
                )
              }
            },
          },
        )
      } finally {
        useAnalysisTransientStore.getState().finishBlame(requestKey, requestId)
      }
    },
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

  const cancelAnalysis = useCallback(() => {
    abortCohortPrefetch()
    void queryClient.cancelQueries({
      queryKey: analysisQueryKeys.sourceRepos(activeSourceParts),
    })
  }, [abortCohortPrefetch, activeSourceParts, queryClient])

  const runAnalysis = useCallback(
    (repoPath: string) => {
      void (async () => {
        await queryClient.invalidateQueries({
          queryKey: analysisQueryKeys.repoSnapshotHeads(
            activeSourceParts,
            repoPath,
          ),
        })
        await queryClient.invalidateQueries({
          queryKey: analysisQueryKeys.repoResults(activeSourceParts, repoPath),
        })
        await queryClient.invalidateQueries({
          queryKey: analysisQueryKeys.repoBlames(activeSourceParts, repoPath),
        })
      })()
    },
    [activeSourceParts, queryClient],
  )

  const runRepoDiscovery = useCallback(
    (folder: string) => {
      if (!folder) return
      const input: AnalysisDiscoveryRequest = { folder, depth: searchDepth }
      const sameInput =
        discoveryInput?.folder === input.folder &&
        discoveryInput.depth === input.depth
      const nextDiscoveryQueryKey = analysisQueryKeys.discovery(
        activeSourceParts,
        input.folder,
        input.depth,
      )
      abortCohortPrefetch()
      setLastDiscoveryOutcome(activeSourceText, "none")
      markAutoDiscoveryRequest(activeSourceText, input)
      if (!sameInput) {
        queryClient.removeQueries({
          queryKey: nextDiscoveryQueryKey,
          exact: true,
        })
      }
      void (async () => {
        await queryClient.cancelQueries({
          queryKey: analysisQueryKeys.sourceRepos(activeSourceParts),
        })
        await refreshSourceSnapshotHeadQueries(queryClient, activeSourceParts)
      })()
      setPendingRepoDiscoveryRequest(activeSourceText, input)
      if (sameInput) {
        void queryClient.invalidateQueries({
          queryKey: nextDiscoveryQueryKey,
          exact: true,
          refetchType: "none",
        })
        void discoveryQuery.refetch()
      }
    },
    [
      abortCohortPrefetch,
      activeSourceParts,
      activeSourceText,
      discoveryInput,
      discoveryQuery,
      markAutoDiscoveryRequest,
      queryClient,
      searchDepth,
      setLastDiscoveryOutcome,
      setPendingRepoDiscoveryRequest,
    ],
  )

  const cancelDiscovery = useCallback(() => {
    setLastDiscoveryOutcome(activeSourceText, "cancelled")
    abortCohortPrefetch()
    void queryClient.cancelQueries({
      queryKey: discoveryQueryKey,
    })
  }, [
    abortCohortPrefetch,
    activeSourceText,
    discoveryQueryKey,
    queryClient,
    setLastDiscoveryOutcome,
  ])

  const selectRepository = useCallback(
    (repoPath: string | null) => {
      setSelectedRepoPath(activeSourceText, repoPath)
    },
    [activeSourceText, setSelectedRepoPath],
  )

  const discoveryValue = useMemo<AnalysisDiscoveryValue>(
    () => ({
      discoveredRepos,
      discoveryStatus,
      discoveryError,
      discoveryCurrentFolder,
      lastDiscoveryOutcome,
      runRepoDiscovery,
      cancelDiscovery,
    }),
    [
      cancelDiscovery,
      discoveredRepos,
      discoveryCurrentFolder,
      discoveryError,
      discoveryStatus,
      lastDiscoveryOutcome,
      runRepoDiscovery,
    ],
  )

  const selectionValue = useMemo<AnalysisSelectionValue>(
    () => ({
      selectedRepoPath,
      selectRepository,
      runAnalysis,
      cancelAnalysis,
      snapshotCommitOid: selectedSnapshotCommitOid,
      analysisIdentity: selectedAnalysisIdentity,
      analysisScopeKey,
    }),
    [
      analysisScopeKey,
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
