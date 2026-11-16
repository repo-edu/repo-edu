import {
  activeSurfaceEquals,
  type SubmissionFolderRecent,
} from "@repo-edu/domain/active-surface"
import type { CourseSummary } from "@repo-edu/domain/types"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import {
  ChevronDown,
  Copy,
  FolderOpen,
  Home,
  Pencil,
  Trash2,
  X,
} from "@repo-edu/ui/components/icons"
import { type KeyboardEvent, type MouseEvent, useMemo, useState } from "react"
import { useWorkflowClient } from "../contexts/workflow-client.js"
import { useCourses } from "../hooks/use-courses.js"
import { useOpenSubmissionFolder } from "../hooks/use-open-submission-folder.js"
import {
  selectActiveCourseId,
  selectActiveSurface,
  selectRecentAnalysisFolders,
  selectRecentSubmissionFolders,
} from "../session/selectors.js"
import {
  runSessionOperationBestEffort,
  useSessionController,
  useSessionControllerSelector,
} from "../session/session-controller-context.js"
import {
  bindSessionStart,
  type SessionStart,
} from "../session/session-start.js"
import {
  type CourseDialog,
  useGroupsViewStore,
} from "../stores/groups-view-store.js"
import { openSubmissionFolder } from "./tabs/examination/submission-file-listing.js"

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
  const controller = useSessionController()
  const workflowClient = useWorkflowClient()
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const activeCourseId = useSessionControllerSelector(selectActiveCourseId)
  const activeFolderPath =
    activeSurface.kind === "folder" ? activeSurface.path : null
  const activeSubmissionPath =
    activeSurface.kind === "submission" ? activeSurface.path : null
  const isHomeSurface = activeSurface.kind === "home"
  const recentFolders = useSessionControllerSelector(
    selectRecentAnalysisFolders,
  )
  const recentSubmissionFolders = useSessionControllerSelector(
    selectRecentSubmissionFolders,
  )
  const openCourseSubmissionFolder = useOpenSubmissionFolder()
  const { courses, switchCourse } = useCourses()
  const setCourseDialog = useGroupsViewStore((state) => state.setCourseDialog)
  const [open, setOpen] = useState(false)

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

  const handleCourseSelect = bindSessionStart(
    "courseOpen",
    (start: SessionStart, course: CourseSummary) => {
      const id = course.id
      if (
        activeSurfaceEquals(activeSurface, { kind: "course", courseId: id })
      ) {
        return
      }
      setOpen(false)
      runSessionOperationBestEffort(
        switchCourse(start, id),
        "course activation",
      )
    },
  )

  const handleRecentFolderSelect = bindSessionStart(
    "recentRepositories",
    (start: SessionStart, path: string) => {
      if (path === activeFolderPath) return
      setOpen(false)
      runSessionOperationBestEffort(
        controller.activateSurface(start, { kind: "folder", path }),
        "folder activation",
      )
    },
  )

  const handleRecentSubmissionSelect = bindSessionStart(
    "recentSubmission",
    (start: SessionStart, recent: SubmissionFolderRecent) => {
      setOpen(false)
      runSessionOperationBestEffort(
        workflowClient.execute(
          start,
          "analysis.listFolderFiles",
          async (scope) => {
            await openSubmissionFolder(scope, recent, "recent")
          },
        ),
        "submission activation",
      )
    },
  )

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

  const openCourseDialog = (dialog: CourseDialog) => {
    setOpen(false)
    setCourseDialog(dialog)
  }

  const handleHomeSelect = bindSessionStart("home", (start: SessionStart) => {
    if (isHomeSurface) {
      setOpen(false)
      return
    }
    setOpen(false)
    runSessionOperationBestEffort(
      controller.activateSurface(start, { kind: "home" }),
      "home activation",
    )
  })

  const handleRemoveRecentFolder = (path: string) => {
    controller.removeRecentFolder(path)
  }

  const handleRemoveRecentSubmissionFolder = (
    recent: SubmissionFolderRecent,
  ) => {
    controller.removeRecentSubmissionFolder(recent)
  }

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
                    setOpen(false)
                    void openCourseSubmissionFolder(course.id)
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
                  openCourseDialog({
                    kind: "duplicate",
                    courseId: course.id,
                    courseName: course.displayName,
                  }),
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
                  openCourseDialog({
                    kind: "rename",
                    courseId: course.id,
                    courseName: course.displayName,
                  }),
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
                  openCourseDialog({
                    kind: "delete",
                    courseId: course.id,
                    courseName: course.displayName,
                  }),
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
            aria-label={`Remove ${path} from recent repo folders`}
            title="Remove recent repo folder"
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
              Recent repo folders
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
  )
}
