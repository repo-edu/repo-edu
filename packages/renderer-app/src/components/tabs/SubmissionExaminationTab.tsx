import {
  type ExaminationAttachedRosterIdentityInput,
  SUBMISSION_FILE_MAX_BYTES,
  SUBMISSION_SELECTION_MAX_BYTES,
  SUBMISSION_SELECTION_MAX_FILES,
} from "@repo-edu/application-contract"
import {
  DEFAULT_EXTENSIONS,
  normalizeExtension,
} from "@repo-edu/domain/analysis"
import {
  activeSurfaceRecentSubmission,
  activeSurfaceSubmissionStateKey,
  type SubmissionSurfaceState,
} from "@repo-edu/domain/settings"
import { courseHasRoster, type Roster } from "@repo-edu/domain/types"
import { Checkbox, Label } from "@repo-edu/ui"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useWorkflowClient } from "../../contexts/workflow-client.js"
import { selectActiveSurface } from "../../session/selectors.js"
import { useSessionControllerSelector } from "../../session/session-controller-context.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { formatTokenEstimate } from "../../utils/token-estimate.js"
import { SubmissionExaminationPane } from "./examination/SubmissionExaminationPane.js"
import type { SubmissionExaminationSource } from "./examination/source.js"
import { useExaminationEngine } from "./examination/use-examination-engine.js"

type FolderFile = {
  relativePath: string
  size: number
}

type FileListState =
  | { status: "loading"; files: []; error: null }
  | { status: "loaded"; files: FolderFile[]; error: null }
  | { status: "error"; files: []; error: string }

type PreparedSubmissionState =
  | { status: "idle"; pendingSourceKey: null; source: null; error: null }
  | { status: "loading"; pendingSourceKey: string; source: null; error: null }
  | {
      status: "loaded"
      pendingSourceKey: string
      source: SubmissionExaminationSource
      error: null
    }
  | { status: "error"; pendingSourceKey: string; source: null; error: string }

const EMPTY_SUBMISSION_STATE: SubmissionSurfaceState = {
  includedFiles: null,
}

function normalizeConfiguredExtensions(
  extensions: readonly string[],
): string[] {
  const normalized = [
    ...new Set(
      extensions
        .map((extension) => normalizeExtension(extension))
        .filter((extension) => extension.length > 0),
    ),
  ]
  return normalized.length === 0 ? [...DEFAULT_EXTENSIONS] : normalized
}

function isEligible(file: FolderFile): boolean {
  return file.size <= SUBMISSION_FILE_MAX_BYTES
}

