import type { WorkflowClient } from "@repo-edu/application-contract"
import type { CourseBacking } from "@repo-edu/domain/types"
import type { RendererHost } from "@repo-edu/renderer-host-contract"
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo-edu/ui"
import { Home, Redo2, Undo2 } from "@repo-edu/ui/components/icons"
import { useEffect, useLayoutEffect, useMemo } from "react"
import { configureApp } from "../configure-app.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { resolveActiveSurfaceRedirectForCourses } from "../hooks/use-courses.js"
import { useTheme } from "../hooks/use-theme.js"
import {
  selectActiveCourseId,
  selectActiveSurface,
  selectActiveTab,
  selectBootstrapState,
} from "../session/selectors.js"
import { SessionController } from "../session/session-controller.js"
import {
  clearSessionController,
  SessionControllerProvider,
  setSessionController,
  useSessionController,
  useSessionControllerSelector,
} from "../session/session-controller-context.js"
import type { AppWorkflowId } from "../session/workflow-types.js"
import {
  selectTheme,
  useAppSettingsStore,
} from "../stores/app-settings-store.js"
import {
  selectCanRedo,
  selectCanUndo,
  selectNextRedoDescription,
  selectNextUndoDescription,
  useCourseStore,
} from "../stores/course-store.js"
import { selectCourseListLoaded, useUiStore } from "../stores/ui-store.js"
import type { ActiveTab } from "../types/index.js"
import {
  resolveTabVisibility,
  surfaceTabBacking,
} from "../utils/course-navigation.js"
import { isDocumentEditingSurface } from "../utils/history-boundary.js"
import {
  hasMacDesktopInset,
  MAC_TRAFFIC_LIGHT_INSET_PX,
} from "../utils/platform.js"
import { CourseSwitcher } from "./CourseSwitcher.js"
import { AddGroupDialog } from "./dialogs/AddGroupDialog.js"
import { ConnectLmsGroupSetDialog } from "./dialogs/ConnectLmsGroupSetDialog.js"
import { CopyGroupSetDialog } from "./dialogs/CopyGroupSetDialog.js"
import { DeleteGroupDialog } from "./dialogs/DeleteGroupDialog.js"
import { DeleteGroupSetDialog } from "./dialogs/DeleteGroupSetDialog.js"
import { ImportGitUsernamesDialog } from "./dialogs/ImportGitUsernamesDialog.js"
import { ImportGroupSetDialog } from "./dialogs/ImportGroupSetDialog.js"
import { ImportStudentsFromFileDialog } from "./dialogs/ImportStudentsFromFileDialog.js"
import { LmsImportConflictDialog } from "./dialogs/LmsImportConflictDialog.js"
import { NewAssignmentDialog } from "./dialogs/NewAssignmentDialog.js"
import { NewLocalGroupSetDialog } from "./dialogs/NewLocalGroupSetDialog.js"
import { PreflightDialog } from "./dialogs/PreflightDialog.js"
import { StudentSyncDialog } from "./dialogs/StudentSyncDialog.js"
import { UsernameVerificationDialog } from "./dialogs/UsernameVerificationDialog.js"
import { ValidationDialog } from "./dialogs/ValidationDialog.js"
import { HomeView } from "./HomeView.js"
import { IssuesButton } from "./IssuesButton.js"
import { SettingsButton } from "./SettingsButton.js"
import { SyncErrorBanner } from "./SyncErrorBanner.js"
import { SettingsSheet } from "./settings/SettingsSheet.js"
import { IssuesSheet } from "./sheets/IssuesSheet.js"
import { ToastStack } from "./ToastStack.js"
import { AnalysisTab } from "./tabs/AnalysisTab.js"
import { GroupsAssignmentsTab } from "./tabs/GroupsAssignmentsTab.js"
import { StudentsTab } from "./tabs/StudentsTab.js"

export type AppRootProps = {
  workflowClient: WorkflowClient
  rendererHost: RendererHost
}

export type RendererSessionRootProps = AppRootProps

