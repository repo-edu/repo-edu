import {
  activeSurfaceEquals,
  type SubmissionFolderRecent,
} from "@repo-edu/domain/settings"
import type { CourseSummary } from "@repo-edu/domain/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@repo-edu/ui"
import {
  ChevronDown,
  Copy,
  FolderOpen,
  Home,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "@repo-edu/ui/components/icons"
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useRendererHost } from "../contexts/renderer-host.js"
import { useActiveSurfaceNavigation } from "../hooks/use-active-surface-navigation.js"
import { useCourses } from "../hooks/use-courses.js"
import { useAppSettingsStore } from "../stores/app-settings-store.js"
import {
  selectActiveCourseId,
  selectActiveFolderPath,
  selectActiveSubmissionPath,
  selectActiveSurface,
  useUiStore,
} from "../stores/ui-store.js"

function backingBadgeLabel(course: CourseSummary): string {
  if (course.backing === "lms") return "LMS"
  return "RepoBee"
}

function backingSortRank(course: CourseSummary): number {
  if (course.backing === "lms") return 0
  return 1
}

function folderBasename(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "")
  return normalized.slice(normalized.lastIndexOf("/") + 1) || normalized
}

function folderParent(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "")
  const index = normalized.lastIndexOf("/")
  return index <= 0 ? normalized : normalized.slice(0, index)
}