function formatBytes(byteCount: number): string {
  if (byteCount < 1024) return `${byteCount} B`
  if (byteCount < 1024 * 1024) return `${Math.round(byteCount / 1024)} KiB`
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MiB`
}

function resolveEffectiveSelection(
  files: readonly FolderFile[],
  persisted: string[] | null,
): string[] {
  const eligible = files.filter(isEligible)
  if (persisted === null) {
    return eligible.map((file) => file.relativePath)
  }
  const persistedSet = new Set(persisted)
  return eligible
    .filter((file) => persistedSet.has(file.relativePath))
    .map((file) => file.relativePath)
}

function buildSelectionBlocker(params: {
  selectedCount: number
  selectedBytes: number
  isDefaultSelection: boolean
}): string | null {
  const prefix = params.isDefaultSelection
    ? "The default all-files selection is too large."
    : "The selected file set is too large."
  if (params.selectedCount > SUBMISSION_SELECTION_MAX_FILES) {
    return `${prefix} Select ${SUBMISSION_SELECTION_MAX_FILES} files or fewer.`
  }
  if (params.selectedBytes > SUBMISSION_SELECTION_MAX_BYTES) {
    return `${prefix} Select ${formatBytes(
      SUBMISSION_SELECTION_MAX_BYTES,
    )} or less.`
  }
  return null
}

function rosterIdentities(
  roster: Roster | null,
): ExaminationAttachedRosterIdentityInput[] {
  return [...(roster?.students ?? []), ...(roster?.staff ?? [])].map(
    (member) => ({
      name: member.name,
      email: member.email,
      id: member.id,
      lmsUserId: member.lmsUserId,
      studentNumber: member.studentNumber,
      gitUsername: member.gitUsername,
    }),
  )
}

export function SubmissionExaminationTab() {
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const recent = activeSurfaceRecentSubmission(activeSurface)
  const sourceViewModel = useSubmissionExaminationSource()

  if (activeSurface.kind !== "submission" || recent === null) {
    return null
  }

  const source = sourceViewModel.visiblePrepared.source
  if (source === null) {
    return (
      <SubmissionExaminationShell
        source={null}
        sidebarContent={sourceViewModel.sidebarContent}
        emptyMessage={sourceViewModel.placeholderMessage}
      />
    )
  }
  return (
    <SubmissionExaminationShell
      source={source}
      sidebarContent={sourceViewModel.sidebarContent}
      emptyMessage={sourceViewModel.placeholderMessage}
    />
  )
}

function SubmissionExaminationShell({
  source,
  sidebarContent,
  emptyMessage,
}: {
  source: SubmissionExaminationSource | null
  sidebarContent: ReactNode
  emptyMessage: string
}) {
  if (source === null) {
    return (
      <div className="h-full min-h-0 overflow-hidden p-6">
        <SubmissionExaminationPane
          sidebarContent={sidebarContent}
          connections={[]}
          activeConnection={null}
          selectedModelCode={null}
          onSelectConnection={() => undefined}
          onSelectModelCode={() => undefined}
          onOpenSettings={() => undefined}
          onImportArchive={() => undefined}
          onExportArchive={() => undefined}
          display={{
            entry: null,
            archiveEntry: null,
            displayEntry: null,
            isLoading: false,
            hasDisplayResults: false,
            hasPartialQuestions: false,
            canRegenerate: false,
            canToggleAnswers: false,
            canCopyMarkdown: false,
          }}
          archiveEntries={[]}
          showArchiveSelector={false}
          questionCount={4}
          showAnswers={true}
          blocker={emptyMessage}
          onQuestionCountChange={() => undefined}
          onShowAnswersChange={() => undefined}
          onSelectArchiveEntry={() => undefined}
          onGenerate={() => undefined}
          onStopGeneration={() => undefined}
          onRegenerate={() => undefined}
          onCopyMarkdown={() => undefined}
          emptyMessage={emptyMessage}
        />
      </div>
    )
  }

  return (
    <LoadedSubmissionExaminationShell
      source={source}
      sidebarContent={sidebarContent}
      emptyMessage={emptyMessage}
    />
  )
}

function LoadedSubmissionExaminationShell({
  source,
  sidebarContent,
  emptyMessage,
}: {
  source: SubmissionExaminationSource
  sidebarContent: ReactNode
  emptyMessage: string
}) {
  const engine = useExaminationEngine({
    source,
    emptyBlocker: emptyMessage,
  })
  return (
    <div className="h-full min-h-0 overflow-hidden p-6">
      <SubmissionExaminationPane
        sidebarContent={sidebarContent}
        connections={engine.connections}
        activeConnection={engine.activeConnection}
        selectedModelCode={engine.selectedModelCode}
        onSelectConnection={engine.commands.selectConnection}
        onSelectModelCode={engine.commands.selectModelCode}
        onOpenSettings={engine.commands.openLlmSettings}
        onImportArchive={engine.commands.importArchive}
        onExportArchive={engine.commands.exportArchive}
        display={engine.display}
        archiveEntries={engine.archiveEntries}
        showArchiveSelector={engine.showArchiveSelector}
        questionCount={engine.questionCount}
        showAnswers={engine.showAnswers}
        blocker={engine.blocker}
        onQuestionCountChange={engine.commands.changeQuestionCount}
        onShowAnswersChange={engine.commands.changeShowAnswers}
        onSelectArchiveEntry={engine.commands.selectArchiveEntry}
        onGenerate={engine.commands.generate}
        onStopGeneration={engine.commands.stopGeneration}
        onRegenerate={engine.commands.regenerate}
        onCopyMarkdown={engine.commands.copyMarkdown}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}

function useSubmissionExaminationSource() {
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const submissionFolderPath =
    activeSurface.kind === "submission" ? activeSurface.path : null
  const workflowClient = useWorkflowClient()
  const course = useCourseStore((state) => state.course)
  const settings = useAppSettingsStore((state) => state.settings)
  const setSubmissionSurfaceState = useAppSettingsStore(
    (state) => state.setSubmissionSurfaceState,
  )
  const [fileList, setFileList] = useState<FileListState>({
    status: "loading",
    files: [],
    error: null,
  })
  const [prepared, setPrepared] = useState<PreparedSubmissionState>({
    status: "idle",
    pendingSourceKey: null,
    source: null,
    error: null,
  })
  const [prepareAttempt, setPrepareAttempt] = useState(0)

  const stateKey = activeSurfaceSubmissionStateKey(activeSurface)
  const recent = activeSurfaceRecentSubmission(activeSurface)
  const submissionState =
    stateKey === null
      ? EMPTY_SUBMISSION_STATE
      : (settings.submissionSurfaceStates[stateKey] ?? EMPTY_SUBMISSION_STATE)
  const configuredExtensions = useMemo(
    () => normalizeConfiguredExtensions(settings.defaultExtensions),
    [settings.defaultExtensions],
  )
  const attachedCourseId =
    activeSurface.kind === "submission" ? activeSurface.courseId : undefined
  const attachedCourse =
    attachedCourseId !== undefined && course?.id === attachedCourseId
      ? course
      : null
  const identityBlocker =
    attachedCourseId !== undefined && attachedCourse === null
      ? "Loading the attached course before preparing redacted excerpts."
      : attachedCourse !== null && !courseHasRoster(attachedCourse)
        ? "The attached course no longer supports roster-backed submissions."
        : null
  const attachedRoster =
    attachedCourse !== null && courseHasRoster(attachedCourse)
      ? attachedCourse.roster
      : null

  useEffect(() => {
    if (submissionFolderPath === null) return
    const abort = new AbortController()
    setFileList({ status: "loading", files: [], error: null })
    workflowClient
      .run(
        "analysis.listFolderFiles",
        {
          folderPath: submissionFolderPath,
          extensions: configuredExtensions,
        },
        { signal: abort.signal },
      )
      .then((result) => {
        if (abort.signal.aborted) return
        setFileList({ status: "loaded", files: result.files, error: null })
      })
      .catch((error) => {
        if (abort.signal.aborted) return
        setFileList({
          status: "error",
          files: [],
          error: getErrorMessage(error),
        })
      })
    return () => abort.abort()
  }, [configuredExtensions, submissionFolderPath, workflowClient])

  const eligibleFiles = useMemo(
    () => fileList.files.filter(isEligible),
    [fileList.files],
  )
  const effectiveSelection = useMemo(
    () =>
      resolveEffectiveSelection(fileList.files, submissionState.includedFiles),
    [fileList.files, submissionState.includedFiles],
  )
  const selectedPathsKey = useMemo(
    () => JSON.stringify([...effectiveSelection].sort()),
    [effectiveSelection],
  )
  const pendingSourceKey = useMemo(() => {
    if (submissionFolderPath === null || effectiveSelection.length === 0) {
      return null
    }
    return JSON.stringify([
      "submission",
      submissionFolderPath,
      JSON.parse(selectedPathsKey) as string[],
    ])
  }, [effectiveSelection.length, selectedPathsKey, submissionFolderPath])
  const selectedSet = useMemo(
    () => new Set(effectiveSelection),
    [effectiveSelection],
  )
  const selectedTotalBytes = useMemo(
    () =>
      eligibleFiles
        .filter((file) => selectedSet.has(file.relativePath))
        .reduce((total, file) => total + file.size, 0),
    [eligibleFiles, selectedSet],
  )
  const selectionBlocker = useMemo(
    () =>
      buildSelectionBlocker({
        selectedCount: effectiveSelection.length,
        selectedBytes: selectedTotalBytes,
        isDefaultSelection: submissionState.includedFiles === null,
      }),
    [
      effectiveSelection.length,
      selectedTotalBytes,
      submissionState.includedFiles,
    ],
  )
  const prepareBlocker = identityBlocker ?? selectionBlocker

  useEffect(() => {
    if (
      submissionFolderPath === null ||
      fileList.status !== "loaded" ||
      effectiveSelection.length === 0 ||
      pendingSourceKey === null ||
      prepareBlocker !== null
    ) {
      setPrepared({
        status: "idle",
        pendingSourceKey: null,
        source: null,
        error: null,
      })
      return
    }

    void prepareAttempt
    const selectedRelativePaths = JSON.parse(selectedPathsKey) as string[]
    const abort = new AbortController()
    setPrepared({
      status: "loading",
      pendingSourceKey,
      source: null,
      error: null,
    })

    workflowClient
      .run(
        "examination.prepareSubmissionSource",
        {
          folderPath: submissionFolderPath,
          selectedRelativePaths,
          configuredExtensions,
          attachedRosterIdentities: rosterIdentities(attachedRoster),
        },
        {
          signal: abort.signal,
          onProgress: () => undefined,
        },
      )
      .then((result) => {
        if (abort.signal.aborted) return
        const lineCount = result.excerpts.reduce(
          (count, excerpt) => count + excerpt.lines.length,
          0,
        )
        setPrepared({
          status: "loaded",
          pendingSourceKey,
          error: null,
          source: {
            kind: "submission",
            folderPath: result.folderPath,
            contentScopeId: result.contentScopeId,
            subject: {
              id: result.personId,
              name: result.displayTitle,
              email: result.displaySubtitle,
              lines: lineCount,
              linesPercent: 100,
              excerpts: result.excerpts,
              excerptFileSources: result.excerptFileSources,
              excerptScopeId: result.contentScopeId,
            },
            localIdentityContext: result.localIdentityContext,
          },
        })
      })
      .catch((error) => {
        if (abort.signal.aborted) return
        setPrepared({
          status: "error",
          pendingSourceKey,
          source: null,
          error: getErrorMessage(error),
        })
      })

    return () => abort.abort()
  }, [
    attachedRoster,
    configuredExtensions,
    effectiveSelection.length,
    fileList.status,
    pendingSourceKey,
    prepareAttempt,
    prepareBlocker,
    selectedPathsKey,
    submissionFolderPath,
    workflowClient,
  ])

  const updateIncludedFiles = (next: string[] | null) => {
    if (recent === null) return
    setSubmissionSurfaceState(recent, { includedFiles: next })
  }

  const handleToggleFile = (relativePath: string) => {
    if (selectedSet.has(relativePath)) {
      const next = effectiveSelection.filter((path) => path !== relativePath)
      updateIncludedFiles(next)
    } else {
      const next = [...effectiveSelection, relativePath]
      updateIncludedFiles(next)
    }
  }

  const handleToggleMaster = () => {
    if (selectedSet.size === 0) {
      updateIncludedFiles(null)
    } else {
      updateIncludedFiles([])
    }
  }

  const masterState: boolean | "indeterminate" =
    eligibleFiles.length === 0
      ? false
      : selectedSet.size === 0
        ? false
        : selectedSet.size === eligibleFiles.length
          ? true
          : "indeterminate"

  const summaryEstimate =
    fileList.status === "loading"
      ? "Loading..."
      : fileList.status === "error"
        ? "Unavailable"
        : selectedSet.size === 0
          ? "Nothing selected"
          : `${selectedSet.size} file${
              selectedSet.size === 1 ? "" : "s"
            } · ${formatBytes(selectedTotalBytes)} · ~${formatTokenEstimate(
              selectedTotalBytes,
            )} tokens`
  const visiblePrepared =
    prepared.pendingSourceKey === pendingSourceKey
      ? prepared
      : ({
          status: "idle",
          pendingSourceKey: null,
          source: null,
          error: null,
        } satisfies PreparedSubmissionState)
  const isAwaitingPreparation =
    fileList.status === "loaded" &&
    pendingSourceKey !== null &&
    prepareBlocker === null &&
    visiblePrepared.status !== "loaded" &&
    visiblePrepared.status !== "error"
  const placeholderMessage =
    visiblePrepared.status === "loaded"
      ? "Click Generate to produce questions for this submission."
      : fileList.status === "loading"
        ? "Loading files..."
        : fileList.status === "error"
          ? "Fix the file loading error before preparing examination generation."
          : isAwaitingPreparation || visiblePrepared.status === "loading"
            ? "Preparing submission..."
            : (prepareBlocker ??
              "Select at least one file to open examination generation.")

  const sidebarContent = (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Submission</h2>
        <p className="break-all text-sm text-muted-foreground">
          {activeSurface.kind === "submission" ? activeSurface.path : ""}
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label className="flex items-center gap-2">
            <Checkbox
              checked={masterState}
              onCheckedChange={handleToggleMaster}
              disabled={
                fileList.status !== "loaded" || eligibleFiles.length === 0
              }
            />
            <span>Files</span>
          </Label>
          <span className="text-xs text-muted-foreground">
            {summaryEstimate}
          </span>
        </div>

        {fileList.status === "loading" ? (
          <p className="text-xs text-muted-foreground">Loading files...</p>
        ) : fileList.status === "error" ? (
          <p className="text-xs text-destructive">{fileList.error}</p>
        ) : fileList.files.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No files matched the configured extensions.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded border bg-muted/20 p-2">
            {fileList.files.map((file) => {
              const eligible = isEligible(file)
              const checked = eligible && selectedSet.has(file.relativePath)
              return (
                <li
                  key={file.relativePath}
                  className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-muted/40"
                >
                  <Label className="flex flex-1 items-center gap-2 truncate text-xs font-normal">
                    <Checkbox
                      checked={checked}
                      disabled={!eligible}
                      onCheckedChange={() =>
                        handleToggleFile(file.relativePath)
                      }
                    />
                    <span className="truncate">{file.relativePath}</span>
                  </Label>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {eligible
                      ? formatBytes(file.size)
                      : `${formatBytes(file.size)} · too large`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {prepareBlocker !== null ? (
          <p className="text-xs text-destructive">{prepareBlocker}</p>
        ) : null}
      </div>

      {isAwaitingPreparation || visiblePrepared.status === "loading" ? (
        <p className="text-xs text-muted-foreground">Preparing submission...</p>
      ) : visiblePrepared.status === "error" ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-destructive">{visiblePrepared.error}</p>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setPrepareAttempt((attempt) => attempt + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}
    </section>
  )

  return {
    visiblePrepared,
    sidebarContent,
    placeholderMessage,
  }
}
