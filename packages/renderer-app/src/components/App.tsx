import type { WorkflowClient } from "@repo-edu/application-contract"
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
import { Redo2, Undo2 } from "@repo-edu/ui/components/icons"
import { useEffect, useLayoutEffect } from "react"
import { configureApp } from "../configure-app.js"
import { RendererHostProvider } from "../contexts/renderer-host.js"
import { WorkflowClientProvider } from "../contexts/workflow-client.js"
import { useLoadCourse } from "../hooks/use-load-course.js"
import { useTheme } from "../hooks/use-theme.js"
import {
  selectAppSettingsActiveCourseId,
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
import { useUiStore } from "../stores/ui-store.js"
import type { ActiveTab } from "../types/index.js"
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
import { NewAnalysisDialog } from "./dialogs/NewAnalysisDialog.js"
import { NewAssignmentDialog } from "./dialogs/NewAssignmentDialog.js"
import { NewCourseDialog } from "./dialogs/NewCourseDialog.js"
import { NewLocalGroupSetDialog } from "./dialogs/NewLocalGroupSetDialog.js"
import { PreflightDialog } from "./dialogs/PreflightDialog.js"
import { StudentSyncDialog } from "./dialogs/StudentSyncDialog.js"
import { UsernameVerificationDialog } from "./dialogs/UsernameVerificationDialog.js"
import { ValidationDialog } from "./dialogs/ValidationDialog.js"
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

export function AppRoot({ workflowClient, rendererHost }: AppRootProps) {
  useLayoutEffect(() => {
    return configureApp({ workflowClient, rendererHost })
  }, [workflowClient, rendererHost])

  return (
    <WorkflowClientProvider value={workflowClient}>
      <RendererHostProvider value={rendererHost}>
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </RendererHostProvider>
    </WorkflowClientProvider>
  )
}

// Re-export kept for call-site below; canonical definition in utils/platform.
const hasMacDesktopBridge = hasMacDesktopInset

function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const activeDocumentKind = useUiStore((s) => s.activeDocumentKind)
  const activeCourseId = useUiStore((s) => s.activeCourseId)
  const activeAnalysisId = useUiStore((s) => s.activeAnalysisId)

  const theme = useAppSettingsStore(selectTheme)
  const appSettingsActiveCourseId = useAppSettingsStore(
    selectAppSettingsActiveCourseId,
  )
  const appSettingsActiveAnalysisId = useAppSettingsStore(
    (s) => s.settings.activeAnalysisId,
  )
  const appSettingsActiveDocumentKind = useAppSettingsStore(
    (s) => s.settings.activeDocumentKind,
  )
  const appSettingsActiveTab = useAppSettingsStore(selectAppSettingsActiveTab)
  const setAppSettingsActiveTab = useAppSettingsStore((s) => s.setActiveTab)
  const saveAppSettings = useAppSettingsStore((s) => s.save)
  const loadAppSettings = useAppSettingsStore((s) => s.load)

  const canUndo = useCourseStore(selectCanUndo)
  const canRedo = useCourseStore(selectCanRedo)
  const undoDescription = useCourseStore(selectNextUndoDescription)
  const redoDescription = useCourseStore(selectNextRedoDescription)
  const undo = useCourseStore((s) => s.undo)
  const redo = useCourseStore((s) => s.redo)
  const flushCourse = useCourseStore((s) => s.save)
  const leftInsetStyle = hasMacDesktopBridge()
    ? { paddingLeft: `${MAC_TRAFFIC_LIGHT_INSET_PX}px` }
    : undefined

  // Load app settings on mount.
  useEffect(() => {
    void loadAppSettings()
  }, [loadAppSettings])

  // Restore active document and tab from app settings after settings load.
  useEffect(() => {
    if (activeDocumentKind === null && appSettingsActiveDocumentKind !== null) {
      setActiveTab(appSettingsActiveTab)
      useUiStore.getState().setActiveDocumentKind(appSettingsActiveDocumentKind)
      if (appSettingsActiveDocumentKind === "analysis") {
        useUiStore.getState().setActiveAnalysisId(appSettingsActiveAnalysisId)
      } else {
        useUiStore.getState().setActiveCourseId(appSettingsActiveCourseId)
      }
    }
  }, [
    activeDocumentKind,
    appSettingsActiveDocumentKind,
    appSettingsActiveAnalysisId,
    appSettingsActiveCourseId,
    appSettingsActiveTab,
    setActiveTab,
  ])

  // Persist activeTab changes to app settings.
  useEffect(() => {
    if (activeTab !== appSettingsActiveTab) {
      setAppSettingsActiveTab(activeTab)
      void saveAppSettings()
    }
  }, [
    activeTab,
    appSettingsActiveTab,
    setAppSettingsActiveTab,
    saveAppSettings,
  ])

  // Apply theme.
  useTheme(theme)

  // Load the active document (course or analysis) when its identity changes.
  useLoadCourse(
    activeDocumentKind,
    activeDocumentKind === "analysis" ? activeAnalysisId : activeCourseId,
  )

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushCourse()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [flushCourse])

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
  }, [undo, redo])

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
            className="app-no-drag flex min-w-0 items-center"
            style={leftInsetStyle}
          >
            <CourseSwitcher />
          </div>
          <TabsList className="app-no-drag">
            {activeDocumentKind !== "analysis" && (
              <>
                <TabsTrigger value="roster">Roster</TabsTrigger>
                <TabsTrigger value="groups-assignments">Groups</TabsTrigger>
              </>
            )}
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>
          <div className="flex-1" />
          <div className="app-no-drag flex items-center gap-1 pr-2">
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
            <IssuesButton />
            <SettingsButton />
          </div>
        </div>

        <SyncErrorBanner />

        {/* Tab content */}
        <TabsContent value="roster" className="flex-1 min-h-0 overflow-hidden">
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
      <NewAnalysisDialog />
      <NewCourseDialog />
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
