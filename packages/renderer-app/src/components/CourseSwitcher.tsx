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
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "@repo-edu/ui/components/icons"
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useCourses } from "../hooks/use-courses.js"
import { useUiStore } from "../stores/ui-store.js"

function backingBadgeLabel(course: CourseSummary): string | null {
  if (course.backing === "lms") return "LMS"
  if (course.backing === "repobee") return "RepoBee"
  return null
}

function backingSortRank(course: CourseSummary): number {
  if (course.backing === "lms") return 0
  if (course.backing === "repobee") return 1
  return 2
}

export function CourseSwitcher() {
  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const setNewCourseDialogOpen = useUiStore((s) => s.setNewCourseDialogOpen)
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

  const handleCourseSelect = (id: string) => {
    if (id === activeCourseId) return
    setOpen(false)
    void switchCourse(id)
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

  const handleNewCourse = () => {
    setOpen(false)
    setNewCourseDialogOpen(true)
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
      const isActive = course.id === activeCourseId
      const badge = backingBadgeLabel(course)
      return (
        <div
          key={course.id}
          role="option"
          tabIndex={0}
          aria-selected={isActive}
          onClick={() => handleCourseSelect(course.id)}
          onKeyDown={(event) =>
            handleRowKeyDown(event, () => handleCourseSelect(course.id))
          }
          className={cn(
            "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
            "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
            isActive && "bg-selection",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{course.displayName}</span>
          {badge !== null && (
            <span className="shrink-0 rounded border border-border/70 px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
              {badge}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-0">
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

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="max-w-full min-w-0 overflow-hidden"
          >
            <span className="truncate">
              <span className="text-muted-foreground">Course:</span>{" "}
              {activeCourseName ?? "None"}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="bottom">
          {hasCourses && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Courses
              </div>
              {renderCourseRows(sortedCourses)}
              <DropdownMenuSeparator className="my-0.5" />
            </>
          )}

          <div
            role="option"
            tabIndex={0}
            aria-selected={false}
            onClick={handleNewCourse}
            onKeyDown={(event) => handleRowKeyDown(event, handleNewCourse)}
            className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
          >
            <Plus className="size-3" />
            New Course
          </div>
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
