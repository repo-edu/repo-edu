import type {
  AnalysisDiscoverReposResult,
  AnalysisProgress,
  DiscoveredRepo,
} from "@repo-edu/application-contract"
import type {
  AnalysisBlameConfig,
  AnalysisResult,
  AuthorStats,
  BlameResult,
  FileStats,
} from "@repo-edu/domain/analysis"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import {
  type Query,
  type QueryKey,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { nanoid } from "nanoid"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { useAnalysisContext } from "../hooks/use-analysis-context.js"
import { selectActiveAnalysisSourceKey } from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"
import { useAnalysisStore } from "../stores/analysis-store.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import {
  type AnalysisQueryIdentity,
  analysisQueryKeys,
  analysisSourceKeyParts,
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

type DiscoveryInput = {
  readonly folder: string
  readonly depth: number
}

export type AnalysisCoordinatorValue = {
  discoveredRepos: readonly DiscoveredRepo[]
  discoveryStatus: DiscoveryStatus
  discoveryError: string | null
  discoveryCurrentFolder: string | null
  lastDiscoveryOutcome: "none" | "completed" | "cancelled"
  runRepoDiscovery: (folder: string) => void
  cancelDiscovery: () => void
  runAnalysis: (repoPath: string) => void
  cancelAnalysis: () => void
  result: AnalysisResult | null
  snapshotCommitOid: string | null
  analysisIdentity: AnalysisQueryIdentity | null
  analysisStatus: AnalysisWorkflowStatus
  analysisProgress: AnalysisProgress | null
  analysisErrorMessage: string | null
  blameResult: BlameResult | null
  blameStatus: AnalysisWorkflowStatus
  blameProgress: AnalysisProgress | null
  blamePartialAuthorLines: ReadonlyMap<string, number>
  blameErrorMessage: string | null
  mergedAuthorStats: AuthorStats[]
  filteredAuthorStats: AuthorStats[]
  mergedFileStats: FileStats[]
  filteredFileStats: FileStats[]
  authorColorsByPersonId: ReadonlyMap<string, string>
  authorDisplayByPersonId: ReturnType<typeof buildAuthorDisplayByPersonId>
  rosterMatchByPersonId: ReturnType<typeof buildRosterMatchByPersonId>
}

const AnalysisCoordinatorContext =
  createContext<AnalysisCoordinatorValue | null>(null)

export function useAnalysisCoordinator(): AnalysisCoordinatorValue {
  const value = useContext(AnalysisCoordinatorContext)
  if (value === null) {
    throw new Error("useAnalysisCoordinator must be used inside its provider.")
  }
  return value
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

function queryKeyContains(value: unknown, target: unknown): boolean {
  if (value === target) return true
  if (Array.isArray(value)) {
    return value.some((entry) => queryKeyContains(entry, target))
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((entry) => queryKeyContains(entry, target))
  }
  return false
}

function queryMatchesRepo(query: Query, repoPath: string): boolean {
  return queryKeyContains(query.queryKey, repoPath)
}

function queryMatchesSource(
  queryKey: QueryKey,
  sourceKeyText: string,
): boolean {
  return JSON.stringify(queryKey).includes(sourceKeyText)
}

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
  const analysisContext = useAnalysisContext()
  const activeSourceKey = useSessionControllerSelector(
    selectActiveAnalysisSourceKey,
  )
  const activeSourceParts = useMemo(
    () => analysisSourceKeyParts(activeSourceKey),
    [activeSourceKey],
  )
  const activeSourceText = useMemo(
    () => JSON.stringify(activeSourceParts),
    [activeSourceParts],
  )

  const selectedRepoPath = useAnalysisStore((state) => state.selectedRepoPath)
  const setSelectedRepoPath = useAnalysisStore(
    (state) => state.setSelectedRepoPath,
  )
  const searchDepth = useAnalysisStore((state) => state.searchDepth)
  const selectedAuthors = useAnalysisStore((state) => state.selectedAuthors)
  const fileSelectionMode = useAnalysisStore((state) => state.fileSelectionMode)
  const selectedFiles = useAnalysisStore((state) => state.selectedFiles)
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

  const [discoveryInput, setDiscoveryInput] = useState<DiscoveryInput | null>(
    null,
  )
  const [lastDiscoveryOutcome, setLastDiscoveryOutcome] = useState<
    "none" | "completed" | "cancelled"
  >("none")
  const prefetchBatchRef = useRef(0)
  const previousSourceTextRef = useRef(activeSourceText)

  useEffect(() => {
    const previousSourceText = previousSourceTextRef.current
    if (previousSourceText === activeSourceText) return
    previousSourceTextRef.current = activeSourceText
    setDiscoveryInput(null)
    setLastDiscoveryOutcome("none")
    prefetchBatchRef.current += 1
    setSelectedRepoPath(null)
    void queryClient.cancelQueries({
      predicate: (query) =>
        queryMatchesSource(query.queryKey, previousSourceText),
    })
  }, [activeSourceText, queryClient, setSelectedRepoPath])

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
  const discoveredRepos = discoveryQuery.data?.repos ?? []
  const discoveryStatus: DiscoveryStatus = discoveryQuery.isFetching
    ? "loading"
    : discoveryQuery.isError
      ? "error"
      : "idle"
  const discoveryError = discoveryQuery.isError
    ? toAppErrorMessage(discoveryQuery.error, "Discovery failed")
    : null

  const prefetchRepoAnalysis = useCallback(
    async (repoPath: string, config = analysisConfig): Promise<void> => {
      if (analysisContext.kind === "none" || config === null) return
      const snapshotKey = analysisQueryKeys.snapshotHead({
        source: activeSourceParts,
        repoPath,
        asOfCommit: null,
        until: config.until ?? null,
      })
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
      const identity = buildAnalysisQueryIdentity({
        source: activeSourceParts,
        repoPath,
        snapshotCommitOid,
        config,
        rosterContext: analysisContext.rosterContext,
      })
      await queryClient.ensureQueryData({
        queryKey: analysisQueryKeys.result(identity),
        queryFn: async ({ signal }) => {
          const requestId = nanoid()
          const transient = useAnalysisTransientStore.getState()
          transient.startAnalysis(repoPath, requestId)
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
                    .setAnalysisProgress(repoPath, requestId, progress)
                },
              },
            )
          } finally {
            useAnalysisTransientStore
              .getState()
              .finishAnalysis(repoPath, requestId)
          }
        },
      })
    },
    [activeSourceParts, analysisConfig, analysisContext, client, queryClient],
  )

  const discoveryHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!discoveryInput || !discoveryQuery.data) return
    const handledKey = JSON.stringify([discoveryQueryKey, discoveryQuery.data])
    if (discoveryHandledRef.current === handledKey) return
    discoveryHandledRef.current = handledKey
    setLastDiscoveryOutcome("completed")

    const firstRepoPath = discoveryQuery.data.repos[0]?.path ?? null
    if (firstRepoPath !== null) {
      const normalizedFolder = discoveryInput.folder.replaceAll("\\", "/")
      const normalizedRepo = firstRepoPath.replaceAll("\\", "/")
      if (
        discoveryQuery.data.repos.length === 1 &&
        normalizedFolder.startsWith(`${normalizedRepo}/`)
      ) {
        if (analysisContext.kind === "folder") {
          void analysisContext.activateFolderPath(firstRepoPath)
        } else {
          analysisContext.updateCourseSearchFolder(firstRepoPath)
        }
      }
      setSelectedRepoPath(firstRepoPath)
      const batchId = ++prefetchBatchRef.current
      void mapBounded(
        discoveryQuery.data.repos.map((repo) => repo.path),
        analysisConcurrency.repoParallelism,
        async (repoPath) => {
          if (prefetchBatchRef.current !== batchId) return
          await prefetchRepoAnalysis(repoPath)
        },
      ).catch(() => {})
    }
  }, [
    analysisConcurrency.repoParallelism,
    analysisContext,
    discoveryInput,
    discoveryQuery.data,
    discoveryQueryKey,
    prefetchRepoAnalysis,
    setSelectedRepoPath,
  ])

  useEffect(() => {
    if (discoveryQuery.isError) {
      setLastDiscoveryOutcome("none")
    }
  }, [discoveryQuery.isError])

  const selectedSnapshotQueryKey =
    selectedRepoPath === null || analysisConfig === null
      ? (["analysis", "snapshot-head", "disabled"] as const)
      : analysisQueryKeys.snapshotHead({
          source: activeSourceParts,
          repoPath: selectedRepoPath,
          asOfCommit: null,
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

  const selectedAnalysisIdentity = useMemo<AnalysisQueryIdentity | null>(() => {
    if (
      selectedRepoPath === null ||
      analysisConfig === null ||
      !selectedSnapshotQuery.data
    ) {
      return null
    }
    return buildAnalysisQueryIdentity({
      source: activeSourceParts,
      repoPath: selectedRepoPath,
      snapshotCommitOid: selectedSnapshotQuery.data,
      config: analysisConfig,
      rosterContext: analysisContext.rosterContext,
    })
  }, [
    activeSourceParts,
    analysisConfig,
    analysisContext.rosterContext,
    selectedRepoPath,
    selectedSnapshotQuery.data,
  ])

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
        analysisConfig === null
      ) {
        throw new Error("Analysis query ran without input.")
      }
      const requestId = nanoid()
      const transient = useAnalysisTransientStore.getState()
      transient.startAnalysis(selectedRepoPath, requestId)
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
                .setAnalysisProgress(selectedRepoPath, requestId, progress)
            },
          },
        )
      } finally {
        useAnalysisTransientStore
          .getState()
          .finishAnalysis(selectedRepoPath, requestId)
      }
    },
  })

  const selectedAnalysisProgress = useAnalysisTransientStore((state) =>
    selectedRepoPath === null
      ? null
      : (state.analysisByRepoPath.get(selectedRepoPath)?.progress ?? null),
  )

  const result = selectedAnalysisQuery.data ?? null
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
      result,
    })
  }, [
    activeSourceParts,
    analysisContext.analysisInputs.blameSkip,
    effectiveBlameConfig,
    result,
    selectedAnalysisIdentity,
    selectedRepoPath,
  ])

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
        selectedAnalysisIdentity === null ||
        effectiveBlameConfig === null ||
        result === null
      ) {
        throw new Error("Blame query ran without input.")
      }
      const requestId = nanoid()
      const transient = useAnalysisTransientStore.getState()
      transient.startBlame(selectedRepoPath, requestId)
      try {
        return await client.run(
          "analysis.blame",
          {
            repositoryAbsolutePath: selectedRepoPath,
            config: effectiveBlameConfig,
            personDbBaseline: result.personDbBaseline,
            files: [...selectedBlameIdentity.files],
            snapshotCommitOid: selectedAnalysisIdentity.snapshotCommitOid,
          },
          {
            signal,
            onProgress: (progress) => {
              const transientStore = useAnalysisTransientStore.getState()
              transientStore.setBlameProgress(
                selectedRepoPath,
                requestId,
                progress,
              )
              if (progress.partialAuthorLines) {
                const next = new Map<string, number>()
                for (const entry of progress.partialAuthorLines) {
                  next.set(entry.personId, entry.lines)
                }
                transientStore.setBlamePartialAuthorLines(
                  selectedRepoPath,
                  requestId,
                  next,
                )
              }
            },
          },
        )
      } finally {
        useAnalysisTransientStore
          .getState()
          .finishBlame(selectedRepoPath, requestId)
      }
    },
  })

  const selectedBlameTransient = useAnalysisTransientStore((state) =>
    selectedRepoPath === null
      ? null
      : (state.blameByRepoPath.get(selectedRepoPath) ?? null),
  )
  const blameResult = selectedBlameQuery.data ?? null
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
    prefetchBatchRef.current += 1
    void queryClient.cancelQueries({
      predicate: (query) =>
        queryMatchesSource(query.queryKey, activeSourceText),
    })
  }, [activeSourceText, queryClient])

  const runAnalysis = useCallback(
    (repoPath: string) => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryMatchesRepo(query, repoPath) &&
          queryKeyContains(query.queryKey, "snapshot-head"),
      })
      void queryClient.invalidateQueries({
        predicate: (query) =>
          queryMatchesRepo(query, repoPath) &&
          (queryKeyContains(query.queryKey, "result") ||
            queryKeyContains(query.queryKey, "blame")),
      })
    },
    [queryClient],
  )

  const runRepoDiscovery = useCallback(
    (folder: string) => {
      if (!folder) return
      const input = { folder, depth: searchDepth }
      const sameInput =
        discoveryInput?.folder === input.folder &&
        discoveryInput.depth === input.depth
      prefetchBatchRef.current += 1
      setLastDiscoveryOutcome("none")
      setDiscoveryInput(input)
      void queryClient.cancelQueries({
        predicate: (query) =>
          queryMatchesSource(query.queryKey, activeSourceText) &&
          !queryKeyContains(query.queryKey, "discovery"),
      })
      if (sameInput) {
        void discoveryQuery.refetch()
      }
    },
    [
      activeSourceText,
      discoveryInput,
      discoveryQuery,
      queryClient,
      searchDepth,
    ],
  )

  const cancelDiscovery = useCallback(() => {
    setLastDiscoveryOutcome("cancelled")
    prefetchBatchRef.current += 1
    void queryClient.cancelQueries({
      queryKey: discoveryQueryKey,
    })
  }, [discoveryQueryKey, queryClient])

  const value = useMemo<AnalysisCoordinatorValue>(
    () => ({
      discoveredRepos,
      discoveryStatus,
      discoveryError,
      discoveryCurrentFolder,
      lastDiscoveryOutcome,
      runRepoDiscovery,
      cancelDiscovery,
      runAnalysis,
      cancelAnalysis,
      result,
      snapshotCommitOid: selectedSnapshotQuery.data ?? null,
      analysisIdentity: selectedAnalysisIdentity,
      analysisStatus,
      analysisProgress: selectedAnalysisProgress,
      analysisErrorMessage,
      blameResult,
      blameStatus,
      blameProgress: selectedBlameTransient?.progress ?? null,
      blamePartialAuthorLines:
        selectedBlameTransient?.partialAuthorLines ??
        EMPTY_PARTIAL_AUTHOR_LINES,
      blameErrorMessage,
      mergedAuthorStats,
      filteredAuthorStats,
      mergedFileStats,
      filteredFileStats,
      authorColorsByPersonId,
      authorDisplayByPersonId,
      rosterMatchByPersonId,
    }),
    [
      analysisErrorMessage,
      analysisStatus,
      authorColorsByPersonId,
      authorDisplayByPersonId,
      blameErrorMessage,
      blameResult,
      blameStatus,
      cancelAnalysis,
      cancelDiscovery,
      discoveredRepos,
      discoveryCurrentFolder,
      discoveryError,
      discoveryStatus,
      filteredAuthorStats,
      filteredFileStats,
      lastDiscoveryOutcome,
      mergedAuthorStats,
      mergedFileStats,
      result,
      rosterMatchByPersonId,
      runAnalysis,
      runRepoDiscovery,
      selectedAnalysisIdentity,
      selectedAnalysisProgress,
      selectedBlameTransient?.partialAuthorLines,
      selectedBlameTransient?.progress,
      selectedSnapshotQuery.data,
    ],
  )

  return (
    <AnalysisCoordinatorContext.Provider value={value}>
      {children}
    </AnalysisCoordinatorContext.Provider>
  )
}
