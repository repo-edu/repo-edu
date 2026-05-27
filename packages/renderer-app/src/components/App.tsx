import type { WorkflowClient } from "@repo-edu/application-contract"
import { activeCourseIdFromSurface } from "@repo-edu/domain/settings"
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
import { useEffect, useLayoutEffect, useState } from "react"
import { configureApp } from "../configure-app.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { useActiveSurfaceNavigation } from "../hooks/use-active-surface-navigation.js"
import {
  pruneLoadedSubmissionFoldersForCourses,
  resolveActiveSurfaceRedirectForCourses,
} from "../hooks/use-courses.js"
import { useLoadCourse } from "../hooks/use-load-course.js"
import { useTheme } from "../hooks/use-theme.js"
import {
  clearPersisterRegistry,
  createPersisterRegistry,
  type PersisterRegistry,
  PersisterRegistryProvider,
  setPersisterRegistry,
  usePersisterRegistry,
} from "../persistence/persister-registry.js"
import {
  selectAppSettingsActiveTab,
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
import {
  selectActiveCourseId,
  selectActiveSurface,
  selectCourseListLoaded,
  useUiStore,
} from "../stores/ui-store.js"
import type { ActiveTab } from "../types/index.js"
import {
  resolveSupportedActiveTab,
  resolveTabVisibility,
  surfaceTabBacking,
} from "../utils/course-navigation.js"
import { getErrorMessage } from "../utils/error-message.js"
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

type BootstrapState =
  | { status: "loading"; attempt: number }
  | { status: "ready"; attempt: number; registry: PersisterRegistry }
  | { status: "error"; attempt: number; message: string }

export function AppRoot({ workflowClient, rendererHost }: AppRootProps) {
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    status: "loading",
    attempt: 0,
  })

  useLayoutEffect(() => {
    return configureApp({ workflowClient, rendererHost })
  }, [workflowClient, rendererHost])

  useEffect(() => {
    let cancelled = false
    let registry: PersisterRegistry | null = null
    const attempt = bootstrap.attempt
    clearPersisterRegistry()
    setBootstrap((current) =>
      current.status === "loading" && current.attempt === attempt
        ? current
        : { status: "loading", attempt },
    )

    void (async () => {
      try {
        const settings = await workflowClient.run("settings.loadApp", undefined)
        if (cancelled) return

        useAppSettingsStore.getState().hydrate(settings)
        const restoredCourseId = activeCourseIdFromSurface(
          settings.activeSurface,
        )
        const restoredBacking = restoredCourseId === null ? undefined : "lms"
        useUiStore.getState().setActiveSurface(settings.activeSurface)
        useUiStore
          .getState()
          .setActiveTab(
            resolveSupportedActiveTab(
              settings.activeTab,
              surfaceTabBacking(settings.activeSurface, restoredBacking),
            ),
          )

        registry = createPersisterRegistry(workflowClient)
        setPersisterRegistry(registry)
        setBootstrap({
          status: "ready",
          attempt,
          registry,
        })
      } catch (error) {
        if (cancelled) return
        setBootstrap({
          status: "error",
          attempt,
          message: getErrorMessage(error, "Could not load app settings."),
        })
      }
    })()

    return () => {
      cancelled = true
      if (registry !== null) {
        registry.dispose()
        clearPersisterRegistry(registry)
      } else {
        clearPersisterRegistry()
      }
    }
  }, [bootstrap.attempt, workflowClient])

  return (
    <WorkflowClientProvider value={workflowClient}>
      <RendererHostProvider value={rendererHost}>
        <TooltipProvider>
          {bootstrap.status === "ready" ? (
            <PersisterRegistryProvider registry={bootstrap.registry}>
              <AppShell />
            </PersisterRegistryProvider>
          ) : (
            <BootstrapView
              state={bootstrap}
              onRetry={() =>
                setBootstrap((current) => ({
                  status: "loading",
                  attempt: current.attempt + 1,
                }))
              }
            />
          )}
        </TooltipProvider>
      </RendererHostProvider>
    </WorkflowClientProvider>
  )
}

function BootstrapView({
  state,
  onRetry,
}: {
  state: Exclude<BootstrapState, { status: "ready" }>
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

function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const activeSurface = useUiStore(selectActiveSurface)
  const activeCourseId = useUiStore(selectActiveCourseId)
  const courseList = useUiStore((s) => s.courseList)
  const courseListLoaded = useUiStore(selectCourseListLoaded)

  const theme = useAppSettingsStore(selectTheme)
  const appSettingsActiveTab = useAppSettingsStore(selectAppSettingsActiveTab)
  const setAppSettingsActiveTab = useAppSettingsStore((s) => s.setActiveTab)
  const persisterRegistry = usePersisterRegistry()

  const activateSurface = useActiveSurfaceNavigation()
  const isHomeSurface = activeSurface.kind === "home"
  const showHistoryControls = isDocumentEditingSurface(activeSurface, activeTab)
  const canUndo = useCourseStore(selectCanUndo)
  const canRedo = useCourseStore(selectCanRedo)
  const undoDescription = useCourseStore(selectNextUndoDescription)
  const redoDescription = useCourseStore(selectNextRedoDescription)
  const loadedCourse = useCourseStore((s) => s.course)
  const undo = useCourseStore((s) => s.undo)
  const redo = useCourseStore((s) => s.redo)
  const flushPersistedDocuments = persisterRegistry.flush
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

  // Persist activeTab changes to app settings.
  useEffect(() => {
    if (activeTab !== appSettingsActiveTab) {
      setAppSettingsActiveTab(activeTab)
    }
  }, [activeTab, appSettingsActiveTab, setAppSettingsActiveTab])

  useEffect(() => {
    const supportedTab = resolveSupportedActiveTab(activeTab, tabBacking)
    if (supportedTab !== activeTab) {
      setActiveTab(supportedTab)
    }
  }, [tabBacking, activeTab, setActiveTab])

  // Apply theme.
  useTheme(theme)

  useEffect(() => {
    if (!courseListLoaded) return

    pruneLoadedSubmissionFoldersForCourses(courseList)
    const redirect = resolveActiveSurfaceRedirectForCourses(
      activeSurface,
      courseList,
    )
    if (redirect === null) return
    void activateSurface(redirect.surface, {
      courseBacking: redirect.courseBacking,
      skipCourseFlush: true,
    })
  }, [activeSurface, activateSurface, courseList, courseListLoaded])

  // Load the active course when its identity changes.
  useLoadCourse(activeCourseId)

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushPersistedDocuments()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [flushPersistedDocuments])

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
        undo()
        return
      }

      if ((e.key === "z" && e.shiftKey) || e.key === "Z") {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [showHistoryControls, undo, redo])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ActiveTab)}
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
                    void activateSurface({ kind: "home" })
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
                      onClick={() => undo()}
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
                      onClick={() => redo()}
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
