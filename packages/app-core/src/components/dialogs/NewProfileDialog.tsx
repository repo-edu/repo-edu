/**
 * Dialog for creating a new profile with course binding.
 * Course is required at profile creation and is immutable after.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui"
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Search,
} from "@repo-edu/ui/components/icons"
import { useCallback, useEffect, useState } from "react"
import { commands } from "../../bindings/commands"
import type { CourseInfo, LmsConnection, LmsType } from "@repo-edu/backend-interface/types"
import { useAppSettingsStore } from "../../stores/appSettingsStore"
import { useOutputStore } from "../../stores/outputStore"
import { useUiStore } from "../../stores/uiStore"
import { buildLmsOperationContext } from "../../utils/operationContext"

type CourseMode = "lms" | "manual"
type LmsSetupStatus = "idle" | "verifying" | "connected" | "error"
type CourseFetchStatus = "idle" | "loading" | "loaded" | "error"

const LMS_TYPES: { value: LmsType; label: string }[] = [
  { value: "canvas", label: "Canvas LMS" },
  { value: "moodle", label: "Moodle" },
]

export function NewProfileDialog() {
  const open = useUiStore((state) => state.newProfileDialogOpen)
  const setOpen = useUiStore((state) => state.setNewProfileDialogOpen)
  const setActiveProfile = useUiStore((state) => state.setActiveProfile)
  const appendOutput = useOutputStore((state) => state.appendText)

  // App settings for LMS connection
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const setLmsConnection = useAppSettingsStore(
    (state) => state.setLmsConnection,
  )
  const saveAppSettings = useAppSettingsStore((state) => state.save)

  // Form state
  const [profileName, setProfileName] = useState("")
  const [courseMode, setCourseMode] = useState<CourseMode>("manual")

  // Manual course entry
  const [courseId, setCourseId] = useState("")
  const [courseName, setCourseName] = useState("")
  const [courseFetchingManual, setCourseFetchingManual] = useState(false)

  // LMS course selection
  const [courses, setCourses] = useState<CourseInfo[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string>("")
  const [courseSearch, setCourseSearch] = useState("")
  const [courseFetchStatus, setCourseFetchStatus] =
    useState<CourseFetchStatus>("idle")

  // Inline LMS setup (when no connection configured)
  const [lmsForm, setLmsForm] = useState<{
    lms_type: LmsType
    base_url: string
    access_token: string
  }>({
    lms_type: "canvas",
    base_url: "",
    access_token: "",
  })
  const [showLmsToken, setShowLmsToken] = useState(false)
  const [lmsSetupStatus, setLmsSetupStatus] = useState<LmsSetupStatus>("idle")
  const [lmsSetupError, setLmsSetupError] = useState<string | null>(null)

  // Creating state
  const [isCreating, setIsCreating] = useState(false)

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setProfileName("")
      setCourseMode(lmsConnection ? "lms" : "manual")
      setCourseId("")
      setCourseName("")
      setCourses([])
      setSelectedCourseId("")
      setCourseSearch("")
      setCourseFetchStatus("idle")
      setLmsForm({ lms_type: "canvas", base_url: "", access_token: "" })
      setLmsSetupStatus("idle")
      setLmsSetupError(null)
      setIsCreating(false)
      setCourseFetchingManual(false)
    }
  }, [open, lmsConnection])

  // Fetch course name from LMS by ID (manual mode)
  const fetchCourseNameById = useCallback(async () => {
    if (!courseId.trim() || !lmsConnection) return

    setCourseFetchingManual(true)
    try {
      const result = await commands.fetchLmsCourses()
      if (result.status === "error") {
        appendOutput(`Failed to fetch course: ${result.error.message}`, "error")
        setCourseFetchingManual(false)
        return
      }
      const found = result.data.find((c) => c.id === courseId.trim())
      if (found) {
        setCourseName(found.name)
      } else {
        appendOutput(`Course with ID "${courseId}" not found in LMS`, "warning")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to fetch course: ${message}`, "error")
    } finally {
      setCourseFetchingManual(false)
    }
  }, [courseId, lmsConnection, appendOutput])

  // Fetch courses when LMS mode selected and connection exists
  useEffect(() => {
    if (
      open &&
      courseMode === "lms" &&
      lmsConnection &&
      courseFetchStatus === "idle"
    ) {
      fetchCourses()
    }
  }, [open, courseMode, lmsConnection, courseFetchStatus])

  const fetchCourses = useCallback(async () => {
    setCourseFetchStatus("loading")
    try {
      const result = await commands.fetchLmsCourses()
      if (result.status === "error") {
        setCourseFetchStatus("error")
        appendOutput(
          `Failed to fetch courses: ${result.error.message}`,
          "error",
        )
        return
      }
      setCourses(result.data)
      setCourseFetchStatus("loaded")
    } catch (error) {
      setCourseFetchStatus("error")
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to fetch courses: ${message}`, "error")
    }
  }, [appendOutput])

  const handleVerifyLms = async () => {
    setLmsSetupStatus("verifying")
    setLmsSetupError(null)
    try {
      const connection: LmsConnection = {
        lms_type: lmsForm.lms_type,
        base_url: lmsForm.base_url,
        access_token: lmsForm.access_token,
      }
      const context = buildLmsOperationContext(connection, "") ?? {
        connection,
        course_id: "",
      }
      const result = await commands.verifyLmsConnectionDraft(context)
      if (result.status === "error") {
        setLmsSetupStatus("error")
        setLmsSetupError(result.error.message)
        return
      }
      if (!result.data.success) {
        setLmsSetupStatus("error")
        setLmsSetupError(result.data.message)
        return
      }
      // Save the connection
      setLmsConnection(connection)
      await saveAppSettings()
      setLmsSetupStatus("connected")
      // Fetch courses with the new connection
      const coursesResult = await commands.fetchLmsCoursesDraft(connection)
      if (coursesResult.status === "ok") {
        setCourses(coursesResult.data)
        setCourseFetchStatus("loaded")
      }
    } catch (error) {
      setLmsSetupStatus("error")
      setLmsSetupError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleCreate = async () => {
    if (!profileName.trim()) return

    let course: CourseInfo
    if (courseMode === "manual") {
      if (!courseId.trim() || !courseName.trim()) return
      course = { id: courseId.trim(), name: courseName.trim() }
    } else {
      const selected = courses.find((c) => c.id === selectedCourseId)
      if (!selected) return
      course = selected
    }

    setIsCreating(true)
    try {
      const result = await commands.createProfile(profileName.trim(), course)
      if (result.status === "error") {
        appendOutput(
          `Failed to create profile: ${result.error.message}`,
          "error",
        )
        setIsCreating(false)
        return
      }
      await commands.setActiveProfile(profileName.trim())
      setActiveProfile(profileName.trim())
      appendOutput(
        `Created and activated profile: ${profileName.trim()}`,
        "success",
      )
      setOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to create profile: ${message}`, "error")
      setIsCreating(false)
    }
  }

  const filteredCourses = courses.filter(
    (c) =>
      c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(courseSearch.toLowerCase()),
  )

  const isLmsFormValid = lmsForm.base_url.trim() && lmsForm.access_token.trim()

  const canCreate =
    profileName.trim() &&
    (courseMode === "manual"
      ? courseId.trim() && courseName.trim()
      : selectedCourseId)

  const showInlineLmsSetup = courseMode === "lms" && !lmsConnection

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Profile</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Profile Name */}
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Profile Name</Label>
            <Input
              id="profile-name"
              placeholder="e.g., 4TC00-2024"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>

          {/* Course Mode Selection */}
          <div className="grid gap-2">
            <Label>Course</Label>
            <RadioGroup
              value={courseMode}
              onValueChange={(v) => setCourseMode(v as CourseMode)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="lms" id="mode-lms" />
                <Label
                  htmlFor="mode-lms"
                  className="font-normal cursor-pointer"
                >
                  Select from LMS
                  {!lmsConnection && (
                    <span className="text-muted-foreground ml-1">
                      (requires LMS connection)
                    </span>
                  )}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="mode-manual" />
                <Label
                  htmlFor="mode-manual"
                  className="font-normal cursor-pointer"
                >
                  Enter manually
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Inline LMS Setup (if no connection) */}
          {showInlineLmsSetup && (
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <p className="text-sm text-muted-foreground">
                LMS Connection (not configured)
              </p>

              <div className="grid gap-2">
                <Label htmlFor="lms-type" className="text-xs">
                  LMS Type
                </Label>
                <Select
                  value={lmsForm.lms_type}
                  onValueChange={(v) =>
                    setLmsForm({ ...lmsForm, lms_type: v as LmsType })
                  }
                >
                  <SelectTrigger id="lms-type" className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LMS_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lms-url" className="text-xs">
                  Base URL
                </Label>
                <Input
                  id="lms-url"
                  className="h-8"
                  value={lmsForm.base_url}
                  onChange={(e) =>
                    setLmsForm({ ...lmsForm, base_url: e.target.value })
                  }
                  placeholder="https://canvas.example.com"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lms-token" className="text-xs">
                  Access Token
                </Label>
                <div className="relative">
                  <Input
                    id="lms-token"
                    className="h-8 pr-10"
                    type={showLmsToken ? "text" : "password"}
                    value={lmsForm.access_token}
                    onChange={(e) =>
                      setLmsForm({ ...lmsForm, access_token: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-2"
                    onClick={() => setShowLmsToken(!showLmsToken)}
                  >
                    {showLmsToken ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {lmsSetupError && (
                <p className="text-xs text-destructive">{lmsSetupError}</p>
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleVerifyLms}
                  disabled={!isLmsFormValid || lmsSetupStatus === "verifying"}
                >
                  {lmsSetupStatus === "verifying" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : lmsSetupStatus === "connected" ? (
                    <>
                      <Check className="size-4 mr-1" />
                      Connected
                    </>
                  ) : (
                    "Connect"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* LMS Course Selection */}
          {courseMode === "lms" && lmsConnection && (
            <div className="grid gap-2">
              <p className="text-xs">
                LMS:{" "}
                {LMS_TYPES.find((t) => t.value === lmsConnection.lms_type)
                  ?.label ?? lmsConnection.lms_type}{" "}
                ({lmsConnection.base_url})
              </p>

              {courseFetchStatus === "loading" && (
                <div className="flex items-center gap-2 text-sm py-4">
                  <Loader2 className="size-4 animate-spin" />
                  Loading courses...
                </div>
              )}

              {courseFetchStatus === "loaded" && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4" />
                    <Input
                      placeholder="Search courses..."
                      className="pl-8 h-8"
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                    />
                  </div>

                  <div className="border rounded-md max-h-52 overflow-y-auto">
                    {filteredCourses.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-3">
                        No courses found
                      </p>
                    ) : (
                      <RadioGroup
                        value={selectedCourseId}
                        onValueChange={setSelectedCourseId}
                        className="p-1"
                      >
                        {filteredCourses.map((course) => (
                          <div
                            key={course.id}
                            role="option"
                            aria-selected={selectedCourseId === course.id}
                            tabIndex={0}
                            className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                            onClick={() => setSelectedCourseId(course.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
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
                              className="flex-1 font-normal cursor-pointer text-sm"
                            >
                              <span className="font-medium">{course.id}</span>{" "}
                              {course.name}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                  </div>
                </>
              )}

              {courseFetchStatus === "error" && (
                <div className="text-sm text-destructive">
                  Failed to load courses.{" "}
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => {
                      setCourseFetchStatus("idle")
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Manual Course Entry */}
          {courseMode === "manual" && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="course-id">Course ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="course-id"
                    placeholder="12345"
                    value={courseId}
                    onChange={(e) => {
                      setCourseId(e.target.value)
                      setCourseName("") // Clear name when ID changes
                    }}
                    className="flex-1"
                  />
                  {lmsConnection && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchCourseNameById}
                      disabled={!courseId.trim() || courseFetchingManual}
                    >
                      {courseFetchingManual ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Fetch"
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="course-name">Course Name</Label>
                {lmsConnection ? (
                  <Input
                    id="course-name"
                    placeholder="Fetched from LMS"
                    value={courseName}
                    readOnly
                    className="bg-muted/50"
                  />
                ) : (
                  <Input
                    id="course-name"
                    placeholder="e.g., Model-based Systems Engineering"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                  />
                )}
                {lmsConnection && !courseName && (
                  <p className="text-xs text-muted-foreground">
                    Enter a Course ID and click Fetch to retrieve the name
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate || isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Profile"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
