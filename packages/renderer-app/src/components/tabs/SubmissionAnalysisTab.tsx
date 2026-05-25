import {
  buildExaminationLocalIdentityContext,
  buildSubmissionContentScopeId,
} from "@repo-edu/application-contract"
import {
  buildSubmissionPersonDbSnapshot,
  DEFAULT_EXTENSIONS,
  normalizeExtension,
  type ResolvedSubmissionIdentity,
} from "@repo-edu/domain/analysis"
import {
  activeSurfaceRecentSubmission,
  activeSurfaceSubmissionStateKey,
  type SubmissionStudentIdentity,
  type SubmissionSurfaceState,
} from "@repo-edu/domain/settings"
import type { Roster, RosterMember } from "@repo-edu/domain/types"
import { isValidEmail } from "@repo-edu/domain/validation"
import {
  Button,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import { useEffect, useMemo, useState } from "react"
import { useWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useCourseStore } from "../../stores/course-store.js"
import { selectActiveSurface, useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import {
  ExaminationTab,
  type SubmissionExaminationContext,
} from "./ExaminationTab.js"
import {
  buildSubmissionExcerpts,
  decodeSubmissionFileBytes,
} from "./examination/build-excerpts.js"

const NO_FILE_VALUE = "__none__"
const NO_MEMBER_VALUE = "__none__"

type FileListState =
  | { status: "loading"; files: []; error: null }
  | {
      status: "loaded"
      files: { relativePath: string; size: number }[]
      error: null
    }
  | { status: "error"; files: []; error: string }

type PreparedSubmissionState =
  | { status: "idle"; context: null; error: null }
  | { status: "loading"; context: null; error: null }
  | { status: "loaded"; context: SubmissionExaminationContext; error: null }
  | { status: "error"; context: null; error: string }

const EMPTY_SUBMISSION_STATE: SubmissionSurfaceState = {
  mainFileRelativePath: null,
  studentIdentity: null,
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

function allRosterMembers(roster: Roster): RosterMember[] {
  return [...roster.students, ...roster.staff]
}

function selectedMemberRoster(roster: Roster, member: RosterMember): Roster {
  const isStudent = roster.students.some(
    (candidate) => candidate.id === member.id,
  )
  return {
    ...roster,
    students: isStudent ? [member] : [],
    staff: isStudent ? [] : [member],
    groups: [],
    groupSets: [],
    assignments: [],
  }
}

function resolveSubmissionIdentity(params: {
  courseId?: string
  courseRoster: Roster | null
  studentIdentity: SubmissionStudentIdentity | null
}): { identity: ResolvedSubmissionIdentity | null; message: string | null } {
  if (params.courseId !== undefined) {
    if (params.courseRoster === null) {
      return {
        identity: null,
        message: "Load the attached course before choosing a roster member.",
      }
    }
    if (params.studentIdentity?.kind !== "roster-member") {
      return { identity: null, message: "Choose the submitted student." }
    }
    const memberId = params.studentIdentity.memberId
    const member =
      allRosterMembers(params.courseRoster).find(
        (candidate) => candidate.id === memberId,
      ) ?? null
    if (member === null) {
      return {
        identity: null,
        message: "The saved roster member no longer exists in this course.",
      }
    }
    return {
      identity: { kind: "roster-member", courseId: params.courseId, member },
      message: null,
    }
  }

  if (params.studentIdentity?.kind !== "one-off") {
    return {
      identity: null,
      message: "Enter the submitted student's identity.",
    }
  }
  const trimmedName = params.studentIdentity.name.trim()
  const trimmedLowercaseEmail = params.studentIdentity.email
    .trim()
    .toLowerCase()
  if (trimmedName.length === 0 || trimmedLowercaseEmail.length === 0) {
    return { identity: null, message: "Name and email are required." }
  }
  if (!isValidEmail(trimmedLowercaseEmail)) {
    return { identity: null, message: "Enter a valid email address." }
  }
  return {
    identity: { kind: "one-off", trimmedName, trimmedLowercaseEmail },
    message: null,
  }
}

export function SubmissionAnalysisTab() {
  const activeSurface = useUiStore(selectActiveSurface)
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
  const courseRoster = attachedCourse?.roster ?? null
  const resolved = useMemo(
    () =>
      resolveSubmissionIdentity({
        courseId: attachedCourseId,
        courseRoster,
        studentIdentity: submissionState.studentIdentity,
      }),
    [attachedCourseId, courseRoster, submissionState.studentIdentity],
  )

  useEffect(() => {
    if (activeSurface.kind !== "submission") return
    const abort = new AbortController()
    setFileList({ status: "loading", files: [], error: null })
    workflowClient
      .run(
        "analysis.listFolderFiles",
        {
          folderPath: activeSurface.path,
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
  }, [activeSurface, configuredExtensions, workflowClient])

  useEffect(() => {
    if (
      activeSurface.kind !== "submission" ||
      submissionState.mainFileRelativePath === null ||
      resolved.identity === null
    ) {
      setPrepared({ status: "idle", context: null, error: null })
      return
    }

    // Retry increments only exist to re-run this effect after transient read errors.
    void prepareAttempt
    const identity = resolved.identity
    const abort = new AbortController()
    setPrepared({ status: "loading", context: null, error: null })
    workflowClient
      .run(
        "analysis.readFolderFile",
        {
          folderPath: activeSurface.path,
          relativePath: submissionState.mainFileRelativePath,
        },
        { signal: abort.signal },
      )
      .then((result) => {
        if (abort.signal.aborted) return
        const decoded = decodeSubmissionFileBytes(result)
        const excerpts = buildSubmissionExcerpts(
          result.relativePath,
          decoded.decodedText,
        )
        const personDb = buildSubmissionPersonDbSnapshot(identity)
        const roster =
          identity.kind === "roster-member" && courseRoster !== null
            ? selectedMemberRoster(courseRoster, identity.member)
            : null
        const localIdentityContext = buildExaminationLocalIdentityContext({
          personDb,
          roster,
        })
        setPrepared({
          status: "loaded",
          error: null,
          context: {
            pendingSourceKey: `submission:${activeSurface.path}\u001f${result.relativePath}`,
            personId: personDb.persons[0]?.id ?? "",
            studentName: personDb.persons[0]?.canonicalName ?? "",
            studentEmail: personDb.persons[0]?.canonicalEmail ?? "",
            contentScopeId: buildSubmissionContentScopeId(decoded.bytes),
            localIdentityContext,
            excerpts,
            excerptFileSources: {
              [result.relativePath]: decoded.decodedText,
            },
          },
        })
      })
      .catch((error) => {
        if (abort.signal.aborted) return
        setPrepared({
          status: "error",
          context: null,
          error: getErrorMessage(error),
        })
      })
    return () => abort.abort()
  }, [
    activeSurface,
    courseRoster,
    prepareAttempt,
    resolved.identity,
    submissionState.mainFileRelativePath,
    workflowClient,
  ])

  if (activeSurface.kind !== "submission" || recent === null) {
    return null
  }

  const updateSubmissionState = (patch: Partial<SubmissionSurfaceState>) => {
    setSubmissionSurfaceState(recent, {
      ...submissionState,
      ...patch,
    })
    void saveAppSettings()
  }

  const updateOneOffIdentity = (
    patch: Partial<{ name: string; email: string }>,
  ) => {
    const current =
      submissionState.studentIdentity?.kind === "one-off"
        ? submissionState.studentIdentity
        : { kind: "one-off" as const, name: "", email: "" }
    updateSubmissionState({
      studentIdentity: {
        ...current,
        ...patch,
      },
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className="grid gap-4 rounded border p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Submission</h2>
          <p className="text-sm text-muted-foreground">{activeSurface.path}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="submission-main-file">Main file</Label>
            <Select
              value={submissionState.mainFileRelativePath ?? NO_FILE_VALUE}
              onValueChange={(value) =>
                updateSubmissionState({
                  mainFileRelativePath: value === NO_FILE_VALUE ? null : value,
                })
              }
              disabled={fileList.status !== "loaded"}
            >
              <SelectTrigger id="submission-main-file">
                <SelectValue placeholder="Choose a file" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FILE_VALUE}>Choose a file</SelectItem>
                {fileList.files.map((file) => (
                  <SelectItem key={file.relativePath} value={file.relativePath}>
                    {file.relativePath}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fileList.status === "loading" ? (
              <p className="text-xs text-muted-foreground">Loading files...</p>
            ) : fileList.status === "error" ? (
              <p className="text-xs text-destructive">{fileList.error}</p>
            ) : null}
          </div>

          {attachedCourseId !== undefined ? (
            <div className="grid gap-1">
              <Label htmlFor="submission-roster-member">Student</Label>
              <Select
                value={
                  submissionState.studentIdentity?.kind === "roster-member"
                    ? submissionState.studentIdentity.memberId
                    : NO_MEMBER_VALUE
                }
                onValueChange={(value) =>
                  updateSubmissionState({
                    studentIdentity:
                      value === NO_MEMBER_VALUE
                        ? null
                        : { kind: "roster-member", memberId: value },
                  })
                }
                disabled={courseRoster === null}
              >
                <SelectTrigger id="submission-roster-member">
                  <SelectValue placeholder="Choose a student" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MEMBER_VALUE}>
                    Choose a student
                  </SelectItem>
                  {(courseRoster === null
                    ? []
                    : allRosterMembers(courseRoster)
                  ).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {resolved.message !== null ? (
                <p className="text-xs text-muted-foreground">
                  {resolved.message}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid gap-1">
                <Label htmlFor="submission-student-name">Student name</Label>
                <Input
                  id="submission-student-name"
                  value={
                    submissionState.studentIdentity?.kind === "one-off"
                      ? submissionState.studentIdentity.name
                      : ""
                  }
                  onChange={(event) =>
                    updateOneOffIdentity({ name: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="submission-student-email">Student email</Label>
                <Input
                  id="submission-student-email"
                  type="email"
                  value={
                    submissionState.studentIdentity?.kind === "one-off"
                      ? submissionState.studentIdentity.email
                      : ""
                  }
                  onChange={(event) =>
                    updateOneOffIdentity({ email: event.target.value })
                  }
                />
                {resolved.message !== null ? (
                  <p className="text-xs text-muted-foreground">
                    {resolved.message}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {prepared.status === "loading" ? (
          <p className="text-xs text-muted-foreground">
            Preparing submission...
          </p>
        ) : prepared.status === "error" ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-destructive">{prepared.error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrepareAttempt((attempt) => attempt + 1)}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {prepared.context === null ? (
          <EmptyState message="Choose a main file and student identity to open examination generation." />
        ) : (
          <ExaminationTab submissionContext={prepared.context} />
        )}
      </div>
    </div>
  )
}
