import type { LmsCourseSummary } from "@repo-edu/application-contract"
import { type CourseKind, createBlankCourse } from "@repo-edu/domain/types"
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { generateCourseId } from "../../utils/nanoid.js"

const NONE_VALUE = "__none__"
type CourseFetchStatus = "idle" | "loading" | "loaded" | "error"

export function createNewCourseDraft(input: {
  id: string
  updatedAt: string
  mode: CourseKind
  displayName: string
  selectedLmsConnection: string
  selectedCourseId: string
}) {
  return createBlankCourse(input.id, input.updatedAt, {
    courseKind: input.mode,
    displayName: input.displayName,
    lmsConnectionName:
      input.mode === "lms" ? input.selectedLmsConnection || null : null,
    lmsCourseId:
      input.mode === "lms" ? input.selectedCourseId.trim() || null : null,
  })
}

export function NewCourseDialog() {
  const courseMode = useUiStore((state) => state.newCourseDialogMode)
  const setCourseMode = useUiStore((state) => state.setNewCourseDialogMode)
  const open = courseMode !== null
  const setActiveCourseId = useUiStore((state) => state.setActiveCourseId)
  const setActiveDocumentKind = useUiStore(
    (state) => state.setActiveDocumentKind,
  )
  const setCourseList = useUiStore((state) => state.setCourseList)
  const existingCourses = useUiStore((state) => state.courseList)
  const openSettings = useUiStore((state) => state.openSettings)
  const setRosterSyncDialogOpen = useUiStore(
    (state) => state.setRosterSyncDialogOpen,
  )
  const setActiveTab = useUiStore((state) => state.setActiveTab)

  const settings = useAppSettingsStore((state) => state.settings)
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const setSettingsActiveCourseId = useAppSettingsStore(
    (state) => state.setActiveCourseId,
  )
  const setSettingsActiveTab = useAppSettingsStore(
    (state) => state.setActiveTab,
  )

  const [courseName, setCourseName] = useState("")
  const [courseSearch, setCourseSearch] = useState("")
  const [courses, setCourses] = useState<LmsCourseSummary[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState("")
  const [courseFetchStatus, setCourseFetchStatus] =
    useState<CourseFetchStatus>("idle")
  const [courseFetchError, setCourseFetchError] = useState<string | null>(null)
  const [selectedLmsConnection, setSelectedLmsConnection] = useState<string>("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lmsConnections = settings.lmsConnections

  const selectedLmsDraft = useMemo(
    () =>
      lmsConnections.find(
        (connection) => connection.name === selectedLmsConnection,
      ) ?? null,
    [lmsConnections, selectedLmsConnection],
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
    if (creating) return false
    const normalized = courseName.trim().toLowerCase()
    if (normalized.length === 0) {
      return false
    }

    return existingCourses.some(
      (course) => course.displayName.trim().toLowerCase() === normalized,
    )
  }, [creating, existingCourses, courseName])

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

    const client = getWorkflowClient()
    client
      .run("connection.listLmsCoursesDraft", {
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
  }, [selectedLmsDraft])

  const canCreate = useMemo(() => {
    if (courseName.trim().length === 0 || creating || isCourseNameTaken) {
      return false
    }

    if (courseMode === "lms") {
      if (lmsConnections.length === 0) {
        return false
      }
      return (
        selectedLmsConnection.trim().length > 0 &&
        selectedCourseId.trim().length > 0
      )
    }

    return true
  }, [
    courseName,
    creating,
    isCourseNameTaken,
    courseMode,
    lmsConnections.length,
    selectedLmsConnection,
    selectedCourseId,
  ])

  const reset = useCallback(() => {
    setCourseName("")
    setCourseSearch("")
    setCourses([])
    setSelectedCourseId("")
    setCourseFetchStatus("idle")
    setCourseFetchError(null)
    setSelectedLmsConnection(lmsConnections[0]?.name ?? "")
    setCreating(false)
    setError(null)
  }, [lmsConnections])

  useEffect(() => {
    if (open) {
      reset()
    }
  }, [open, reset])

  useEffect(() => {
    if (!open || courseMode !== "lms") {
      return
    }

    return loadLmsCourses()
  }, [open, courseMode, loadLmsCourses])

  const handleClose = () => {
    setCourseMode(null)
    reset()
  }

  const handleCreate = async () => {
    if (!canCreate || courseMode === null) return

    if (isCourseNameTaken) {
      setError("A course with this name already exists.")
      return
    }

    setCreating(true)
    setError(null)

    try {
      const course = createNewCourseDraft({
        id: generateCourseId(),
        updatedAt: new Date().toISOString(),
        mode: courseMode,
        displayName: courseName.trim(),
        selectedLmsConnection,
        selectedCourseId,
      })

      const client = getWorkflowClient()
      const saved = await client.run("course.save", course)
      const courses = await client.run("course.list", undefined)
      setCourseList(courses)
      setActiveDocumentKind("course")
      setActiveCourseId(saved.id)
      const nextTab =
        saved.courseKind === "repobee" ? "groups-assignments" : "roster"
      setActiveTab(nextTab)

      useAppSettingsStore.getState().setActiveDocumentKind("course")
      setSettingsActiveCourseId(saved.id)
      setSettingsActiveTab(nextTab)
      await saveAppSettings()

      handleClose()

      if (
        saved.lmsConnectionName !== null &&
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
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {courseMode === "repobee" ? "New RepoBee Course" : "New LMS Course"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {courseMode === "lms" && lmsConnections.length === 0 && (
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
                    onClick={() => {
                      handleClose()
                      openSettings("lms-connections")
                    }}
                  >
                    Configure LMS connections…
                  </button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {courseMode === "lms" && lmsConnections.length > 0 && (
            <FormField
              label="LMS connection"
              htmlFor="new-course-lms-connection"
            >
              <Select
                value={selectedLmsConnection || NONE_VALUE}
                onValueChange={(value) =>
                  setSelectedLmsConnection(value === NONE_VALUE ? "" : value)
                }
              >
                <SelectTrigger id="new-course-lms-connection">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {lmsConnections.map((connection) => (
                    <SelectItem key={connection.name} value={connection.name}>
                      {connection.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {courseMode === "lms" && lmsConnections.length > 0 ? (
            <div className="space-y-2">
              {selectedLmsDraft ? (
                <Text className="text-xs text-muted-foreground">
                  LMS: {selectedLmsDraft.name} ({selectedLmsDraft.baseUrl})
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
          ) : null}

          {(courseMode === "repobee" ||
            (courseMode === "lms" && lmsConnections.length > 0)) && (
            <FormField label="Course name" htmlFor="new-course-name">
              <Input
                id="new-course-name"
                placeholder="e.g., Software Engineering 2026"
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canCreate) {
                    void handleCreate()
                  }
                }}
              />
              {isCourseNameTaken && (
                <Text className="text-sm text-destructive mt-1">
                  A course with this name already exists.
                </Text>
              )}
            </FormField>
          )}

          {error && <Text className="text-sm text-destructive">{error}</Text>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!canCreate}>
            {creating ? "Creating..." : "Create Course"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
