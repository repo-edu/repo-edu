import type { LmsCourseSummary } from "@repo-edu/application-contract"
import {
  type CourseBacking,
  createBlankCourse,
  type PersistedCourse,
} from "@repo-edu/domain/types"
import {
  Alert,
  AlertDescription,
  Button,
  FormField,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@repo-edu/ui"
import { AlertTriangle, Loader2, Search } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { useCourses } from "../hooks/use-courses.js"
import { selectCourses, selectCredentials } from "../session/selectors.js"
import { useSessionControllerSelector } from "../session/session-controller-context.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../session/session-start.js"
import { useGroupsViewStore } from "../stores/groups-view-store.js"
import { useSettingsViewStore } from "../stores/settings-view-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { SourceActionCard } from "./SourceActionCard.js"
import { lmsConnectionDisplayName } from "./settings/ConnectionsPane.shared.js"

const NONE_VALUE = "__none__"
type CourseFetchStatus = "idle" | "loading" | "loaded" | "error"

export function createNewCourseDraft(input: {
  id: string
  updatedAt: string
  backing: CourseBacking
  displayName: string
  selectedLmsConnectionId: string
  selectedCourseId: string
}): PersistedCourse {
  return createBlankCourse(input.id, input.updatedAt, {
    backing: input.backing,
    displayName: input.displayName,
    lmsConnectionId:
      input.backing === "lms" ? input.selectedLmsConnectionId || null : null,
    lmsCourseId:
      input.backing === "lms" ? input.selectedCourseId.trim() || null : null,
  })
}

/** The two Home cards that set up a course, from the LMS or from a RepoBee
 * student list. They share one course name. */
export function CourseSetupForm() {
  const existingCourses = useSessionControllerSelector(selectCourses)
  const openSettings = useSettingsViewStore((state) => state.openSettings)
  const setRosterSyncDialogOpen = useGroupsViewStore(
    (state) => state.setRosterSyncDialogOpen,
  )
  const credentials = useSessionControllerSelector(selectCredentials)
  const workflowClient = useWorkflowClient()
  const { createCourse } = useCourses()

  const lmsConnections = credentials.lmsConnections

  const [source, setSource] = useState<CourseBacking | null>(null)
  const [courseName, setCourseName] = useState("")
  const [courseSearch, setCourseSearch] = useState("")
  const [courses, setCourses] = useState<LmsCourseSummary[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState("")
  const [courseFetchStatus, setCourseFetchStatus] =
    useState<CourseFetchStatus>("idle")
  const [courseFetchError, setCourseFetchError] = useState<string | null>(null)
  const [selectedLmsConnectionId, setSelectedLmsConnectionId] =
    useState<string>(lmsConnections[0]?.id ?? "")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedLmsDraft = useMemo(
    () =>
      lmsConnections.find(
        (connection) => connection.id === selectedLmsConnectionId,
      ) ?? null,
    [lmsConnections, selectedLmsConnectionId],
  )

  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase()
    if (query.length === 0) {
      return courses
    }

    return courses.filter(
      (course) =>
        course.name.toLowerCase().includes(query) ||
        course.id.toLowerCase().includes(query) ||
        (course.code ?? "").toLowerCase().includes(query),
    )
  }, [courseSearch, courses])

  const isCourseNameTaken = useMemo(() => {
    if (creating || source === null) return false
    const normalized = courseName.trim().toLowerCase()
    if (normalized.length === 0) {
      return false
    }

    return existingCourses.some(
      (course) => course.displayName.trim().toLowerCase() === normalized,
    )
  }, [creating, existingCourses, courseName, source])

  const loadLmsCourses = useCallback(() => {
    if (!selectedLmsDraft) {
      setCourses([])
      setSelectedCourseId("")
      setCourseSearch("")
      setCourseFetchStatus("idle")
      setCourseFetchError(null)
      return () => undefined
    }

    let cancelled = false
    setCourseFetchStatus("loading")
    setCourseFetchError(null)

    workflowClient
      .presentation("connection.listLmsCoursesDraft", {
        provider: selectedLmsDraft.provider,
        baseUrl: selectedLmsDraft.baseUrl,
        token: selectedLmsDraft.token,
        userAgent: selectedLmsDraft.userAgent,
      })
      .then((fetchedCourses) => {
        if (cancelled) {
          return
        }

        setCourses(fetchedCourses)
        setCourseSearch("")
        setCourseFetchStatus("loaded")
        setSelectedCourseId((current) =>
          fetchedCourses.some((course) => course.id === current) ? current : "",
        )
      })
      .catch((cause) => {
        if (cancelled) {
          return
        }

        const message = getErrorMessage(cause)
        setCourses([])
        setSelectedCourseId("")
        setCourseFetchStatus("error")
        setCourseFetchError(message)
      })

    return () => {
      cancelled = true
    }
  }, [selectedLmsDraft, workflowClient])

  const canCommitCourse = useMemo(() => {
    if (creating || source === null) return false
    if (courseName.trim().length === 0 || isCourseNameTaken) return false
    if (source === "lms") {
      if (lmsConnections.length === 0) return false
      return (
        selectedLmsConnectionId.trim().length > 0 &&
        selectedCourseId.trim().length > 0
      )
    }
    return true
  }, [
    courseName,
    creating,
    isCourseNameTaken,
    source,
    lmsConnections.length,
    selectedLmsConnectionId,
    selectedCourseId,
  ])

  useEffect(() => {
    if (source !== "lms") {
      return
    }

    return loadLmsCourses()
  }, [source, loadLmsCourses])

  const handleCreateCourse = bindSessionStart(
    "courseNew",
    async (start: SessionStart) => {
      if (source === null) return
      if (isCourseNameTaken) {
        setError("A course with this name already exists.")
        return
      }

      setCreating(true)
      setError(null)

      try {
        const saved = await createCourse(start, {
          backing: source,
          displayName: courseName.trim(),
          lmsConnectionId:
            source === "lms" ? selectedLmsConnectionId || null : null,
          lmsCourseId:
            source === "lms" ? selectedCourseId.trim() || null : null,
        })

        if (saved === null) {
          setError("Failed to create course.")
          return
        }

        if (
          saved.backing === "lms" &&
          saved.lmsConnectionId !== null &&
          (saved.lmsCourseId ?? "").trim().length > 0
        ) {
          setRosterSyncDialogOpen(true)
        }
      } catch (cause) {
        const message = getErrorMessage(cause)
        setError(message)
      } finally {
        setCreating(false)
      }
    },
  )

  const handleSelectOrCommit = async (target: CourseBacking) => {
    if (source !== target) {
      setSource(target)
      setError(null)
      return
    }
    if (canCommitCourse) {
      await handleCreateCourse()
    }
  }

  const handleCourseNameKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter" && canCommitCourse) {
      event.preventDefault()
      void handleCreateCourse()
    }
  }

  return (
    <>
      <SourceActionCard
        title="Set up a course from your LMS"
        description={
          <>
            Pulls roster, groups and repos from your Learning Management System
            (LMS), such as Canvas or Moodle. Use this for any course (current or
            past term) where the LMS holds the authoritative roster.
          </>
        }
        selected={source === "lms"}
        onClick={() => void handleSelectOrCommit("lms")}
      >
        <FormField label="Course name" htmlFor="new-course-name-lms">
          <Input
            id="new-course-name-lms"
            placeholder="e.g., Software Engineering 2026"
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            onKeyDown={handleCourseNameKeyDown}
            autoFocus
          />
          {isCourseNameTaken && (
            <Text className="text-sm text-destructive mt-1">
              A course with this name already exists.
            </Text>
          )}
        </FormField>

        {lmsConnections.length === 0 ? (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription>
              <Text>
                No Learning Management System connections configured. Add a
                Canvas or Moodle connection in Settings to import a course and
                roster.
              </Text>
              <div className="mt-2">
                <button
                  type="button"
                  className="text-warning underline underline-offset-4 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/50 rounded-sm"
                  onClick={() => openSettings("lms-connections")}
                >
                  Configure LMS connections...
                </button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <FormField
              label="LMS connection"
              htmlFor="new-course-lms-connection"
            >
              <Select
                value={selectedLmsConnectionId || NONE_VALUE}
                onValueChange={(value) =>
                  setSelectedLmsConnectionId(value === NONE_VALUE ? "" : value)
                }
              >
                <SelectTrigger id="new-course-lms-connection">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {lmsConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {lmsConnectionDisplayName(connection)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <div className="space-y-2">
              {selectedLmsDraft ? (
                <Text className="text-xs text-muted-foreground">
                  LMS: {lmsConnectionDisplayName(selectedLmsDraft)} (
                  {selectedLmsDraft.baseUrl})
                </Text>
              ) : (
                <Text className="text-xs text-muted-foreground">
                  Select an LMS connection to load courses.
                </Text>
              )}

              {courseFetchStatus === "loading" && (
                <div className="flex items-center gap-2 text-sm py-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading courses...
                </div>
              )}

              {courseFetchStatus === "loaded" && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search courses..."
                      className="pl-8"
                      value={courseSearch}
                      onChange={(event) => setCourseSearch(event.target.value)}
                    />
                  </div>

                  <div className="border rounded-md max-h-44 overflow-y-auto">
                    {filteredCourses.length === 0 ? (
                      <Text className="text-sm text-muted-foreground p-3">
                        No courses found.
                      </Text>
                    ) : (
                      <RadioGroup
                        value={selectedCourseId}
                        onValueChange={setSelectedCourseId}
                        className="p-1"
                      >
                        {filteredCourses.map((course) => (
                          <div
                            key={course.id}
                            className="flex items-center gap-2 p-2 rounded-sm hover:bg-muted/50 cursor-pointer"
                            onClick={() => setSelectedCourseId(course.id)}
                            role="option"
                            aria-selected={selectedCourseId === course.id}
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault()
                                setSelectedCourseId(course.id)
                              }
                            }}
                          >
                            <RadioGroupItem
                              value={course.id}
                              id={`course-${course.id}`}
                            />
                            <Label
                              htmlFor={`course-${course.id}`}
                              className="font-normal cursor-pointer text-sm"
                            >
                              <span className="font-medium">{course.id}</span>{" "}
                              {course.name}
                              {course.code ? ` (${course.code})` : ""}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                </>
              )}

              {courseFetchStatus === "error" && (
                <div className="space-y-1">
                  <Text className="text-sm text-destructive">
                    Failed to load courses
                    {courseFetchError ? `: ${courseFetchError}` : "."}
                  </Text>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      loadLmsCourses()
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {error && source === "lms" && (
          <Text className="text-sm text-destructive">{error}</Text>
        )}
      </SourceActionCard>

      <SourceActionCard
        title="Set up a course from a RepoBee student list"
        description={
          <>
            Loads groups from a <code>students.txt</code>-style file where each
            line lists the git IDs (GitHub or GitLab) of one team. This is the
            format used by RepoBee. Use this when your roster lives in a flat
            file rather than an LMS.
          </>
        }
        selected={source === "repobee"}
        onClick={() => void handleSelectOrCommit("repobee")}
      >
        <FormField label="Course name" htmlFor="new-course-name-repobee">
          <Input
            id="new-course-name-repobee"
            placeholder="e.g., Software Engineering 2026"
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
            onKeyDown={handleCourseNameKeyDown}
            autoFocus
          />
          {isCourseNameTaken && (
            <Text className="text-sm text-destructive mt-1">
              A course with this name already exists.
            </Text>
          )}
        </FormField>

        {error && source === "repobee" && (
          <Text className="text-sm text-destructive">{error}</Text>
        )}
      </SourceActionCard>
    </>
  )
}
