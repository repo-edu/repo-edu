import type { LmsCourseSummary } from "@repo-edu/application-contract"
import { createBlankCourse } from "@repo-edu/domain/types"
import {
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
import { Loader2, Search } from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useMemo, useState } from "react"
import { getWorkflowClient } from "../../contexts/workflow-client.js"
import { useAppSettingsStore } from "../../stores/app-settings-store.js"
import { useUiStore } from "../../stores/ui-store.js"
import { getErrorMessage } from "../../utils/error-message.js"
import { generateCourseId } from "../../utils/nanoid.js"

const NONE_VALUE = "__none__"
type CourseMode = "lms" | "manual"
type CourseFetchStatus = "idle" | "loading" | "loaded" | "error"

export function NewCourseDialog() {
  const open = useUiStore((state) => state.newCourseDialogOpen)
  const setOpen = useUiStore((state) => state.setNewCourseDialogOpen)
  const setActiveCourseId = useUiStore((state) => state.setActiveCourseId)
  const setCourseList = useUiStore((state) => state.setCourseList)
  const existingCourses = useUiStore((state) => state.courseList)
  const setRosterSyncDialogOpen = useUiStore(
    (state) => state.setRosterSyncDialogOpen,
  )

  const settings = useAppSettingsStore((state) => state.settings)
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const setSettingsActiveCourseId = useAppSettingsStore(
    (state) => state.setActiveCourseId,
  )

  const [courseName, setCourseName] = useState("")
  const [lmsCourseId, setLmsCourseId] = useState("")
  const [courseMode, setCourseMode] = useState<CourseMode>("manual")
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
    const normalized = courseName.trim().toLowerCase()
    if (normalized.length === 0) {
      return false
    }

    return existingCourses.some(
      (course) => course.displayName.trim().toLowerCase() === normalized,
    )
  }, [existingCourses, courseName])

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
    selectedLmsConnection,
    selectedCourseId,
  ])

  const reset = useCallback(() => {
    setCourseName("")
    setLmsCourseId("")
    setCourseMode(lmsConnections.length > 0 ? "lms" : "manual")
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
    setOpen(false)
    reset()
  }

  const handleCreate = async () => {
    if (!canCreate) return

    if (isCourseNameTaken) {
      setError("A course with this name already exists.")
      return
    }

    setCreating(true)
    setError(null)

    try {
      const nextCourseId =
        courseMode === "lms"
          ? selectedCourseId.trim() || null
          : lmsCourseId.trim() || null
      const course = createBlankCourse(
        generateCourseId(),
        new Date().toISOString(),
        {
          displayName: courseName.trim(),
          lmsConnectionName: selectedLmsConnection || null,
          lmsCourseId: nextCourseId,
        },
      )

      const client = getWorkflowClient()
      const saved = await client.run("course.save", course)
      const courses = await client.run("course.list", undefined)
      setCourseList(courses)
      setActiveCourseId(saved.id)

      setSettingsActiveCourseId(saved.id)
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
          <DialogTitle>New Course</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
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
              autoFocus
            />
            {isCourseNameTaken && (
              <Text className="text-sm text-destructive mt-1">
                A course with this name already exists.
              </Text>
            )}
          </FormField>

          <FormField label="Course">
            <RadioGroup
              value={courseMode}
              onValueChange={(value) => setCourseMode(value as CourseMode)}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="lms" id="new-course-course-mode-lms" />
                <Label
                  htmlFor="new-course-course-mode-lms"
                  className="font-normal cursor-pointer"
                >
                  Select from LMS
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="manual"
                  id="new-course-course-mode-manual"
                />
                <Label
                  htmlFor="new-course-course-mode-manual"
                  className="font-normal cursor-pointer"
                >
                  Enter manually
                </Label>
              </div>
            </RadioGroup>
          </FormField>

          <FormField
            label="LMS connection (optional)"
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

          {courseMode === "lms" ? (
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
          ) : (
            <FormField
              label="Course ID (optional)"
              htmlFor="new-course-course-id"
            >
              <Input
                id="new-course-course-id"
                placeholder="e.g., SE-2026-A"
                value={lmsCourseId}
                onChange={(event) => setLmsCourseId(event.target.value)}
              />
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