export function CourseSwitcher() {
  const activeSurface = useUiStore(selectActiveSurface)
  const activeCourseId = useUiStore(selectActiveCourseId)
  const activeFolderPath = useUiStore(selectActiveFolderPath)
  const activeSubmissionPath = useUiStore(selectActiveSubmissionPath)
  const isHomeSurface = activeSurface.kind === "home"
  const recentFolders = useAppSettingsStore(
    (s) => s.settings.recentAnalysisFolders,
  )
  const recentSubmissionFolders = useAppSettingsStore(
    (s) => s.settings.recentSubmissionFolders,
  )
  const removeRecentFolder = useAppSettingsStore((s) => s.removeRecentFolder)
  const removeRecentSubmissionFolder = useAppSettingsStore(
    (s) => s.removeRecentSubmissionFolder,
  )
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const rendererHost = useRendererHost()
  const activateSurface = useActiveSurfaceNavigation()
  const {
    courses,
    refresh: refreshCourses,
    switchCourse,
    duplicateCourse,
    renameCourse,
    deleteCourse,
  } = useCourses()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void refreshCourses()
  }, [refreshCourses])

  const activeCourseName =
    courses.find((course) => course.id === activeCourseId)?.displayName ?? null

  const sortedCourses = useMemo(
    () =>
      [...courses].sort((a, b) => {
        const rankDiff = backingSortRank(a) - backingSortRank(b)
        if (rankDiff !== 0) return rankDiff
        return a.displayName.localeCompare(b.displayName)
      }),
    [courses],
  )

  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    id: string
    currentName: string
    newName: string
  }>({ open: false, id: "", currentName: "", newName: "" })

  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean
    sourceCourseId: string
    sourceName: string
    newCourseName: string
    isProcessing: boolean
  }>({
    open: false,
    sourceCourseId: "",
    sourceName: "",
    newCourseName: "",
    isProcessing: false,
  })

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    id: string
    name: string
  }>({ open: false, id: "", name: "" })

  const handleCourseSelect = (course: CourseSummary) => {
    const id = course.id
    if (activeSurfaceEquals(activeSurface, { kind: "course", courseId: id })) {
      return
    }
    setOpen(false)
    void switchCourse(id, course.backing)
  }

  const handleRecentFolderSelect = (path: string) => {
    if (path === activeFolderPath) return
    setOpen(false)
    void activateSurface(
      { kind: "folder", path },
      { recordRecent: true, preferredTab: "analysis" },
    )
  }

  const handleOpenCourseSubmissionFolder = async (course: CourseSummary) => {
    const dir = await rendererHost.pickDirectory({
      title: "Open student submission folder",
    })
    if (!dir) return
    setOpen(false)
    await activateSurface(
      { kind: "submission", path: dir, courseId: course.id },
      {
        recordRecent: true,
        preferredTab: "analysis",
        courseBacking: course.backing,
      },
    )
  }

  const handleRecentSubmissionSelect = (recent: SubmissionFolderRecent) => {
    const surface =
      recent.courseId === undefined
        ? { kind: "submission" as const, path: recent.path }
        : {
            kind: "submission" as const,
            path: recent.path,
            courseId: recent.courseId,
          }
    if (activeSurfaceEquals(activeSurface, surface)) return
    const courseBacking =
      recent.courseId === undefined
        ? undefined
        : courses.find((course) => course.id === recent.courseId)?.backing
    setOpen(false)
    void activateSurface(surface, {
      recordRecent: true,
      preferredTab: "analysis",
      courseBacking,
    })
  }

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    onActivate: () => void,
  ) => {
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onActivate()
    }
  }

  const handleActionClick = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation()
    action()
  }

  const handleDuplicateClick = (courseId: string, courseName: string) => {
    setOpen(false)
    setDuplicateDialog({
      open: true,
      sourceCourseId: courseId,
      sourceName: courseName,
      newCourseName: `${courseName} copy`,
      isProcessing: false,
    })
  }

  const handleDuplicateConfirm = async () => {
    const { sourceCourseId, newCourseName } = duplicateDialog
    if (!newCourseName.trim()) return

    setDuplicateDialog((prev) => ({ ...prev, isProcessing: true }))
    const success = await duplicateCourse(sourceCourseId, newCourseName.trim())

    if (success) {
      setDuplicateDialog({
        open: false,
        sourceCourseId: "",
        sourceName: "",
        newCourseName: "",
        isProcessing: false,
      })
    } else {
      setDuplicateDialog((prev) => ({ ...prev, isProcessing: false }))
    }
  }

  const handleRenameClick = (id: string, name: string) => {
    setOpen(false)
    setRenameDialog({
      open: true,
      id,
      currentName: name,
      newName: name,
    })
  }

  const handleRenameConfirm = async () => {
    const { id, newName } = renameDialog
    await renameCourse(id, newName)
    setRenameDialog({
      open: false,
      id: "",
      currentName: "",
      newName: "",
    })
  }

  const handleDeleteClick = (id: string, name: string) => {
    setOpen(false)
    setDeleteDialog({ open: true, id, name })
  }

  const handleDeleteConfirm = async () => {
    await deleteCourse(deleteDialog.id)
    setDeleteDialog({ open: false, id: "", name: "" })
  }

  const handleHomeSelect = () => {
    if (isHomeSurface) {
      setOpen(false)
      return
    }
    setOpen(false)
    void activateSurface({ kind: "home" })
  }

  const handleRemoveRecentFolder = (path: string) => {
    removeRecentFolder(path)
    void saveAppSettings()
  }

  const handleRemoveRecentSubmissionFolder = (
    recent: SubmissionFolderRecent,
  ) => {
    removeRecentSubmissionFolder(recent)
    void saveAppSettings()
  }

  const canDuplicate = duplicateDialog.newCourseName.trim().length > 0

  const remainingCourses = sortedCourses.filter(
    (course) => course.id !== deleteDialog.id,
  )
  const isLastCourse = remainingCourses.length === 0
  const nextCourse = remainingCourses[0]?.displayName
  const hasCourses = courses.length > 0

  const renderCourseRows = (rows: CourseSummary[]) =>
    rows.map((course) => {
      const isActive = activeSurfaceEquals(activeSurface, {
        kind: "course",
        courseId: course.id,
      })
      const badge = backingBadgeLabel(course)
      return (
        <div
          key={course.id}
          role="option"
          tabIndex={0}
          aria-selected={isActive}
          onClick={() => handleCourseSelect(course)}
          onKeyDown={(event) =>
            handleRowKeyDown(event, () => handleCourseSelect(course))
          }
          className={cn(
            "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
            isActive && "bg-selection",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{course.displayName}</span>
          <span className="shrink-0 rounded border border-border/70 px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
            {badge}
          </span>
          <div className="flex shrink-0 items-center gap-0">
            {course.backing === "lms" ? (
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-4"
                aria-label={`Open submission folder for ${course.displayName}`}
                title="Open submission folder"
                onClick={(event) =>
                  handleActionClick(event, () => {
                    void handleOpenCourseSubmissionFolder(course)
                  })
                }
              >
                <FolderOpen className="size-3" />
              </Button>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-4"
              aria-label={`Duplicate ${course.displayName}`}
              title="Duplicate"
              onClick={(event) =>
                handleActionClick(event, () =>
                  handleDuplicateClick(course.id, course.displayName),
                )
              }
            >
              <Copy className="size-3" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-4"
              aria-label={`Rename ${course.displayName}`}
              title="Rename"
              onClick={(event) =>
                handleActionClick(event, () =>
                  handleRenameClick(course.id, course.displayName),
                )
              }
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-4"
              aria-label={`Delete ${course.displayName}`}
              title="Delete"
              onClick={(event) =>
                handleActionClick(event, () =>
                  handleDeleteClick(course.id, course.displayName),
                )
              }
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      )
    })

  const renderRecentSubmissionRows = () =>
    recentSubmissionFolders.map((recent) => {
      const isActive = activeSurfaceEquals(
        activeSurface,
        recent.courseId === undefined
          ? { kind: "submission", path: recent.path }
          : {
              kind: "submission",
              path: recent.path,
              courseId: recent.courseId,
            },
      )
      const courseName =
        recent.courseId === undefined
          ? null
          : (courses.find((course) => course.id === recent.courseId)
              ?.displayName ?? null)
      return (
        <div
          key={`${recent.courseId ?? ""}\0${recent.path}`}
          role="option"
          tabIndex={0}
          aria-selected={isActive}
          onClick={() => handleRecentSubmissionSelect(recent)}
          onKeyDown={(event) =>
            handleRowKeyDown(event, () => handleRecentSubmissionSelect(recent))
          }
          className={cn(
            "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
            isActive && "bg-selection",
          )}
        >
          <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {folderBasename(recent.path)}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {courseName === null
                ? folderParent(recent.path)
                : `${courseName} · ${folderParent(recent.path)}`}
            </span>
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-4 shrink-0"
            aria-label={`Remove ${recent.path} from recent submissions`}
            title={
              isActive
                ? "Close this submission before removing it from recents"
                : "Remove recent submission"
            }
            disabled={isActive}
            onClick={(event) =>
              handleActionClick(event, () =>
                handleRemoveRecentSubmissionFolder(recent),
              )
            }
          >
            <X className="size-3" />
          </Button>
        </div>
      )
    })

  const renderRecentFolderRows = () =>
    recentFolders.map((path) => {
      const isActive = path === activeFolderPath
      return (
        <div
          key={path}
          role="option"
          tabIndex={0}
          aria-selected={isActive}
          onClick={() => handleRecentFolderSelect(path)}
          onKeyDown={(event) =>
            handleRowKeyDown(event, () => handleRecentFolderSelect(path))
          }
          className={cn(
            "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
            isActive && "bg-selection",
          )}
        >
          <FolderOpen className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{folderBasename(path)}</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {folderParent(path)}
            </span>
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-4 shrink-0"
            aria-label={`Remove ${path} from recent folders`}
            title="Remove recent folder"
            onClick={(event) =>
              handleActionClick(event, () => handleRemoveRecentFolder(path))
            }
          >
            <X className="size-3" />
          </Button>
        </div>
      )
    })

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="max-w-full min-w-0 overflow-hidden"
          >
            <span className="flex items-center gap-1 truncate">
              {isHomeSurface ? (
                <>
                  <Home className="size-3.5 shrink-0 text-muted-foreground" />
                  Home
                </>
              ) : activeSubmissionPath !== null ? (
                <>
                  <span className="text-muted-foreground">Submission:</span>{" "}
                  {folderBasename(activeSubmissionPath)}
                </>
              ) : activeFolderPath !== null ? (
                <>
                  <span className="text-muted-foreground">Folder:</span>{" "}
                  {folderBasename(activeFolderPath)}
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">Course:</span>{" "}
                  {activeCourseName ?? "None"}
                </>
              )}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="bottom">
          <div
            role="option"
            tabIndex={0}
            aria-selected={isHomeSurface}
            onClick={handleHomeSelect}
            onKeyDown={(event) => handleRowKeyDown(event, handleHomeSelect)}
            className={cn(
              "flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
              "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
              isHomeSurface && "bg-selection",
            )}
          >
            <Home className="size-3" />
            Home
          </div>

          {hasCourses && (
            <>
              <DropdownMenuSeparator className="my-0.5" />
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Courses
              </div>
              {renderCourseRows(sortedCourses)}
            </>
          )}

          {recentFolders.length > 0 && (
            <>
              <DropdownMenuSeparator className="my-0.5" />
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Recent folders
              </div>
              {renderRecentFolderRows()}
            </>
          )}

          {recentSubmissionFolders.length > 0 && (
            <>
              <DropdownMenuSeparator className="my-0.5" />
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Recent submissions
              </div>
              {renderRecentSubmissionRows()}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={duplicateDialog.open}
        onOpenChange={(nextOpen) => {
          if (!duplicateDialog.isProcessing) {
            setDuplicateDialog((prev) => ({ ...prev, open: nextOpen }))
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate Course</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="dup-course-name">Course Name</Label>
              <Input
                id="dup-course-name"
                placeholder="New course name"
                value={duplicateDialog.newCourseName}
                onChange={(event) =>
                  setDuplicateDialog((prev) => ({
                    ...prev,
                    newCourseName: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canDuplicate) {
                    void handleDuplicateConfirm()
                  }
                }}
                disabled={duplicateDialog.isProcessing}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDuplicateDialog((prev) => ({ ...prev, open: false }))
              }
              disabled={duplicateDialog.isProcessing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canDuplicate || duplicateDialog.isProcessing}
              onClick={() => void handleDuplicateConfirm()}
            >
              {duplicateDialog.isProcessing ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                "Duplicate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameDialog.open}
        onOpenChange={(nextOpen) =>
          setRenameDialog((prev) => ({ ...prev, open: nextOpen }))
        }
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename Course</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="New name"
            value={renameDialog.newName}
            onChange={(event) =>
              setRenameDialog((prev) => ({
                ...prev,
                newName: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameDialog.newName.trim()) {
                void handleRenameConfirm()
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRenameDialog({
                  open: false,
                  id: "",
                  currentName: "",
                  newName: "",
                })
              }
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!renameDialog.newName.trim()}
              onClick={() => void handleRenameConfirm()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(nextOpen) =>
          setDeleteDialog((prev) => ({ ...prev, open: nextOpen }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              {isLastCourse ? (
                <>
                  Delete &quot;{deleteDialog.name}&quot;? This is your last
                  course.
                </>
              ) : deleteDialog.id === activeCourseId ? (
                <>
                  Delete &quot;{deleteDialog.name}&quot;? You will be switched
                  to &quot;{nextCourse}&quot;.
                </>
              ) : (
                <>Delete &quot;{deleteDialog.name}&quot;?</>
              )}
              <br />
              <br />
              This will also delete the roster data associated with this course.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteConfirm()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
