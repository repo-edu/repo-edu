import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { BlameResult } from "@repo-edu/domain/analysis"
import { EmptyState } from "@repo-edu/ui"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  buildEffectiveBlameWorkflowConfig,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { BlameTab } from "./BlameTab.js"

export function BlamePanel() {
  const course = useCourseStore((s) => s.course)
  const client = useWorkflowClient()

  const result = useAnalysisStore((s) => s.result)
  const blameTargetFiles = useAnalysisStore((s) => s.blameTargetFiles)
  const activeBlameFile = useAnalysisStore((s) => s.activeBlameFile)
  const blameFileResults = useAnalysisStore((s) => s.blameFileResults)
  const blameWorkflowStatus = useAnalysisStore((s) => s.blameWorkflowStatus)
  const blameProgress = useAnalysisStore((s) => s.blameProgress)
  const blameErrorMessage = useAnalysisStore((s) => s.blameErrorMessage)

  const setBlameResult = useAnalysisStore((s) => s.setBlameResult)
  const setBlameFileResult = useAnalysisStore((s) => s.setBlameFileResult)
  const clearBlameFileResults = useAnalysisStore((s) => s.clearBlameFileResults)
  const setBlameWorkflowStatus = useAnalysisStore(
    (s) => s.setBlameWorkflowStatus,
  )
  const setBlameProgress = useAnalysisStore((s) => s.setBlameProgress)
  const setBlameErrorMessage = useAnalysisStore((s) => s.setBlameErrorMessage)
  const blameContextSnapshot = useAnalysisStore((s) => s.blameContextSnapshot)
  const setBlameContextSnapshot = useAnalysisStore(
    (s) => s.setBlameContextSnapshot,
  )

  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const config = useAnalysisStore((s) => s.config)
  const blameSkip = useAnalysisStore((s) => s.config.blameSkip ?? false)
  const blameConfig = useAnalysisStore((s) => s.blameConfig)
  const asOfCommit = useAnalysisStore((s) => s.asOfCommit)
  const effectiveBlameConfig = useMemo(
    () => buildEffectiveBlameWorkflowConfig(config, blameConfig),
    [config, blameConfig],
  )
  const effectiveBlameConfigSnapshot = useMemo(
    () => JSON.stringify(effectiveBlameConfig),
    [effectiveBlameConfig],
  )

  const abortRef = useRef<AbortController | null>(null)
  const contextVersionRef = useRef(0)
  const contextSnapshot = `${course?.id ?? ""}\0${selectedRepoPath ?? ""}\0${result?.resolvedAsOfOid ?? ""}\0${asOfCommit}\0${blameSkip ? "1" : "0"}\0${effectiveBlameConfigSnapshot}`

  useEffect(() => {
    if (blameContextSnapshot === null) {
      setBlameContextSnapshot(contextSnapshot)
      return
    }
    if (blameContextSnapshot === contextSnapshot) {
      return
    }
    setBlameContextSnapshot(contextSnapshot)
    contextVersionRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    // Blame results are context-dependent; invalidate cache when context changes.
    setBlameResult(null)
    clearBlameFileResults()
    setBlameWorkflowStatus("idle")
    setBlameProgress(null)
    setBlameErrorMessage(null)
  }, [
    blameContextSnapshot,
    clearBlameFileResults,
    contextSnapshot,
    setBlameContextSnapshot,
    setBlameErrorMessage,
    setBlameProgress,
    setBlameResult,
    setBlameWorkflowStatus,
  ])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
    [],
  )

  const runBlame = useCallback(
    async (filesToLoad: string[]) => {
      if (
        !course ||
        !selectedRepoPath ||
        !result ||
        filesToLoad.length === 0 ||
        blameSkip
      ) {
        return
      }

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      const contextVersion = contextVersionRef.current
      const isCurrentRun = () =>
        abortRef.current === ac && contextVersion === contextVersionRef.current

      setBlameWorkflowStatus("running")
      setBlameProgress(null)
      setBlameErrorMessage(null)

      for (const path of filesToLoad) {
        setBlameFileResult(path, {
          status: "pending",
          fileBlame: null,
          errorMessage: null,
        })
      }

      try {
        const blameResultNew: BlameResult = await client.run(
          "analysis.blame",
          {
            course,
            repositoryAbsolutePath: selectedRepoPath,
            config: effectiveBlameConfig,
            personDbBaseline: result.personDbBaseline,
            personDbOverlay:
              useAnalysisStore.getState().blameResult?.personDbOverlay,
            files: filesToLoad,
            asOfCommit: asOfCommit || result.resolvedAsOfOid,
          },
          {
            onProgress: (p: AnalysisProgress) => setBlameProgress(p),
            signal: ac.signal,
          },
        )

        if (ac.signal.aborted || !isCurrentRun()) {
          return
        }

        const openFiles = new Set(useAnalysisStore.getState().blameTargetFiles)
        for (const fb of blameResultNew.fileBlames) {
          if (!openFiles.has(fb.path)) {
            continue
          }
          setBlameFileResult(fb.path, {
            status: "loaded",
            fileBlame: fb,
            errorMessage: null,
          })
        }
        setBlameResult(blameResultNew)
        setBlameWorkflowStatus("idle")
      } catch (err) {
        if (!isCurrentRun()) {
          return
        }
        if (ac.signal.aborted) {
          setBlameWorkflowStatus("idle")
        } else {
          const msg =
            err instanceof Error ? err.message : "Blame analysis failed"
          setBlameWorkflowStatus("error")
          setBlameErrorMessage(msg)
          for (const path of filesToLoad) {
            setBlameFileResult(path, {
              status: "error",
              fileBlame: null,
              errorMessage: msg,
            })
          }
        }
      } finally {
        if (abortRef.current === ac) {
          setBlameProgress(null)
          abortRef.current = null
        }
      }
    },
    [
      asOfCommit,
      blameSkip,
      client,
      course,
      effectiveBlameConfig,
      result,
      selectedRepoPath,
      setBlameErrorMessage,
      setBlameFileResult,
      setBlameProgress,
      setBlameResult,
      setBlameWorkflowStatus,
    ],
  )

  // Auto-trigger blame for newly added files
  useEffect(() => {
    if (blameSkip) return
    if (blameWorkflowStatus === "running") return
    if (!result) return

    const pending = blameTargetFiles.filter((p) => !blameFileResults.has(p))
    if (pending.length > 0) {
      runBlame(pending)
    }
  }, [
    blameTargetFiles,
    blameFileResults,
    blameSkip,
    blameWorkflowStatus,
    result,
    runBlame,
  ])

  if (blameTargetFiles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <EmptyState message="Select a file in the sidebar to start blame analysis." />
      </div>
    )
  }

  const isRunning = blameWorkflowStatus === "running"

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Progress bar */}
      {isRunning && blameProgress && (
        <div className="border-b px-3 py-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{blameProgress.label}</span>
            <span>
              {blameProgress.processedFiles}/{blameProgress.totalFiles}
            </span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${blameProgress.totalFiles > 0 ? Math.round((blameProgress.processedFiles / blameProgress.totalFiles) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error banner */}
      {blameErrorMessage && (
        <div className="border-b border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {blameErrorMessage}
        </div>
      )}

      {/* Active file content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeBlameFile ? (
          <BlameTab filePath={activeBlameFile} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState message="Select a file in the sidebar." />
          </div>
        )}
      </div>
    </div>
  )
}
