import type { LmsCourseSummary } from "@repo-edu/application-contract"
import type { PersistedProfile, Roster } from "@repo-edu/domain"
import { persistedProfileKind } from "@repo-edu/domain"
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
import { generateProfileId } from "../../utils/nanoid.js"

const EMPTY_ROSTER: Roster = {
  connection: null,
  students: [],
  staff: [],
  groups: [],
  groupSets: [],
  assignments: [],
}
const NONE_VALUE = "__none__"
type CourseMode = "lms" | "manual"
type CourseFetchStatus = "idle" | "loading" | "loaded" | "error"

export function NewProfileDialog() {
  const open = useUiStore((state) => state.newProfileDialogOpen)
  const setOpen = useUiStore((state) => state.setNewProfileDialogOpen)
  const setActiveProfileId = useUiStore((state) => state.setActiveProfileId)
  const setProfileList = useUiStore((state) => state.setProfileList)
  const existingProfiles = useUiStore((state) => state.profileList)
  const setRosterSyncDialogOpen = useUiStore(
    (state) => state.setRosterSyncDialogOpen,
  )

  const settings = useAppSettingsStore((state) => state.settings)
  const saveAppSettings = useAppSettingsStore((state) => state.save)
  const setSettingsActiveProfileId = useAppSettingsStore(
    (state) => state.setActiveProfileId,
  )

  const [profileName, setProfileName] = useState("")
  const [courseId, setCourseId] = useState("")
  const [courseMode, setCourseMode] = useState<CourseMode>("manual")
  const [courseSearch, setCourseSearch] = useState("")
  const [courses, setCourses] = useState<LmsCourseSummary[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState("")
  const [courseFetchStatus, setCourseFetchStatus] =
    useState<CourseFetchStatus>("idle")
  const [courseFetchError, setCourseFetchError] = useState<string | null>(null)
  const [selectedLmsConnection, setSelectedLmsConnection] = useState<string>("")
  const [selectedGitConnection, setSelectedGitConnection] = useState<string>("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lmsConnections = settings.lmsConnections
  const gitConnections = settings.gitConnections

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

  const isProfileNameTaken = useMemo(() => {
    const normalized = profileName.trim().toLowerCase()
    if (normalized.length === 0) {
      return false
    }

    return existingProfiles.some(
      (profile) => profile.displayName.trim().toLowerCase() === normalized,
    )
  }, [existingProfiles, profileName])

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
    if (profileName.trim().length === 0 || creating || isProfileNameTaken) {
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
    profileName,
    creating,
    isProfileNameTaken,
    courseMode,
    selectedLmsConnection,
    selectedCourseId,
  ])

  const reset = useCallback(() => {
    setProfileName("")
    setCourseId("")
    setCourseMode(lmsConnections.length > 0 ? "lms" : "manual")
    setCourseSearch("")
    setCourses([])
    setSelectedCourseId("")
    setCourseFetchStatus("idle")
    setCourseFetchError(null)
    setSelectedLmsConnection(lmsConnections[0]?.name ?? "")
    setSelectedGitConnection("")
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

    if (isProfileNameTaken) {
      setError("A profile with this name already exists.")
      return
    }

    setCreating(true)
    setError(null)

    try {
      const now = new Date().toISOString()
      const nextCourseId =
        courseMode === "lms"
          ? selectedCourseId.trim() || null
          : courseId.trim() || null
      const profile: PersistedProfile = {
        kind: persistedProfileKind,
        schemaVersion: 2,
        id: generateProfileId(),
        displayName: profileName.trim(),
        lmsConnectionName: selectedLmsConnection || null,
        gitConnectionName: selectedGitConnection || null,
        courseId: nextCourseId,
        roster: EMPTY_ROSTER,
        repositoryTemplate: null,
        updatedAt: now,
      }

      const client = getWorkflowClient()
      const saved = await client.run("profile.save", profile)
      const profiles = await client.run("profile.list", undefined)
      setProfileList(profiles)
      setActiveProfileId(saved.id)

      setSettingsActiveProfileId(saved.id)
      await saveAppSettings()

      handleClose()

      if (
        saved.lmsConnectionName !== null &&
        (saved.courseId ?? "").trim().length > 0
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
          <DialogTitle>New Profile</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="Profile name" htmlFor="new-profile-name">
            <Input
              id="new-profile-name"
              placeholder="e.g., Software Engineering 2026"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) {
                  void handleCreate()
                }
              }}
              autoFocus
            />
            {isProfileNameTaken && (
              <Text className="text-sm text-destructive mt-1">
                A profile with this name already exists.
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
                <RadioGroupItem value="lms" id="new-profile-course-mode-lms" />
                <Label
                  htmlFor="new-profile-course-mode-lms"
                  className="font-normal cursor-pointer"
                >
                  Select from LMS
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="manual"
                  id="new-profile-course-mode-manual"
                />
                <Label
                  htmlFor="new-profile-course-mode-manual"
                  className="font-normal cursor-pointer"
                >
                  Enter manually
                </Label>
              </div>
            </RadioGroup>
          </FormField>

          <FormField
            label="LMS connection (optional)"
            htmlFor="new-profile-lms-connection"
          >
            <Select
              value={selectedLmsConnection || NONE_VALUE}
              onValueChange={(value) =>
                setSelectedLmsConnection(value === NONE_VALUE ? "" : value)
              }
            >
              <SelectTrigger id="new-profile-lms-connection">
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
              htmlFor="new-profile-course-id"
            >
              <Input
                id="new-profile-course-id"
                placeholder="e.g., SE-2026-A"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
              />
            </FormField>
          )}

          <FormField
            label="Git connection (optional)"
            htmlFor="new-profile-git-connection"
          >
            <Select
              value={selectedGitConnection || NONE_VALUE}
              onValueChange={(value) =>
                setSelectedGitConnection(value === NONE_VALUE ? "" : value)
              }
            >
              <SelectTrigger id="new-profile-git-connection">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {gitConnections.map((connection) => (
                  <SelectItem key={connection.name} value={connection.name}>
                    {connection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {error && <Text className="text-sm text-destructive">{error}</Text>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!canCreate}>
            {creating ? "Creating..." : "Create Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
