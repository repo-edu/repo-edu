import {
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import { Info, Redo2, Undo2 } from "@repo-edu/ui/components/icons"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo-edu/ui/components/ui/alert-dialog"
import { useCallback, useEffect } from "react"
import { commands } from "./bindings/commands"
import {
  AddGroupDialog,
  ChangeGroupSetDialog,
  ConnectLmsGroupSetDialog,
  CopyGroupSetDialog,
  DeleteGroupDialog,
  DeleteGroupSetDialog,
  ImportGitUsernamesDialog,
  ImportGroupSetDialog,
  ImportStudentsFromFileDialog,
  LmsImportConflictDialog,
  NewAssignmentDialog,
  NewLocalGroupSetDialog,
  NewProfileDialog,
  PreflightDialog,
  ReimportGroupSetDialog,
  RosterSyncDialog,
  StudentRemovalConfirmationDialog,
  UsernameVerificationDialog,
  ValidationDialog,
} from "./components/dialogs"
import { OutputConsole } from "./components/OutputConsole"
import { SettingsButton } from "./components/SettingsButton"
import { SettingsSheet } from "./components/settings"
import {
  AssignmentCoverageSheet,
  CoverageReportSheet,
  DataOverviewSheet,
  FileImportExportSheet,
  StudentEditorSheet,
} from "./components/sheets"
import { ToastStack } from "./components/ToastStack"
import {
  GroupsAssignmentsTab,
  OperationTab,
  RosterTab,
} from "./components/tabs"
import { UtilityBar } from "./components/UtilityBar"
import { DEFAULT_GUI_THEME } from "./constants"
import { useCloseGuard } from "./hooks/useCloseGuard"
import { useDirtyState } from "./hooks/useDirtyState"
import { useLoadProfile } from "./hooks/useLoadProfile"
import { useTheme } from "./hooks/useTheme"
import { listenEvent } from "./services/platform"
import * as settingsService from "./services/settingsService"
import { useAppSettingsStore } from "./stores/appSettingsStore"
import { useOutputStore } from "./stores/outputStore"
import {
  type ProfileLoadResult,
  selectCanRedo,
  selectCanUndo,
  selectNextRedoDescription,
  selectNextUndoDescription,
  useProfileStore,
} from "./stores/profileStore"
import { useToastStore } from "./stores/toastStore"
import {
  type ActiveTab,
  type ProfileListItem,
  useUiStore,
} from "./stores/uiStore"
import "./App.css"

function App() {
  // Stores
  const ui = useUiStore()
  const setActiveProfile = useUiStore((state) => state.setActiveProfile)
  const setDataOverviewOpen = useUiStore((state) => state.setDataOverviewOpen)
  const output = useOutputStore()
  const addToast = useToastStore((state) => state.addToast)
  const theme = useAppSettingsStore((state) => state.theme)
  const appSettingsStatus = useAppSettingsStore((state) => state.status)
  const loadAppSettings = useAppSettingsStore((state) => state.load)
  const save = useProfileStore((state) => state.save)
  const undo = useProfileStore((state) => state.undo)
  const redo = useProfileStore((state) => state.redo)
  const canUndo = useProfileStore(selectCanUndo)
  const canRedo = useProfileStore(selectCanRedo)
  const nextUndoDescription = useProfileStore(selectNextUndoDescription)
  const nextRedoDescription = useProfileStore(selectNextRedoDescription)

  // Apply theme
  useTheme(theme || DEFAULT_GUI_THEME)

  // Dirty state tracking (pass activeProfile to detect profile switches)
  const { isDirty, markClean, forceDirty } = useDirtyState(ui.activeProfile)

  const handleProfileLoad = useCallback(
    (result: ProfileLoadResult) => {
      if (!result.ok || result.warnings.length > 0) {
        forceDirty()
        return
      }
      markClean()
    },
    [forceDirty, markClean],
  )

  // Load profile when active profile changes
  useLoadProfile(ui.activeProfile, handleProfileLoad)

  // Profile list cache
  const setProfileList = useUiStore((state) => state.setProfileList)
  const setProfileListLoading = useUiStore(
    (state) => state.setProfileListLoading,
  )

  // Initialize app on mount
  useEffect(() => {
    async function initializeApp() {
      // Load app settings
      await loadAppSettings()

      // Get active profile
      const result = await settingsService.getActiveProfile()
      if (result) {
        setActiveProfile(result)
      }

      // Pre-load profile list (so Roster tab renders instantly)
      setProfileListLoading(true)
      try {
        const listResult = await commands.listProfiles()
        if (listResult.status === "ok") {
          const profileNames = listResult.data
          const profilesWithCourses: ProfileListItem[] = await Promise.all(
            profileNames.map(async (name) => {
              try {
                const res = await commands.loadProfileSettings(name)
                if (res.status === "ok") {
                  return {
                    name,
                    courseName:
                      res.data.settings.course.name || "No connected course",
                  }
                }
              } catch (e) {
                console.error(`Failed to load course for profile ${name}:`, e)
              }
              return { name, courseName: "No connected course" }
            }),
          )
          setProfileList(profilesWithCourses)
        }
      } catch (error) {
        console.error("Failed to load profiles:", error)
      } finally {
        setProfileListLoading(false)
      }
    }
    initializeApp()
  }, [loadAppSettings, setActiveProfile, setProfileList, setProfileListLoading])

  // Save handler
  const saveCurrentProfile = useCallback(async () => {
    if (!ui.activeProfile) {
      output.appendText("No active profile selected.", "warning")
      return
    }
    try {
      const success = await save(ui.activeProfile)
      if (success) {
        markClean()
        output.appendText(
          `Settings saved to profile: ${ui.activeProfile}`,
          "success",
        )
      } else {
        const error = useProfileStore.getState().error
        output.appendText(`Failed to save settings: ${error}`, "error")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.appendText(`Failed to save settings: ${message}`, "error")
    }
  }, [ui.activeProfile, save, markClean, output])

  const handleUndo = useCallback(() => {
    const entry = undo()
    if (entry) {
      addToast(`Undid: ${entry.description}`, { tone: "info" })
    }
  }, [undo, addToast])

  const handleRedo = useCallback(() => {
    const entry = redo()
    if (entry) {
      addToast(`Redid: ${entry.description}`, { tone: "info" })
    }
  }, [redo, addToast])

  // Close guard
  const { handlePromptDiscard, handlePromptCancel } = useCloseGuard({
    isDirty,
    onShowPrompt: ui.showClosePrompt,
    onHidePrompt: ui.hideClosePrompt,
    onSave: saveCurrentProfile,
  })

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const target = e.target as HTMLElement | null
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable

      if ((e.metaKey || e.ctrlKey) && key === "s") {
        e.preventDefault()
        saveCurrentProfile()
      }
      if ((e.metaKey || e.ctrlKey) && key === ",") {
        e.preventDefault()
        ui.openSettings()
      }
      if ((e.metaKey || e.ctrlKey) && key === "i") {
        e.preventDefault()
        setDataOverviewOpen(true)
      }
      if (isEditable) return
      if ((e.metaKey || e.ctrlKey) && key === "z" && e.shiftKey) {
        e.preventDefault()
        handleRedo()
      } else if ((e.metaKey || e.ctrlKey) && key === "z") {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [saveCurrentProfile, ui, handleUndo, handleRedo, setDataOverviewOpen])

  // Handle menu events
  useEffect(() => {
    let unlisten: (() => void) | undefined
    const setup = async () => {
      try {
        unlisten = await listenEvent("menu-keyboard-shortcuts", () => {
          ui.openSettings("shortcuts")
        })
      } catch (error) {
        console.error("Failed to register menu listener:", error)
      }
    }
    setup()
    return () => unlisten?.()
  }, [ui])

  // Loading state
  if (appSettingsStatus === "loading") {
    return (
      <div className="repobee-container flex items-center justify-center">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="repobee-container">
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel defaultSize={75} minSize={20}>
          <div className="flex h-full flex-col overflow-hidden">
            <Tabs
              value={ui.activeTab}
              onValueChange={(v) => ui.setActiveTab(v as ActiveTab)}
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
            >
              <div className="flex items-center border-b">
                <TabsList>
                  <TabsTrigger value="roster">Roster</TabsTrigger>
                  <TabsTrigger value="groups-assignments">
                    Groups & Assignments
                  </TabsTrigger>
                  <TabsTrigger value="operation">Operation</TabsTrigger>
                </TabsList>
                <div className="flex-1" />
                <div className="flex items-center gap-1 pr-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={handleUndo}
                        disabled={!canUndo}
                      >
                        <Undo2 className="size-4" />
                        <span className="sr-only">Undo</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {nextUndoDescription
                        ? `Undo: ${nextUndoDescription} (Ctrl+Z)`
                        : "Undo (Ctrl+Z)"}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={handleRedo}
                        disabled={!canRedo}
                      >
                        <Redo2 className="size-4" />
                        <span className="sr-only">Redo</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {nextRedoDescription
                        ? `Redo: ${nextRedoDescription} (Ctrl+Shift+Z)`
                        : "Redo (Ctrl+Shift+Z)"}
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setDataOverviewOpen(true)}
                    title="Data Overview (Ctrl+I)"
                  >
                    <Info className="size-4" />
                    <span className="sr-only">Data Overview</span>
                  </Button>
                  <SettingsButton />
                </div>
              </div>

              {/* Tab Content */}
              <TabsContent
                value="roster"
                className="flex-1 flex flex-col min-h-0 p-1"
              >
                <div className="flex-1 overflow-auto">
                  <RosterTab isDirty={isDirty} />
                </div>
              </TabsContent>

              <TabsContent
                value="groups-assignments"
                className="flex-1 flex flex-col min-h-0 p-1"
              >
                <div className="flex-1 overflow-auto">
                  <GroupsAssignmentsTab />
                </div>
              </TabsContent>

              <TabsContent
                value="operation"
                className="flex-1 flex flex-col min-h-0 p-1"
              >
                <div className="flex-1 overflow-auto">
                  <OperationTab />
                </div>
              </TabsContent>
            </Tabs>

            {/* Utility Bar */}
            <UtilityBar isDirty={isDirty} onSaved={markClean} />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={25} minSize={10}>
          <OutputConsole className="h-full" />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Close Confirmation Dialog */}
      <AlertDialog
        open={ui.closePromptVisible}
        onOpenChange={(open: boolean) => !open && handlePromptCancel()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Warning</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved changes will be lost when closing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button size="xs" variant="outline" onClick={handlePromptCancel}>
              Cancel
            </Button>
            <Button size="xs" onClick={handlePromptDiscard}>
              OK
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assignment Tab Dialogs */}
      <NewAssignmentDialog />
      <ChangeGroupSetDialog />

      {/* Group Set Dialogs */}
      <ConnectLmsGroupSetDialog />
      <NewLocalGroupSetDialog />
      <ImportGroupSetDialog />
      <ReimportGroupSetDialog />
      <CopyGroupSetDialog />
      <DeleteGroupSetDialog />
      <DeleteGroupDialog />

      {/* Group Dialogs */}
      <AddGroupDialog />

      {/* Legacy Sheets (to be updated in Phase 11-13) */}
      <FileImportExportSheet />

      {/* Operation Tab Dialogs */}
      <ValidationDialog />
      <PreflightDialog />

      {/* Profile Dialogs */}
      <NewProfileDialog />

      {/* Roster Tab Dialogs and Sheets */}
      <StudentEditorSheet />
      <CoverageReportSheet />
      <AssignmentCoverageSheet />
      <RosterSyncDialog />
      <ImportStudentsFromFileDialog />
      <ImportGitUsernamesDialog />
      <StudentRemovalConfirmationDialog />
      <LmsImportConflictDialog />
      <UsernameVerificationDialog />

      {/* Global Sheets */}
      <DataOverviewSheet />
      <SettingsSheet />

      <ToastStack />
    </div>
  )
}

export default App
