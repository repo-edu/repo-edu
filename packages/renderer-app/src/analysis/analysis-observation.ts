import type { AnalysisDiscoverReposResult } from "@repo-edu/application-contract"
import type {
  AnalysisBlameConfig,
  AnalysisResult,
  BlameResult,
} from "@repo-edu/domain/analysis"
import { skipToken, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  selectEffectiveSelectedRepoPath,
  selectPendingRepoDiscoveryRequestForScope,
  selectSelectedRepoPathForScope,
  useAnalysisStore,
} from "../stores/analysis-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import type {
  AnalysisWorkflowStatus,
  DiscoveryStatus,
} from "./analysis-contexts.js"
import {
  type AnalysisQueryIdentity,
  analysisQueryKeys,
  analysisResultScopeKey,
  analysisSourceScopeKey,
  blameResultScopeKey,
  buildAnalysisQueryIdentity,
  buildBlameQueryIdentity,
} from "./analysis-query-keys.js"
import type { AnalysisSourceInput } from "./analysis-source-input.js"
import {
  EMPTY_PARTIAL_AUTHOR_LINES,
  useAnalysisTransientStore,
} from "./analysis-transient-store.js"

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

export function useAnalysisObservation({
  input,
  effectiveBlameConfig,
}: {
  input: AnalysisSourceInput
  effectiveBlameConfig: AnalysisBlameConfig | null
}) {
  const activeSourceText = useMemo(
    () => analysisSourceScopeKey(input.source),
    [input],
  )
  const storedSelectedRepoPath = useAnalysisStore((state) =>
    selectSelectedRepoPathForScope(state, activeSourceText),
  )
  const discoveryInput = useAnalysisStore((state) =>
    selectPendingRepoDiscoveryRequestForScope(state, activeSourceText),
  )

  const discoveryQueryKey =
    discoveryInput === null
      ? (["analysis", "discovery", "disabled"] as const)
      : analysisQueryKeys.discovery(
          input.source,
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
    selectedRepoPath === null || input.config === null
      ? (["analysis", "snapshot-head", "disabled"] as const)
      : analysisQueryKeys.snapshotHead({
          source: input.source,
          repoPath: selectedRepoPath,
          until: input.config.until ?? null,
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
      input.config === null ||
      selectedSnapshotCommitOid === null
    ) {
      return null
    }
    return buildAnalysisQueryIdentity({
      source: input.source,
      repoPath: selectedRepoPath,
      snapshotCommitOid: selectedSnapshotCommitOid,
      config: input.config,
      rosterContext: input.rosterContext,
    })
  }, [input, selectedRepoPath, selectedSnapshotCommitOid])
  const analysisScopeKey = useMemo(
    () =>
      selectedAnalysisIdentity === null
        ? null
        : analysisResultScopeKey(selectedAnalysisIdentity),
    [selectedAnalysisIdentity],
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
      source: input.source,
      repoPath: selectedRepoPath,
      analysis: selectedAnalysisIdentity,
      config: effectiveBlameConfig,
    })
  }, [
    effectiveBlameConfig,
    input,
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

  return {
    activeSourceText,
    discoveredRepos,
    discoveredRepoPaths,
    selectedRepoPath,
    discoveryStatus,
    discoveryError,
    discoveryCurrentFolder,
    discoveryCompleted,
    selectedSnapshotCommitOid,
    selectedAnalysisIdentity,
    analysisScopeKey,
    result,
    selectedAnalysisProgress,
    analysisStatus,
    analysisErrorMessage,
    blameResult,
    blameStatus,
    blameErrorMessage,
    blameProgress: selectedBlameTransient?.progress ?? null,
    blamePartialAuthorLines:
      selectedBlameTransient?.partialAuthorLines ?? EMPTY_PARTIAL_AUTHOR_LINES,
  }
}

export type AnalysisObservation = ReturnType<typeof useAnalysisObservation>
