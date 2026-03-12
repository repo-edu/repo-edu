/**
 * CourseSwitcher — Dropdown-based course selector in the utility bar.
 * Shows all courses with per-course management actions (duplicate, rename,
 * delete) and a "New Course" action.
 */

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
  ChevronUp,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "@repo-edu/ui/components/icons"
import { type KeyboardEvent, type MouseEvent, useEffect, useState } from "react"
import { useCourses } from "../hooks/use-courses.js"
import { useUiStore } from "../stores/ui-store.js"

export function CourseSwitcher() {
  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const setNewCourseDialogOpen = useUiStore((s) => s.setNewCourseDialogOpen)
  const {
    courses,
    loading,
    refresh,
    switchCourse,
    duplicateCourse,
    renameCourse,
    deleteCourse,
  } = useCourses()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeDisplayName =
    courses.find((p) => p.id === activeCourseId)?.displayName ?? null

  // --- Rename dialog ---
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    courseId: string
    currentName: string
    newName: string
  }>({ open: false, courseId: "", currentName: "", newName: "" })

  // --- Duplicate dialog ---
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

  // --- Delete dialog ---
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    courseId: string
    courseName: string
  }>({ open: false, courseId: "", courseName: "" })

  const handleCourseSelect = (id: string) => {
    if (id === activeCourseId) return
    setOpen(false)
    void switchCourse(id)
  }

  const handleCourseKeyDown = (
    id: string,
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleCourseSelect(id)
    }
  }

  const handleActionClick = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation()
    action()
  }

  // --- Duplicate ---
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

  // --- Rename ---
  const handleRenameClick = (courseId: string, courseName: string) => {
    setOpen(false)
    setRenameDialog({
      open: true,
      courseId,
      currentName: courseName,
      newName: courseName,
    })
  }

  const handleRenameConfirm = async () => {
    const { courseId, newName } = renameDialog
    await renameCourse(courseId, newName)
    setRenameDialog({
      open: false,
      courseId: "",
      currentName: "",
      newName: "",
    })
  }

  // --- Delete ---
  const handleDeleteClick = (courseId: string, courseName: string) => {
    setOpen(false)
    setDeleteDialog({ open: true, courseId, courseName })
  }

  const handleDeleteConfirm = async () => {
    await deleteCourse(deleteDialog.courseId)
    setDeleteDialog({ open: false, courseId: "", courseName: "" })
  }

  // --- New course ---
  const handleNewCourse = () => {
    setOpen(false)
    setNewCourseDialogOpen(true)
  }

  const canDuplicate = duplicateDialog.newCourseName.trim().length > 0

  const courseToDelete = deleteDialog.courseId
  const remainingCourses = courses.filter((p) => p.id !== courseToDelete)
  const isLastCourse = remainingCourses.length === 0
  const nextCourse = remainingCourses[0]?.displayName

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
              {loading ? "Loading..." : (activeDisplayName ?? "None")}
            </span>
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="top">
          {courses.map((course) => {
            const isActive = course.id === activeCourseId
            return (
              <div
                key={course.id}
                role="option"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => handleCourseSelect(course.id)}
                onKeyDown={(event) => handleCourseKeyDown(course.id, event)}
                className={cn(
                  "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
                  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                  isActive && "bg-selection",
                )}
              >
                <span className="truncate">{course.displayName}</span>
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
          })}

          {courses.length > 0 && <DropdownMenuSeparator className="my-0.5" />}

          <div
            role="option"
            tabIndex={0}
            aria-selected={false}
            onClick={handleNewCourse}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                handleNewCourse()
              }
            }}
            className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
          >
            <Plus className="size-3" />
            New Course
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Duplicate Dialog */}
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

      {/* Rename Dialog */}
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
                  courseId: "",
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

      {/* Delete Confirmation Dialog */}
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
                  Delete &quot;{deleteDialog.courseName}&quot;? This is your
                  last course.
                </>
              ) : deleteDialog.courseId === activeCourseId ? (
                <>
                  Delete &quot;{deleteDialog.courseName}&quot;? You will be
                  switched to &quot;
                  {nextCourse}&quot;.
                </>
              ) : (
                <>Delete &quot;{deleteDialog.courseName}&quot;?</>
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
