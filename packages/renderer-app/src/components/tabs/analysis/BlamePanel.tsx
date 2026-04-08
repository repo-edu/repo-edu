import type { AnalysisProgress } from "@repo-edu/application-contract"
import type { BlameResult } from "@repo-edu/domain/analysis"
import {
  Button,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { Loader2, Plus, Trash2, X } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useWorkflowClient } from "../../../contexts/workflow-client.js"
import {
  buildEffectiveBlameWorkflowConfig,
  useAnalysisStore,
} from "../../../stores/analysis-store.js"
import { useCourseStore } from "../../../stores/course-store.js"
import { BlameFilePickerDialog } from "./BlameFilePickerDialog.js"
import { BlameTab } from "./BlameTab.js"

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(i + 1) : path
}

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

  const setActiveBlameFile = useAnalysisStore((s) => s.setActiveBlameFile)
  const closeBlameTargetFile = useAnalysisStore((s) => s.closeBlameTargetFile)
  const clearBlameTargetFiles = useAnalysisStore((s) => s.clearBlameTargetFiles)
  const setBlameResult = useAnalysisStore((s) => s.setBlameResult)
  const setBlameFileResult = useAnalysisStore((s) => s.setBlameFileResult)
  const setBlameWorkflowStatus = useAnalysisStore(
    (s) => s.setBlameWorkflowStatus,
  )
  const setBlameProgress = useAnalysisStore((s) => s.setBlameProgress)
  const setBlameErrorMessage = useAnalysisStore((s) => s.setBlameErrorMessage)

  const selectedRepoPath = useAnalysisStore((s) => s.selectedRepoPath)
  const config = useAnalysisStore((s) => s.config)
  const blameSkip = useAnalysisStore((s) => s.config.blameSkip ?? false)
  const blameConfig = useAnalysisStore((s) => s.blameConfig)
  const asOfCommit = useAnalysisStore((s) => s.asOfCommit)
  const effectiveBlameConfig = useMemo(
    () => buildEffectiveBlameWorkflowConfig(config, blameConfig),
    [config, blameConfig],
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const contextVersionRef = useRef(0)
  const contextSnapshotRef = useRef("")
  const contextSnapshot = `${course?.id ?? ""}\0${selectedRepoPath ?? ""}\0${result?.resolvedAsOfOid ?? ""}\0${blameSkip ? "1" : "0"}`

  useEffect(() => {
    if (contextSnapshotRef.current === contextSnapshot) {
      return
    }
    contextSnapshotRef.current = contextSnapshot
    contextVersionRef.current += 1
    const hadInFlightRun = abortRef.current !== null
    abortRef.current?.abort()
    abortRef.current = null
    if (hadInFlightRun) {
      setBlameWorkflowStatus("idle")
      setBlameProgress(null)
    }
  })

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
            repositoryRelativePath: selectedRepoPath,
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

  const handleCloseFile = useCallback(
    (path: string) => {
      abortRef.current?.abort()
      closeBlameTargetFile(path)
    },
    [closeBlameTargetFile],
  )

  const handleCloseAll = useCallback(() => {
    abortRef.current?.abort()
    clearBlameTargetFiles()
  }, [clearBlameTargetFiles])

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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <EmptyState message="Click a file in the Files tab to start blame analysis." />
        {result && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="mr-1 size-4" />
            Add Files
          </Button>
        )}
        <BlameFilePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </div>
    )
  }

  const isRunning = blameWorkflowStatus === "running"

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b px-2 py-1 overflow-x-auto">
        {blameTargetFiles.map((path) => {
          const isActive = path === activeBlameFile
          const entry = blameFileResults.get(path)
          const isLoading = !entry || entry.status === "pending"
          return (
            <div key={path} className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setActiveBlameFile(path)}
                  >
                    {isLoading && (
                      <Loader2 className="size-3 animate-spin shrink-0" />
                    )}
                    <span className="truncate max-w-32">{basename(path)}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{path}</TooltipContent>
              </Tooltip>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted-foreground/20"
                onClick={() => handleCloseFile(path)}
                aria-label={`Close ${path}`}
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={handleCloseAll}
          >
            <Trash2 className="mr-1 size-3.5" />
            Close All
          </Button>
        </div>
      </div>

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
            <EmptyState message="Select a file tab above." />
          </div>
        )}
      </div>

      <BlameFilePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </div>
  )
}
