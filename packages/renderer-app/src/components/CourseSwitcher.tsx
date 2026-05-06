/**
 * Document picker. Shows both standalone Analyses and full Courses with
 * per-document management (rename/delete, plus duplicate for courses) and a
 * trailing "New Analysis" / "New Course" pair.
 */

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
import { type KeyboardEvent, type MouseEvent, useEffect, useState } from "react"
import { useAnalyses } from "../hooks/use-analyses.js"
import { useCourses } from "../hooks/use-courses.js"
import { useUiStore } from "../stores/ui-store.js"

export function groupCourseSummaries(courses: readonly CourseSummary[]): {
  lms: CourseSummary[]
  repobee: CourseSummary[]
} {
  return {
    lms: courses.filter((course) => course.courseKind === "lms"),
    repobee: courses.filter((course) => course.courseKind === "repobee"),
  }
}

export function CourseSwitcher() {
  const activeDocumentKind = useUiStore((s) => s.activeDocumentKind)
  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const activeAnalysisId = useUiStore((s) => s.activeAnalysisId)
  const setNewCourseDialogMode = useUiStore((s) => s.setNewCourseDialogMode)
  const setNewAnalysisDialogOpen = useUiStore((s) => s.setNewAnalysisDialogOpen)
  const {
    courses,
    refresh: refreshCourses,
    switchCourse,
    duplicateCourse,
    renameCourse,
    deleteCourse,
  } = useCourses()
  const {
    analyses,
    refresh: refreshAnalyses,
    switchAnalysis,
    renameAnalysis,
    deleteAnalysis,
  } = useAnalyses()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void refreshCourses()
    void refreshAnalyses()
  }, [refreshCourses, refreshAnalyses])

  const activeDocumentName =
    activeDocumentKind === "analysis"
      ? (analyses.find((a) => a.id === activeAnalysisId)?.displayName ?? null)
      : activeDocumentKind === "course"
        ? (courses.find((c) => c.id === activeCourseId)?.displayName ?? null)
        : null

  const titleKindLabel =
    activeDocumentKind === "analysis"
      ? "Analysis:"
      : activeDocumentKind === "course"
        ? "Course:"
        : "Document:"

  // --- Rename dialog (works for either kind) ---
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    kind: "analysis" | "course"
    id: string
    currentName: string
    newName: string
  }>({ open: false, kind: "course", id: "", currentName: "", newName: "" })

  // --- Duplicate dialog (course only) ---
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

  // --- Delete dialog (works for either kind) ---
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    kind: "analysis" | "course"
    id: string
    name: string
  }>({ open: false, kind: "course", id: "", name: "" })

  const handleCourseSelect = (id: string) => {
    if (id === activeCourseId && activeDocumentKind === "course") return
    setOpen(false)
    void switchCourse(id)
  }

  const handleAnalysisSelect = (id: string) => {
    if (id === activeAnalysisId && activeDocumentKind === "analysis") return
    setOpen(false)
    void switchAnalysis(id)
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

  // --- Duplicate (course) ---
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
  const handleRenameClick = (
    kind: "analysis" | "course",
    id: string,
    name: string,
  ) => {
    setOpen(false)
    setRenameDialog({
      open: true,
      kind,
      id,
      currentName: name,
      newName: name,
    })
  }

  const handleRenameConfirm = async () => {
    const { kind, id, newName } = renameDialog
    if (kind === "course") {
      await renameCourse(id, newName)
    } else {
      await renameAnalysis(id, newName)
    }
    setRenameDialog({
      open: false,
      kind: "course",
      id: "",
      currentName: "",
      newName: "",
    })
  }

  // --- Delete ---
  const handleDeleteClick = (
    kind: "analysis" | "course",
    id: string,
    name: string,
  ) => {
    setOpen(false)
    setDeleteDialog({ open: true, kind, id, name })
  }

  const handleDeleteConfirm = async () => {
    if (deleteDialog.kind === "course") {
      await deleteCourse(deleteDialog.id)
    } else {
      await deleteAnalysis(deleteDialog.id)
    }
    setDeleteDialog({ open: false, kind: "course", id: "", name: "" })
  }

  const handleNewLmsCourse = () => {
    setOpen(false)
    setNewCourseDialogMode("lms")
  }

  const handleNewRepoBeeCourse = () => {
    setOpen(false)
    setNewCourseDialogMode("repobee")
  }

  const handleNewAnalysis = () => {
    setOpen(false)
    setNewAnalysisDialogOpen(true)
  }

  const canDuplicate = duplicateDialog.newCourseName.trim().length > 0

  const remainingCourses = courses.filter((p) => p.id !== deleteDialog.id)
  const isLastCourse =
    deleteDialog.kind === "course" && remainingCourses.length === 0
  const nextCourse = remainingCourses[0]?.displayName

  const courseGroups = groupCourseSummaries(courses)
  const hasDocuments = analyses.length > 0 || courses.length > 0
  const renderCourseRows = (rows: CourseSummary[]) =>
    rows.map((course) => {
      const isActive =
        course.id === activeCourseId && activeDocumentKind === "course"
      return (
        <div
          key={`c-${course.id}`}
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
                  handleRenameClick("course", course.id, course.displayName),
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
                  handleDeleteClick("course", course.id, course.displayName),
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
              <span className="text-muted-foreground">{titleKindLabel}</span>{" "}
              {activeDocumentName ?? "None"}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="bottom">
          {courseGroups.lms.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                LMS Courses
              </div>
              {renderCourseRows(courseGroups.lms)}
            </>
          )}

          {courseGroups.lms.length > 0 && courseGroups.repobee.length > 0 && (
            <DropdownMenuSeparator className="my-0.5" />
          )}

          {courseGroups.repobee.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                RepoBee Courses
              </div>
              {renderCourseRows(courseGroups.repobee)}
            </>
          )}

          {courses.length > 0 && analyses.length > 0 && (
            <DropdownMenuSeparator className="my-0.5" />
          )}

          {analyses.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Analyses
              </div>
              {analyses.map((analysis) => {
                const isActive =
                  analysis.id === activeAnalysisId &&
                  activeDocumentKind === "analysis"
                return (
                  <div
                    key={`a-${analysis.id}`}
                    role="option"
                    tabIndex={0}
                    aria-selected={isActive}
                    onClick={() => handleAnalysisSelect(analysis.id)}
                    onKeyDown={(event) =>
                      handleRowKeyDown(event, () =>
                        handleAnalysisSelect(analysis.id),
                      )
                    }
                    className={cn(
                      "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
                      "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                      isActive && "bg-selection",
                    )}
                  >
                    <span className="truncate">{analysis.displayName}</span>
                    <div className="flex shrink-0 items-center gap-0">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-4"
                        aria-label={`Rename ${analysis.displayName}`}
                        title="Rename"
                        onClick={(event) =>
                          handleActionClick(event, () =>
                            handleRenameClick(
                              "analysis",
                              analysis.id,
                              analysis.displayName,
                            ),
                          )
                        }
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-4"
                        aria-label={`Delete ${analysis.displayName}`}
                        title="Delete"
                        onClick={(event) =>
                          handleActionClick(event, () =>
                            handleDeleteClick(
                              "analysis",
                              analysis.id,
                              analysis.displayName,
                            ),
                          )
                        }
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {hasDocuments && <DropdownMenuSeparator className="my-0.5" />}

          <div
            role="option"
            tabIndex={0}
            aria-selected={false}
            onClick={handleNewLmsCourse}
            onKeyDown={(event) => handleRowKeyDown(event, handleNewLmsCourse)}
            className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
          >
            <Plus className="size-3" />
            New LMS Course
          </div>

          <div
            role="option"
            tabIndex={0}
            aria-selected={false}
            onClick={handleNewRepoBeeCourse}
            onKeyDown={(event) =>
              handleRowKeyDown(event, handleNewRepoBeeCourse)
            }
            className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
          >
            <Plus className="size-3" />
            New RepoBee Course
          </div>

          <div
            role="option"
            tabIndex={0}
            aria-selected={false}
            onClick={handleNewAnalysis}
            onKeyDown={(event) => handleRowKeyDown(event, handleNewAnalysis)}
            className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
          >
            <Plus className="size-3" />
            New Analysis
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
            <DialogTitle>
              Rename {renameDialog.kind === "analysis" ? "Analysis" : "Course"}
            </DialogTitle>
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
                  kind: "course",
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(nextOpen) =>
          setDeleteDialog((prev) => ({ ...prev, open: nextOpen }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteDialog.kind === "analysis" ? "Analysis" : "Course"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.kind === "course" && isLastCourse ? (
                <>
                  Delete &quot;{deleteDialog.name}&quot;? This is your last
                  course.
                </>
              ) : deleteDialog.kind === "course" &&
                deleteDialog.id === activeCourseId &&
                activeDocumentKind === "course" ? (
                <>
                  Delete &quot;{deleteDialog.name}&quot;? You will be switched
                  to &quot;{nextCourse}&quot;.
                </>
              ) : (
                <>Delete &quot;{deleteDialog.name}&quot;?</>
              )}
              {deleteDialog.kind === "course" && (
                <>
                  <br />
                  <br />
                  This will also delete the roster data associated with this
                  course.
                </>
              )}
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
