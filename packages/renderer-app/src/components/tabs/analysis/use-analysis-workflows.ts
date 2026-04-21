import type {
  AnalysisProgress,
  DiscoverReposProgress,
} from "@repo-edu/application-contract"
import type { AnalysisConfig, AnalysisResult } from "@repo-edu/domain/analysis"
import { resolveCourseAnalysisConfig } from "@repo-edu/domain/types"
import { useCallback } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  analysisStoreInternals,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { buildAnalysisRosterContext } from "../../../utils/analysis-roster-context.js"
import { getErrorMessage } from "../../../utils/error-message.js"

export function useAnalysisWorkflows() {
  const course = useCourseStore((s) => s.course)
  const client = useWorkflowClient()
  const defaultExtensions = useAppSettingsStore(
    (s) => s.settings.defaultExtensions,
  )

  const setSearchFolder = useCourseStore((s) => s.setSearchFolder)
  const setSelectedRepoPath = useAnalysisStore((s) => s.setSelectedRepoPath)
  const setResult = useAnalysisStore((s) => s.setResult)
  const setWorkflowStatus = useAnalysisStore((s) => s.setWorkflowStatus)
  const setProgress = useAnalysisStore((s) => s.setProgress)
  const setErrorMessage = useAnalysisStore((s) => s.setErrorMessage)

  const setDiscoveredRepos = useAnalysisStore((s) => s.setDiscoveredRepos)
  const setDiscoveryStatus = useAnalysisStore((s) => s.setDiscoveryStatus)
  const setDiscoveryError = useAnalysisStore((s) => s.setDiscoveryError)
  const setDiscoveryCurrentFolder = useAnalysisStore(
    (s) => s.setDiscoveryCurrentFolder,
  )
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
            config:
              configOverride ??
              resolveCourseAnalysisConfig(course, defaultExtensions, 1),
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
      course,
      defaultExtensions,
      setErrorMessage,
      setProgress,
      setResult,
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
          setSelectedRepoPath(firstRepoPath)
          runAnalysis(firstRepoPath)
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
