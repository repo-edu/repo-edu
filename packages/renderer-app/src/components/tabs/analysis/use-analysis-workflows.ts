import type {
  AnalysisProgress,
  DiscoverReposProgress,
} from "@repo-edu/application-contract"
import type { AnalysisConfig, AnalysisResult } from "@repo-edu/domain/analysis"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import { useCallback, useEffect, useMemo } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import { useAnalysisContext } from "../../../hooks/use-analysis-context.js"
import {
  analysisStoreInternals,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { buildAnalysisStoreFingerprint } from "../../../utils/analysis-store-fingerprint.js"
import { getErrorMessage } from "../../../utils/error-message.js"
import { resolveRunCompletionAction } from "./run-analysis-state.js"

async function mapBounded<T, R>(
  items: readonly T[],
  maxConcurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await fn(items[index])
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(maxConcurrency, items.length)) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export function useAnalysisWorkflows() {
  const analysisContext = useAnalysisContext()
  const client = useWorkflowClient()
  const defaultExtensions = useAppSettingsStore(
    (s) => s.settings.defaultExtensions,
  )
  const analysisConcurrency = useAppSettingsStore(
    (s) => s.settings.analysisConcurrency,
  )

  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
  const setResultForRepo = useAnalysisStore((s) => s.setResultForRepo)
  const pruneStaleResultsByFingerprint = useAnalysisStore(
    (s) => s.pruneStaleResultsByFingerprint,
  )
  const setWorkflowStatusForRepo = useAnalysisStore(
    (s) => s.setWorkflowStatusForRepo,
  )
  const setProgressForRepo = useAnalysisStore((s) => s.setProgressForRepo)
  const setErrorMessageForRepo = useAnalysisStore(
    (s) => s.setErrorMessageForRepo,
  )

  const setDiscoveredRepos = useAnalysisStore((s) => s.setDiscoveredRepos)
  const setDiscoveryStatus = useAnalysisStore((s) => s.setDiscoveryStatus)
  const setDiscoveryError = useAnalysisStore((s) => s.setDiscoveryError)
  const setDiscoveryCurrentFolder = useAnalysisStore(
    (s) => s.setDiscoveryCurrentFolder,
  )
  const setLastDiscoveryOutcome = useAnalysisStore(
    (s) => s.setLastDiscoveryOutcome,
  )

  const currentConfigFingerprint = useMemo(() => {
    if (analysisContext.kind === "none") return null
    const config = resolveAnalysisConfig(
      {
        searchFolder: analysisContext.searchFolder,
        analysisInputs: analysisContext.analysisInputs,
      },
      defaultExtensions,
      analysisConcurrency.filesPerRepo,
    )
    return buildAnalysisStoreFingerprint(config, analysisContext.rosterContext)
  }, [analysisConcurrency.filesPerRepo, analysisContext, defaultExtensions])

  useEffect(() => {
    if (!currentConfigFingerprint) return
    pruneStaleResultsByFingerprint(currentConfigFingerprint)
  }, [currentConfigFingerprint, pruneStaleResultsByFingerprint])

  const runAnalysis = useCallback(
    async (repoPath: string, configOverride?: AnalysisConfig) => {
      if (analysisContext.kind === "none") return

      const existing = analysisStoreInternals.analysisAborts.get(repoPath)
      existing?.abort()
      const ac = new AbortController()
      analysisStoreInternals.analysisAborts.set(repoPath, ac)

      const isCurrentRun = () =>
        analysisStoreInternals.analysisAborts.get(repoPath) === ac

      setWorkflowStatusForRepo(repoPath, "running")
      setProgressForRepo(repoPath, null)
      setErrorMessageForRepo(repoPath, null)

      const filesPerRepo = analysisConcurrency.filesPerRepo

      try {
        const result: AnalysisResult = await client.run(
          "analysis.run",
          {
            repositoryAbsolutePath: repoPath,
            config:
              configOverride ??
              resolveAnalysisConfig(
                {
                  searchFolder: analysisContext.searchFolder,
                  analysisInputs: analysisContext.analysisInputs,
                },
                defaultExtensions,
                filesPerRepo,
              ),
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
            onProgress: (p: AnalysisProgress) => {
              if (!isCurrentRun()) return
              setProgressForRepo(repoPath, p)
            },
            signal: ac.signal,
          },
        )
        const action = resolveRunCompletionAction(
          isCurrentRun(),
          ac.signal.aborted,
        )
        if (action === "ignore") {
          return
        }
        if (action === "set-idle") {
          setWorkflowStatusForRepo(repoPath, "idle")
          return
        }
        const effectiveConfig =
          configOverride ??
          resolveAnalysisConfig(
            {
              searchFolder: analysisContext.searchFolder,
              analysisInputs: analysisContext.analysisInputs,
            },
            defaultExtensions,
            filesPerRepo,
          )
        const fingerprint = buildAnalysisStoreFingerprint(
          effectiveConfig,
          analysisContext.rosterContext,
        )
        setResultForRepo(repoPath, result, fingerprint)
        setWorkflowStatusForRepo(repoPath, "idle")
      } catch (err) {
        if (!isCurrentRun()) return
        if (ac.signal.aborted) {
          setWorkflowStatusForRepo(repoPath, "idle")
        } else {
          setWorkflowStatusForRepo(repoPath, "error")
          setErrorMessageForRepo(
            repoPath,
            getErrorMessage(err, "Analysis failed"),
          )
        }
      } finally {
        if (isCurrentRun()) {
          setProgressForRepo(repoPath, null)
          analysisStoreInternals.analysisAborts.delete(repoPath)
        }
      }
    },
    [
      analysisConcurrency,
      analysisContext,
      client,
      defaultExtensions,
      setErrorMessageForRepo,
      setProgressForRepo,
      setResultForRepo,
      setWorkflowStatusForRepo,
    ],
  )

  const runRepoDiscovery = useCallback(
    async (folder: string) => {
      if (!folder) return
      analysisStoreInternals.discoveryAbort?.abort()
      analysisStoreInternals.cancelAll()
      const ac = new AbortController()
      analysisStoreInternals.discoveryAbort = ac
      setLastDiscoveryOutcome("none")
      setDiscoveryStatus("loading")
      setDiscoveryError(null)
      setDiscoveryCurrentFolder(null)
      setDiscoveredRepos([])
      try {
        const result = await client.run(
          "analysis.discoverRepos",
          {
            searchFolder: folder,
            maxDepth: useAnalysisStore.getState().searchDepth,
          },
          {
            signal: ac.signal,
            onProgress: (p: DiscoverReposProgress) => {
              if (analysisStoreInternals.discoveryAbort !== ac) return
              setDiscoveryCurrentFolder(p.currentFolder)
            },
          },
        )
        if (analysisStoreInternals.discoveryAbort !== ac) return
        if (ac.signal.aborted) {
          setLastDiscoveryOutcome("cancelled")
          setDiscoveryStatus("idle")
          setDiscoveryCurrentFolder(null)
          return
        }
        const firstRepoPath = result.repos[0]?.path ?? null
        if (firstRepoPath !== null) {
          const normalizedFolder = folder.replaceAll("\\", "/")
          const normalizedRepo = firstRepoPath.replaceAll("\\", "/")
          if (
            result.repos.length === 1 &&
            normalizedFolder.startsWith(`${normalizedRepo}/`)
          ) {
            if (analysisContext.kind === "folder") {
              await analysisContext.activateFolderPath(firstRepoPath)
            } else {
              analysisContext.updateCourseSearchFolder(firstRepoPath)
            }
          }
        }
        setDiscoveredRepos(result.repos)
        setLastDiscoveryOutcome("completed")
        setDiscoveryStatus("idle")
        setDiscoveryCurrentFolder(null)
        if (result.repos.length > 0) {
          // Select the first repo immediately so the UI shows something;
          // background repos surface via per-repo status badges.
          setSelectedRepoPath(firstRepoPath)
          const repoPaths = result.repos.map((r) => r.path)
          // Fan out: analyse every discovered repo with bounded concurrency
          // so a full cohort doesn't thrash on simultaneous git subprocess
          // pipelines.
          void mapBounded(
            repoPaths,
            analysisConcurrency.repoParallelism,
            (path) => runAnalysis(path),
          )
        }
      } catch (err) {
        if (analysisStoreInternals.discoveryAbort !== ac) return
        if (ac.signal.aborted) {
          setLastDiscoveryOutcome("cancelled")
          setDiscoveryStatus("idle")
          setDiscoveryCurrentFolder(null)
          return
        }
        setLastDiscoveryOutcome("none")
        setDiscoveryStatus("error")
        setDiscoveryCurrentFolder(null)
        setDiscoveryError(getErrorMessage(err, "Discovery failed"))
      } finally {
        if (analysisStoreInternals.discoveryAbort === ac) {
          analysisStoreInternals.discoveryAbort = null
        }
      }
    },
    [
      analysisConcurrency,
      analysisContext,
      client,
      runAnalysis,
      setSelectedRepoPath,
      setDiscoveryStatus,
      setDiscoveryError,
      setDiscoveryCurrentFolder,
      setDiscoveredRepos,
      setLastDiscoveryOutcome,
    ],
  )

  const handleCancel = useCallback(() => {
    analysisStoreInternals.cancelAll()
  }, [])

  const handleCancelDiscovery = useCallback(() => {
    analysisStoreInternals.discoveryAbort?.abort()
  }, [])

  return {
    runAnalysis,
    runRepoDiscovery,
    handleCancel,
    handleCancelDiscovery,
  }
}
