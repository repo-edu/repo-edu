import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { BlameResult } from "@repo-edu/domain/analysis"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  buildEffectiveBlameWorkflowConfig,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"

export function useBlameAutoRun() {
  const course = useCourseStore((s) => s.course)
  const client = useWorkflowClient()

  const result = useAnalysisStore((s) => s.result)
  const blameTargetFiles = useAnalysisStore((s) => s.blameTargetFiles)
  const blameFileResults = useAnalysisStore((s) => s.blameFileResults)
  const blameWorkflowStatus = useAnalysisStore((s) => s.blameWorkflowStatus)

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

        const queuedFiles = new Set(
          useAnalysisStore.getState().blameTargetFiles,
        )
        for (const fb of blameResultNew.fileBlames) {
          if (!queuedFiles.has(fb.path)) {
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
}
