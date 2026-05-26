import {
  buildSubmissionFolderContentScopeId,
  type ExaminationLocalIdentityContext,
  SUBMISSION_FILE_MAX_BYTES,
  SUBMISSION_FOLDER_PERSON_ID,
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
import {
  courseHasRoster,
  type Roster,
  type RosterMember,
} from "@repo-edu/domain/types"
import { Checkbox, Label } from "@repo-edu/ui"
import { useEffect, useMemo, useState } from "react"
import { useWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import { selectActiveSurface, useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { formatTokenEstimate } from "../../utils/token-estimate.js"
import {
  ExaminationTab,
  type SubmissionExaminationContext,
} from "./ExaminationTab.js"
import {
  buildSubmissionExcerpts,
  decodeSubmissionFileBytes,
} from "./examination/build-excerpts.js"

type FolderFile = {
  relativePath: string
  size: number
}

type FileListState =
  | { status: "loading"; files: []; error: null }
  | { status: "loaded"; files: FolderFile[]; error: null }
  | { status: "error"; files: []; error: string }

type PreparedSubmissionState =
  | { status: "idle"; pendingSourceKey: null; context: null; error: null }
  | { status: "loading"; pendingSourceKey: string; context: null; error: null }
  | {
      status: "loaded"
      pendingSourceKey: string
      context: SubmissionExaminationContext
      error: null
    }
  | { status: "error"; pendingSourceKey: string; context: null; error: string }

const EMPTY_SUBMISSION_STATE: SubmissionSurfaceState = {
  includedFiles: null,
}

const SUBMISSION_SELECTION_MAX_FILES = 50
const SUBMISSION_SELECTION_MAX_BYTES = 512 * 1024

const EMPTY_IDENTITY_CONTEXT: ExaminationLocalIdentityContext = {
  names: [],
  emails: [],
  opaqueIdentifiers: [],
  gitUsernames: [],
}

const GENERIC_FOLDER_LABELS = new Set([
  "code",
  "source",
  "src",
  "student",
  "submission",
  "submissions",
])

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

function folderBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "")
  const last = normalized.split("/").pop()
  return last && last.length > 0 ? last : path
}

function normalizeIdentityText(value: string): string {
  return value.trim().split(/\s+/).join(" ")
}

function containsAsciiLetter(value: string): boolean {
  return /[A-Za-z]/.test(value)
}

function pushNormalized(values: string[], value: string): void {
  const normalized = normalizeIdentityText(value)
  if (normalized.length > 0) {
    values.push(normalized)
  }
}

function dedupe(values: readonly string[], caseSensitive: boolean): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const key = caseSensitive ? value : value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function isEligible(file: FolderFile): boolean {
  return file.size <= SUBMISSION_FILE_MAX_BYTES
}

function formatBytes(byteCount: number): string {
  if (byteCount < 1024) return `${byteCount} B`
  if (byteCount < 1024 * 1024) return `${Math.round(byteCount / 1024)} KiB`
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MiB`
}

/**
 * Resolve the effective set of included relative paths from persisted state
 * plus the current folder listing. A `null` selection means "default" and
 * fans out to every eligible file. An explicit list is filtered down to
 * files that still exist and are eligible, so previously selected files
 * that were deleted or grew past the cap disappear silently rather than
 * blocking the run.
 */
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

function addRosterMemberIdentity(
  context: ExaminationLocalIdentityContext,
  member: RosterMember,
): void {
  pushNormalized(context.names, member.name)
  pushNormalized(context.emails, member.email)

  for (const value of [member.id, member.lmsUserId, member.studentNumber]) {
    if (value !== null && containsAsciiLetter(value)) {
      pushNormalized(context.opaqueIdentifiers, value)
    }
  }
  if (member.gitUsername !== null) {
    pushNormalized(context.gitUsernames, member.gitUsername)
  }
}

function addFolderLabelIdentity(
  context: ExaminationLocalIdentityContext,
  folderPath: string,
): void {
  const label = folderBasename(folderPath)
  const decoded = (() => {
    try {
      return decodeURIComponent(label)
    } catch (_error) {
      return label
    }
  })()
  const normalizedLabel = normalizeIdentityText(decoded)
  const spacedLabel = normalizeIdentityText(
    normalizedLabel.replace(/[-_.]+/g, " "),
  )
  const labelKey = spacedLabel.toLowerCase()
  if (
    !containsAsciiLetter(spacedLabel) ||
    GENERIC_FOLDER_LABELS.has(labelKey)
  ) {
    return
  }

  pushNormalized(context.opaqueIdentifiers, normalizedLabel)
  pushNormalized(context.gitUsernames, normalizedLabel)
  if (spacedLabel !== normalizedLabel) {
    pushNormalized(context.names, spacedLabel)
  } else if (/\s/.test(spacedLabel)) {
    pushNormalized(context.names, spacedLabel)
  }
}

function buildSubmissionLocalIdentityContext(params: {
  folderPath: string
  roster: Roster | null
}): ExaminationLocalIdentityContext {
  const context: ExaminationLocalIdentityContext = {
    names: [],
    emails: [],
    opaqueIdentifiers: [],
    gitUsernames: [],
  }
  for (const member of [
    ...(params.roster?.students ?? []),
    ...(params.roster?.staff ?? []),
  ]) {
    addRosterMemberIdentity(context, member)
  }
  addFolderLabelIdentity(context, params.folderPath)
  return {
    names: dedupe(context.names, false),
    emails: dedupe(context.emails, false),
    opaqueIdentifiers: dedupe(context.opaqueIdentifiers, true),
    gitUsernames: dedupe(context.gitUsernames, false),
  }
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

export function SubmissionAnalysisTab() {
  const activeSurface = useUiStore(selectActiveSurface)
  const submissionFolderPath =
    activeSurface.kind === "submission" ? activeSurface.path : null
  const workflowClient = useWorkflowClient()
  const course = useCourseStore((state) => state.course)
  const settings = useAppSettingsStore((state) => state.settings)
  const setSubmissionSurfaceState = useAppSettingsStore(
    (state) => state.setSubmissionSurfaceState,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const [fileList, setFileList] = useState<FileListState>({
    status: "loading",
    files: [],
    error: null,
  })
  const [prepared, setPrepared] = useState<PreparedSubmissionState>({
    status: "idle",
    pendingSourceKey: null,
    context: null,
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
  const localIdentityContext = useMemo(
    () =>
      submissionFolderPath !== null
        ? buildSubmissionLocalIdentityContext({
            folderPath: submissionFolderPath,
            roster: attachedRoster,
          })
        : EMPTY_IDENTITY_CONTEXT,
    [attachedRoster, submissionFolderPath],
  )

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
        context: null,
        error: null,
      })
      return
    }

    void prepareAttempt
    const selectedPaths = JSON.parse(selectedPathsKey) as string[]
    const abort = new AbortController()
    setPrepared({
      status: "loading",
      pendingSourceKey,
      context: null,
      error: null,
    })

    const folderPath = submissionFolderPath

    Promise.all(
      selectedPaths.map((relativePath) =>
        workflowClient
          .run(
            "analysis.readFolderFile",
            { folderPath, relativePath },
            { signal: abort.signal },
          )
          .then((result) => {
            const decoded = decodeSubmissionFileBytes(result)
            return {
              relativePath: result.relativePath,
              bytes: decoded.bytes,
              decodedText: decoded.decodedText,
            }
          }),
      ),
    )
      .then((files) => {
        if (abort.signal.aborted) return
        const contentScopeId = buildSubmissionFolderContentScopeId(files)
        const excerpts = files.flatMap((file) =>
          buildSubmissionExcerpts(file.relativePath, file.decodedText),
        )
        const excerptFileSources: Record<string, string> = {}
        for (const file of files) {
          excerptFileSources[file.relativePath] = file.decodedText
        }
        const totalChars = files.reduce(
          (total, file) => total + file.decodedText.length,
          0,
        )
        const totalBytes = files.reduce(
          (total, file) => total + file.bytes.byteLength,
          0,
        )
        const subtitle = `${files.length} file${
          files.length === 1 ? "" : "s"
        } · ${formatBytes(totalBytes)} · ~${formatTokenEstimate(totalChars)} tokens`
        setPrepared({
          status: "loaded",
          pendingSourceKey,
          error: null,
          context: {
            pendingSourceKey,
            personId: SUBMISSION_FOLDER_PERSON_ID,
            displayTitle: folderBasename(folderPath),
            displaySubtitle: subtitle,
            contentScopeId,
            localIdentityContext,
            excerpts,
            excerptFileSources,
          },
        })
      })
      .catch((error) => {
        if (abort.signal.aborted) return
        setPrepared({
          status: "error",
          pendingSourceKey,
          context: null,
          error: getErrorMessage(error),
        })
      })

    return () => abort.abort()
  }, [
    effectiveSelection.length,
    fileList.status,
    localIdentityContext,
    pendingSourceKey,
    prepareAttempt,
    prepareBlocker,
    selectedPathsKey,
    submissionFolderPath,
    workflowClient,
  ])

  if (activeSurface.kind !== "submission" || recent === null) {
    return null
  }

  const updateIncludedFiles = (next: string[] | null) => {
    setSubmissionSurfaceState(recent, { includedFiles: next })
    void saveAppSettings()
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
          context: null,
          error: null,
        } satisfies PreparedSubmissionState)
  const isAwaitingPreparation =
    fileList.status === "loaded" &&
    pendingSourceKey !== null &&
    prepareBlocker === null &&
    visiblePrepared.status !== "loaded" &&
    visiblePrepared.status !== "error"
  const examinationPlaceholderMessage =
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
          {activeSurface.path}
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

  return (
    <ExaminationTab
      submissionContext={visiblePrepared.context}
      submissionSidebarContent={sidebarContent}
      submissionPlaceholderMessage={examinationPlaceholderMessage}
    />
  )
}
