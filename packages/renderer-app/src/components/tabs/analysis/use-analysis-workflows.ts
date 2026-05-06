import type {
  AnalysisProgress,
  DiscoverReposProgress,
} from "@repo-edu/application-contract"
import type { AnalysisConfig, AnalysisResult } from "@repo-edu/domain/analysis"
import { resolveAnalysisConfig } from "@repo-edu/domain/types"
import { useCallback, useEffect, useMemo } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  analysisStoreInternals,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { buildAnalysisRosterContext } from "../../../utils/analysis-roster-context.js"
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
  const course = useCourseStore((s) => s.course)
  const client = useWorkflowClient()
  const defaultExtensions = useAppSettingsStore(
    (s) => s.settings.defaultExtensions,
  )
  const analysisConcurrency = useAppSettingsStore(
    (s) => s.settings.analysisConcurrency,
  )

  const setSearchFolder = useCourseStore((s) => s.setSearchFolder)
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
    if (!course) return null
    const config = resolveAnalysisConfig(
      course,
      defaultExtensions,
      analysisConcurrency.filesPerRepo,
    )
    const rosterContext = buildAnalysisRosterContext(course)
    return buildAnalysisStoreFingerprint(config, rosterContext)
  }, [analysisConcurrency.filesPerRepo, course, defaultExtensions])

  useEffect(() => {
    if (!currentConfigFingerprint) return
    pruneStaleResultsByFingerprint(currentConfigFingerprint)
  }, [currentConfigFingerprint, pruneStaleResultsByFingerprint])

  const runAnalysis = useCallback(
    async (repoPath: string, configOverride?: AnalysisConfig) => {
      if (!course) return
      const rosterContext = buildAnalysisRosterContext(course)

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
            course,
            repositoryAbsolutePath: repoPath,
            config:
              configOverride ??
              resolveAnalysisConfig(course, defaultExtensions, filesPerRepo),
            ...(rosterContext ? { rosterContext } : {}),
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
          resolveAnalysisConfig(course, defaultExtensions, filesPerRepo)
        const fingerprint = buildAnalysisStoreFingerprint(
          effectiveConfig,
          rosterContext,
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
      client,
      course,
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
        setDiscoveredRepos(result.repos)
        setLastDiscoveryOutcome("completed")
        setDiscoveryStatus("idle")
        setDiscoveryCurrentFolder(null)
        if (result.repos.length > 0) {
          const firstRepoPath = result.repos[0].path
          const normalizedFolder = folder.replaceAll("\\", "/")
          const normalizedRepo = firstRepoPath.replaceAll("\\", "/")
          if (
            result.repos.length === 1 &&
            normalizedFolder.startsWith(`${normalizedRepo}/`)
          ) {
            setSearchFolder(firstRepoPath)
          }
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
      client,
      runAnalysis,
      setSearchFolder,
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