export function RendererSessionRoot({
  workflowClient,
  rendererHost,
}: RendererSessionRootProps) {
  const controller = useMemo(
    () => new SessionController({ workflowClient }),
    [workflowClient],
  )
  const narrowedClient = workflowClient as WorkflowClient<AppWorkflowId>

  useLayoutEffect(() => {
    setSessionController(controller)
    const cleanup = configureApp({
      workflowClient: narrowedClient,
      rendererHost,
    })
    return () => {
      cleanup()
      clearSessionController(controller)
      controller.dispose()
    }
  }, [controller, narrowedClient, rendererHost])

  useEffect(() => {
    const bridge = getDesktopCloseFlushBridge()
    if (bridge?.onCloseFlushRequest !== undefined) {
      return bridge.onCloseFlushRequest(() => controller.flush())
    }

    const handleBeforeUnload = () => {
      void controller.flush()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [controller])

  return (
    <WorkflowClientProvider value={narrowedClient}>
      <RendererHostProvider value={rendererHost}>
        <SessionControllerProvider controller={controller}>
          <TooltipProvider>
            <AppView />
          </TooltipProvider>
        </SessionControllerProvider>
      </RendererHostProvider>
    </WorkflowClientProvider>
  )
}

export const AppRoot = RendererSessionRoot

function AppView() {
  const controller = useSessionController()
  const bootstrap = useSessionControllerSelector(selectBootstrapState)

  if (bootstrap.status !== "ready") {
    return (
      <BootstrapView
        state={bootstrap}
        onRetry={() => controller.retryBootstrap()}
      />
    )
  }

  return <AppShell />
}

function BootstrapView({
  state,
  onRetry,
}: {
  state: Exclude<ReturnType<typeof selectBootstrapState>, { status: "ready" }>
  onRetry: () => void
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md space-y-3">
        {state.status === "error" ? (
          <>
            <h1 className="text-base font-semibold">Settings could not load</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
            <Button type="button" onClick={onRetry}>
              Retry
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        )}
      </div>
    </div>
  )
}

// Re-export kept for call-site below; canonical definition in utils/platform.
const hasMacDesktopBridge = hasMacDesktopInset

type DesktopCloseFlushBridge = {
  onCloseFlushRequest?: (callback: () => Promise<void> | void) => () => void
}

function getDesktopCloseFlushBridge(): DesktopCloseFlushBridge | undefined {
  return (window as unknown as Record<string, unknown>).repoEduDesktopHost as
    | DesktopCloseFlushBridge
    | undefined
}

function AppShell() {
  const controller = useSessionController()
  const activeTab = useSessionControllerSelector(selectActiveTab)
  const activeSurface = useSessionControllerSelector(selectActiveSurface)
  const activeCourseId = useSessionControllerSelector(selectActiveCourseId)
  const courseList = useUiStore((s) => s.courseList)
  const courseListLoaded = useUiStore(selectCourseListLoaded)

  const theme = useAppSettingsStore(selectTheme)

  const isHomeSurface = activeSurface.kind === "home"
  const showHistoryControls = isDocumentEditingSurface(activeSurface, activeTab)
  const canUndo = useCourseStore(selectCanUndo)
  const canRedo = useCourseStore(selectCanRedo)
  const undoDescription = useCourseStore(selectNextUndoDescription)
  const redoDescription = useCourseStore(selectNextRedoDescription)
  const loadedCourse = useCourseStore((s) => s.course)
  const leftInsetStyle = hasMacDesktopBridge()
    ? { paddingLeft: `${MAC_TRAFFIC_LIGHT_INSET_PX}px` }
    : undefined
  const activeCourseSummary =
    activeCourseId === null
      ? null
      : (courseList.find((course) => course.id === activeCourseId) ?? null)
  const activeBacking: CourseBacking | undefined =
    activeCourseId === null
      ? undefined
      : loadedCourse?.id === activeCourseId
        ? loadedCourse.backing
        : activeCourseSummary !== null
          ? activeCourseSummary.backing
          : "lms"
  const tabBacking = surfaceTabBacking(activeSurface, activeBacking)
  const tabVisibility = resolveTabVisibility(tabBacking)
  const canShowRosterTab = tabVisibility.roster
  const canShowGroupsTab = tabVisibility.groupsAssignments
  const canShowAnalysisTab = tabVisibility.analysis

  // Apply theme.
  useTheme(theme)

  useEffect(() => {
    if (!courseListLoaded) return

    controller.pruneLoadedSubmissionFoldersForCourses(courseList)
    const redirect = resolveActiveSurfaceRedirectForCourses(
      activeSurface,
      courseList,
    )
    if (redirect === null) return
    void controller.activateSurface(redirect.surface)
  }, [activeSurface, controller, courseList, courseListLoaded])

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === ",") {
        e.preventDefault()
        useUiStore.getState().openSettings()
        return
      }

      // Skip undo/redo when focus is in an input or textarea.
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (!showHistoryControls) return

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        controller.undo()
        return
      }

      if ((e.key === "z" && e.shiftKey) || e.key === "Z") {
        e.preventDefault()
        controller.redo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [controller, showHistoryControls])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => controller.setActiveTab(v as ActiveTab)}
        className="flex flex-1 min-h-0 flex-col overflow-hidden gap-0"
      >
        {/* Header bar */}
        <div className="app-drag flex min-h-11 items-center gap-2 border-b px-2">
          <div
            className="app-no-drag flex min-w-0 items-center gap-1"
            style={leftInsetStyle}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-pressed={isHomeSurface}
                  onClick={() => {
                    if (isHomeSurface) return
                    void controller.activateSurface({ kind: "home" })
                  }}
                >
                  <Home className="size-[18px]" />
                  <span className="sr-only">Home</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Home</TooltipContent>
            </Tooltip>
            <CourseSwitcher />
          </div>
          {canShowAnalysisTab && (
            <TabsList className="app-no-drag">
              {canShowRosterTab && (
                <TabsTrigger value="roster">Roster</TabsTrigger>
              )}
              {canShowGroupsTab && (
                <TabsTrigger value="groups-assignments">Groups</TabsTrigger>
              )}
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
            </TabsList>
          )}
          <div className="flex-1" />
          <div className="app-no-drag flex items-center gap-1 pr-2">
            {showHistoryControls && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={!canUndo}
                      onClick={() => controller.undo()}
                    >
                      <Undo2 className="size-[18px]" />
                      <span className="sr-only">Undo</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {undoDescription
                      ? `Undo: ${undoDescription} (Ctrl+Z)`
                      : "Undo (Ctrl+Z)"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={!canRedo}
                      onClick={() => controller.redo()}
                    >
                      <Redo2 className="size-[18px]" />
                      <span className="sr-only">Redo</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {redoDescription
                      ? `Redo: ${redoDescription} (Ctrl+Shift+Z)`
                      : "Redo (Ctrl+Shift+Z)"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            <IssuesButton />
            <SettingsButton />
          </div>
        </div>

        <SyncErrorBanner />

        {activeSurface.kind === "home" ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <HomeView />
          </div>
        ) : (
          <>
            <TabsContent
              value="roster"
              className="flex-1 min-h-0 overflow-hidden"
            >
              <StudentsTab />
            </TabsContent>
            <TabsContent
              value="groups-assignments"
              className="flex-1 min-h-0 overflow-hidden"
            >
              <GroupsAssignmentsTab />
            </TabsContent>
            <TabsContent
              value="analysis"
              className="flex-1 min-h-0 overflow-hidden"
            >
              <AnalysisTab />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Assignment and group dialogs */}
      <NewAssignmentDialog />
      <ConnectLmsGroupSetDialog />
      <NewLocalGroupSetDialog />
      <ImportGroupSetDialog />
      <CopyGroupSetDialog />
      <DeleteGroupSetDialog />
      <DeleteGroupDialog />
      <AddGroupDialog />

      {/* Operation dialogs */}
      <ValidationDialog />
      <PreflightDialog />

      {/* Document and roster dialogs */}
      <StudentSyncDialog />
      <ImportStudentsFromFileDialog />
      <ImportGitUsernamesDialog />
      <UsernameVerificationDialog />
      <LmsImportConflictDialog />

      {/* Sheets */}
      <IssuesSheet />
      <SettingsSheet />

      <ToastStack />
    </div>
  )
}
