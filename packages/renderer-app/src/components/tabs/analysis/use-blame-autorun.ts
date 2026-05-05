import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { BlameResult } from "@repo-edu/domain/analysis"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  buildEffectiveBlameWorkflowConfig,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useAppSettingsStore } from "../../../stores/app-settings-store.js"
import { useCourseStore } from "../../../stores/course-store.js"

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const entries = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
    .join(",")
  return `{${entries}}`
}

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
  const setBlamePartialAuthorLines = useAnalysisStore(
    (s) => s.setBlamePartialAuthorLines,
  )
  const setBlameErrorMessage = useAnalysisStore((s) => s.setBlameErrorMessage)
  const blameContextSnapshot = useAnalysisStore((s) => s.blameContextSnapshot)
  const setBlameContextSnapshot = useAnalysisStore(
    (s) => s.setBlameContextSnapshot,
  )

  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const blameSkip = course?.analysisInputs.blameSkip ?? false
  const blameConfig = useAnalysisStore((s) => s.blameConfig)
  const asOfCommit = useAnalysisStore((s) => s.asOfCommit)
  const defaultExtensions = useAppSettingsStore(
    (s) => s.settings.defaultExtensions,
  )
  const analysisConcurrency = useAppSettingsStore(
    (s) => s.settings.analysisConcurrency,
  )
  // Blame runs against one repo at a time, so the per-repo file budget
  // would leave the rest of the global git-process budget idle. Spend it
  // all on the selected repo.
  const blameMaxConcurrency =
    analysisConcurrency.repoParallelism * analysisConcurrency.filesPerRepo
  const effectiveBlameConfig = useMemo(
    () =>
      course
        ? buildEffectiveBlameWorkflowConfig(
            course,
            blameConfig,
            defaultExtensions,
            blameMaxConcurrency,
          )
        : blameConfig,
    [course, blameConfig, defaultExtensions, blameMaxConcurrency],
  )
  const effectiveBlameConfigSnapshot = useMemo(
    () => stableStringify(effectiveBlameConfig),
    [effectiveBlameConfig],
  )

  const abortRef = useRef<AbortController | null>(null)
  const contextVersionRef = useRef(0)
  // Blame context excludes `selectedRepoPath` deliberately: repo switches
  // must re-point the selectors at the stored per-repo entry without
  // clearing anything. Changes to `asOfCommit`, `blameConfig`, or
  // `blameSkip` for the currently selected repo still trigger abort+clear.
  const contextSnapshot = `${course?.id ?? ""}\0${result?.resolvedAsOfOid ?? ""}\0${asOfCommit}\0${blameSkip ? "1" : "0"}\0${effectiveBlameConfigSnapshot}`

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
    setBlamePartialAuthorLines(new Map())
    setBlameErrorMessage(null)
  }, [
    blameContextSnapshot,
    clearBlameFileResults,
    contextSnapshot,
    setBlameContextSnapshot,
    setBlameErrorMessage,
    setBlamePartialAuthorLines,
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
      setBlamePartialAuthorLines(new Map())
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
            onProgress: (p: AnalysisProgress) => {
              setBlameProgress(p)
              if (p.partialAuthorLines) {
                const next = new Map<string, number>()
                for (const entry of p.partialAuthorLines) {
                  next.set(entry.personId, entry.lines)
                }
                setBlamePartialAuthorLines(next)
              }
            },
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
      setBlamePartialAuthorLines,
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
