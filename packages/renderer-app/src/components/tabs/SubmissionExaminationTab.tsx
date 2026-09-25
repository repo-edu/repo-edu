import {
  type ExaminationAttachedRosterIdentityInput,
  type ExaminationPrepareSubmissionSourceInput,
  SUBMISSION_FILE_MAX_BYTES,
  SUBMISSION_SELECTION_MAX_BYTES,
  SUBMISSION_SELECTION_MAX_FILES,
} from "@repo-edu/application-contract"
import {
  activeSurfaceRecentSubmission,
  activeSurfaceSubmissionStateKey,
} from "@repo-edu/domain/active-surface"
import type { SubmissionSurfaceState } from "@repo-edu/domain/settings"
import { courseHasRoster, type Roster } from "@repo-edu/domain/types"
import { Button, Checkbox, Label } from "@repo-edu/ui"
import { useMemo } from "react"
import { useWorkflowClient } from "../../contexts/workflow-client.js"
import {
  selectActiveSurface,
  selectDefaultExtensions,
  selectSubmissionSurfaceStates,
} from "../../session/selectors.js"
import {
  useSessionController,
  useSessionControllerSelector,
} from "../../session/session-controller-context.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../../session/session-start.js"
import { useCourseStore } from "../../stores/course-store.js"
import { useExaminationStore } from "../../stores/examination-store.js"
import type {
  SubmissionFileList,
  SubmissionFolderFile,
} from "../../stores/examination-store-types.js"
import { formatTokenEstimate } from "../../utils/token-estimate.js"
import { SubmissionExaminationPane } from "./examination/SubmissionExaminationPane.js"
import {
  listSubmissionFiles,
  normalizeConfiguredExtensions,
} from "./examination/submission-file-listing.js"
import { submissionPreparationKey } from "./examination/submission-source-preparation.js"
import { useExaminationEngine } from "./examination/use-examination-engine.js"

const EMPTY_FILE_LIST: SubmissionFileList = {
  status: "idle",
  files: [],
  error: null,
}

const EMPTY_SUBMISSION_STATE: SubmissionSurfaceState = {
  includedFiles: null,
}

function isEligible(file: SubmissionFolderFile): boolean {
  return file.size <= SUBMISSION_FILE_MAX_BYTES
}

function formatBytes(byteCount: number): string {
  if (byteCount < 1024) return `${byteCount} B`
  if (byteCount < 1024 * 1024) return `${Math.round(byteCount / 1024)} KiB`
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MiB`
}

function resolveEffectiveSelection(
  files: readonly SubmissionFolderFile[],
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

  return <SubmissionExaminationShell sourceViewModel={sourceViewModel} />
}

function SubmissionExaminationShell({
  sourceViewModel,
}: {
  sourceViewModel: ReturnType<typeof useSubmissionExaminationSource>
}) {
  const engine = useExaminationEngine({
    source: sourceViewModel.source,
    submissionInput: sourceViewModel.preparationInput,
    emptyBlocker: sourceViewModel.blocker,
  })
  return (
    <div className="h-full min-h-0 overflow-hidden p-6">
      <SubmissionExaminationPane
        sidebarContent={sourceViewModel.sidebarContent}
        engine={engine}
        emptyMessage={sourceViewModel.placeholderMessage}
      />
    </div>
  )
}

function useSubmissionExaminationSource() {
  const controller = useSessionController()
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const submissionFolderPath =
    activeSurface.kind === "submission" ? activeSurface.path : null
  const workflowClient = useWorkflowClient()
  const course = useCourseStore((state) => state.course)
  const submissionSurfaceStates = useSessionControllerSelector(
    selectSubmissionSurfaceStates,
  )
  const fileList = useExaminationStore((state) =>
    submissionFolderPath === null
      ? EMPTY_FILE_LIST
      : (state.submissionFileLists.get(submissionFolderPath) ??
        EMPTY_FILE_LIST),
  )
  const stateKey = activeSurfaceSubmissionStateKey(activeSurface)
  const recent = activeSurfaceRecentSubmission(activeSurface)
  const submissionState =
    stateKey === null
      ? EMPTY_SUBMISSION_STATE
      : (submissionSurfaceStates[stateKey] ?? EMPTY_SUBMISSION_STATE)
  const configuredExtensions =
    fileList.status === "loaded" ? fileList.extensions : null
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

  // Each request keeps its extensions with the files. Settings edits do not
  // replace that input while the teacher is choosing files or editing settings.
  const refreshFiles = useMemo(
    () =>
      bindSessionStart("submissionRefresh", (start: SessionStart) => {
        if (submissionFolderPath === null) return
        const extensions = normalizeConfiguredExtensions(
          selectDefaultExtensions(controller.getSnapshot()),
        )
        void workflowClient.execute(
          start,
          "analysis.listFolderFiles",
          async (scope) => {
            await listSubmissionFiles(scope, submissionFolderPath, extensions)
          },
        )
      }),
    [controller, submissionFolderPath, workflowClient],
  )

  const eligibleFiles = useMemo(
    () => fileList.files.filter(isEligible),
    [fileList.files],
  )
  const effectiveSelection = useMemo(
    () =>
      resolveEffectiveSelection(fileList.files, submissionState.includedFiles),
    [fileList.files, submissionState.includedFiles],
  )
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

  const preparationInput =
    useMemo<ExaminationPrepareSubmissionSourceInput | null>(
      () =>
        submissionFolderPath === null ||
        fileList.status !== "loaded" ||
        configuredExtensions === null ||
        effectiveSelection.length === 0 ||
        prepareBlocker !== null
          ? null
          : {
              folderPath: submissionFolderPath,
              selectedRelativePaths: effectiveSelection,
              configuredExtensions,
              attachedRosterIdentities: rosterIdentities(attachedRoster),
            },
      [
        submissionFolderPath,
        fileList.status,
        configuredExtensions,
        effectiveSelection,
        prepareBlocker,
        attachedRoster,
      ],
    )
  const preparationKey =
    preparationInput === null
      ? null
      : submissionPreparationKey(preparationInput)
  const source = useExaminationStore((state) =>
    preparationKey === null
      ? null
      : (state.preparedSubmissionSources.get(preparationKey) ?? null),
  )

  const updateIncludedFiles = (next: string[] | null) => {
    if (recent === null) return
    controller.setSubmissionSurfaceState(recent, { includedFiles: next })
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
    fileList.status === "idle"
      ? "Press Refresh to list files."
      : fileList.status === "loading"
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
  const blocker =
    fileList.status === "idle"
      ? "Press Refresh to list submission files."
      : fileList.status === "loading"
        ? "Loading files..."
        : fileList.status === "error"
          ? "Press Refresh to retry the file listing."
          : (prepareBlocker ??
            (effectiveSelection.length === 0
              ? "Select at least one file."
              : null))
  const placeholderMessage =
    blocker ??
    "Press Load questions to find saved questions or Generate questions to create them."

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
          <Button variant="outline" size="sm" onClick={refreshFiles}>
            Refresh
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">{summaryEstimate}</span>

        {fileList.status === "idle" ? (
          <p className="text-xs text-muted-foreground">
            Press Refresh to list submission files.
          </p>
        ) : fileList.status === "loading" ? (
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
    </section>
  )

  return {
    source,
    preparationInput,
    blocker,
    sidebarContent,
    placeholderMessage,
  }
}
