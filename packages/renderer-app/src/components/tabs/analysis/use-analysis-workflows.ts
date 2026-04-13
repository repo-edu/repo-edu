import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { AnalysisConfig, AnalysisResult } from "@repo-edu/domain/analysis"
import { useCallback } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  analysisStoreInternals,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { buildAnalysisRosterContext } from "../../../utils/analysis-roster-context.js"
import { getErrorMessage } from "../../../utils/error-message.js"

export function useAnalysisWorkflows() {
  const course = useCourseStore((s) => s.course)
  const client = useWorkflowClient()

  const config = useAnalysisStore((s) => s.config)
  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
  const setResult = useAnalysisStore((s) => s.setResult)
  const setWorkflowStatus = useAnalysisStore((s) => s.setWorkflowStatus)
  const setProgress = useAnalysisStore((s) => s.setProgress)
  const setErrorMessage = useAnalysisStore((s) => s.setErrorMessage)
  const setFocusedFilePath = useAnalysisStore((s) => s.setFocusedFilePath)

  const searchDepth = useAnalysisStore((s) => s.searchDepth)
  const setDiscoveredRepos = useAnalysisStore((s) => s.setDiscoveredRepos)
  const setDiscoveryStatus = useAnalysisStore((s) => s.setDiscoveryStatus)
  const setDiscoveryError = useAnalysisStore((s) => s.setDiscoveryError)
  const setLastDiscoveryOutcome = useAnalysisStore(
    (s) => s.setLastDiscoveryOutcome,
  )

  const runAnalysis = useCallback(
    async (repoPath: string, configOverride?: AnalysisConfig) => {
      if (!course) return
      const rosterContext = buildAnalysisRosterContext(course)

      analysisStoreInternals.analysisAbort?.abort()
      const ac = new AbortController()
      analysisStoreInternals.analysisAbort = ac
      const isCurrentRun = () => analysisStoreInternals.analysisAbort === ac

      setWorkflowStatus("running")
      setProgress(null)
      setErrorMessage(null)
      setResult(null)

      try {
        const result: AnalysisResult = await client.run(
          "analysis.run",
          {
            course,
            repositoryAbsolutePath: repoPath,
            config: configOverride ?? config,
            ...(rosterContext ? { rosterContext } : {}),
          },
          {
            onProgress: (p: AnalysisProgress) => {
              if (!isCurrentRun()) return
              setProgress(p)
            },
            signal: ac.signal,
          },
        )
        if (!isCurrentRun()) {
          return
        }
        if (ac.signal.aborted) {
          setWorkflowStatus("idle")
          return
        }
        setResult(result)
        const paths = result.fileStats.map((f) => f.path).sort()
        setFocusedFilePath(paths[0] ?? null)
        setWorkflowStatus("idle")
      } catch (err) {
        if (!isCurrentRun()) {
          return
        }
        if (ac.signal.aborted) {
          setWorkflowStatus("idle")
        } else {
          setWorkflowStatus("error")
          setErrorMessage(getErrorMessage(err, "Analysis failed"))
        }
      } finally {
        if (isCurrentRun()) {
          setProgress(null)
          analysisStoreInternals.analysisAbort = null
        }
      }
    },
    [
      client,
      config,
      course,
      setErrorMessage,
      setProgress,
      setResult,
      setFocusedFilePath,
      setWorkflowStatus,
    ],
  )

  const runRepoDiscovery = useCallback(
    async (folder: string) => {
      if (!folder) return
      analysisStoreInternals.discoveryAbort?.abort()
      const ac = new AbortController()
      analysisStoreInternals.discoveryAbort = ac
      setLastDiscoveryOutcome("none")
      setDiscoveryStatus("loading")
      setDiscoveryError(null)
      setDiscoveredRepos([])
      try {
        const result = await client.run(
          "analysis.discoverRepos",
          { searchFolder: folder, maxDepth: searchDepth },
          { signal: ac.signal },
        )
        if (analysisStoreInternals.discoveryAbort !== ac) return
        if (ac.signal.aborted) {
          setLastDiscoveryOutcome("cancelled")
          setDiscoveryStatus("idle")
          return
        }
        setDiscoveredRepos(result.repos)
        setLastDiscoveryOutcome("completed")
        setDiscoveryStatus("idle")
        if (result.repos.length > 0) {
          setSelectedRepoPath(result.repos[0].path)
          runAnalysis(result.repos[0].path)
        }
      } catch (err) {
        if (analysisStoreInternals.discoveryAbort !== ac) return
        if (ac.signal.aborted) {
          setLastDiscoveryOutcome("cancelled")
          setDiscoveryStatus("idle")
          return
        }
        setLastDiscoveryOutcome("none")
        setDiscoveryStatus("error")
        setDiscoveryError(getErrorMessage(err, "Discovery failed"))
      } finally {
        if (analysisStoreInternals.discoveryAbort === ac) {
          analysisStoreInternals.discoveryAbort = null
        }
      }
    },
    [
      client,
      runAnalysis,
      searchDepth,
      setSelectedRepoPath,
      setDiscoveryStatus,
      setDiscoveryError,
      setDiscoveredRepos,
      setLastDiscoveryOutcome,
    ],
  )

  const handleCancel = useCallback(() => {
    analysisStoreInternals.analysisAbort?.abort()
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
