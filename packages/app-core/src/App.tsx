import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo-edu/ui"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo-edu/ui/components/ui/alert-dialog"
import { useCallback, useEffect } from "react"
import {
  AddGroupDialog,
  ClearRosterDialog,
  DeleteAssignmentDialog,
  EditAssignmentDialog,
  EditGroupDialog,
  ImportGitUsernamesDialog,
  ImportGroupsDialog,
  ImportGroupsFromFileDialog,
  ImportStudentsFromFileDialog,
  LmsImportConflictDialog,
  NewAssignmentDialog,
  NewProfileDialog,
  PreflightDialog,
  ReplaceGroupsConfirmationDialog,
  StudentRemovalConfirmationDialog,
  UsernameVerificationDialog,
  ValidationDialog,
} from "./components/dialogs"
import { OutputConsole } from "./components/OutputConsole"
import { SettingsButton } from "./components/SettingsButton"
import { SettingsSheet } from "./components/settings"
import {
  CoverageReportSheet,
  GroupEditorSheet,
  StudentEditorSheet,
} from "./components/sheets"
import { AssignmentTab, OperationTab, RosterTab } from "./components/tabs"
import { UtilityBar } from "./components/UtilityBar"
import { CONSOLE_MIN_HEIGHT, DEFAULT_GUI_THEME } from "./constants"
import { useCloseGuard } from "./hooks/useCloseGuard"
import { useDirtyState } from "./hooks/useDirtyState"
import { useLoadProfile } from "./hooks/useLoadProfile"
import { useTheme } from "./hooks/useTheme"
import { listenEvent } from "./services/platform"
import * as settingsService from "./services/settingsService"
import { useAppSettingsStore } from "./stores/appSettingsStore"
import { useOutputStore } from "./stores/outputStore"
import { type ProfileLoadResult, useProfileStore } from "./stores/profileStore"
import { type ActiveTab, useUiStore } from "./stores/uiStore"
import "./App.css"

function App() {
  // Stores
  const ui = useUiStore()
  const setActiveProfile = useUiStore((state) => state.setActiveProfile)
  const output = useOutputStore()
  const theme = useAppSettingsStore((state) => state.theme)
  const appSettingsStatus = useAppSettingsStore((state) => state.status)
  const loadAppSettings = useAppSettingsStore((state) => state.load)
  const save = useProfileStore((state) => state.save)

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
    }
    initializeApp()
  }, [loadAppSettings, setActiveProfile])

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
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        saveCurrentProfile()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault()
        ui.openSettings()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [saveCurrentProfile, ui])

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
      <div className="flex flex-1 min-h-0 flex-col">
        <Tabs
          value={ui.activeTab}
          onValueChange={(v) => ui.setActiveTab(v as ActiveTab)}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <div className="flex items-center border-b">
            <TabsList>
              <TabsTrigger value="roster">Roster</TabsTrigger>
              <TabsTrigger value="assignment">Assignment</TabsTrigger>
              <TabsTrigger value="operation">Operation</TabsTrigger>
            </TabsList>
            <div className="flex-1" />
            <div className="pr-2">
              <SettingsButton />
            </div>
          </div>

          {/* Tab Content */}
          <TabsContent
            value="roster"
            className="flex-1 flex flex-col min-h-0 p-1"
          >
            <div className="flex-1 overflow-auto">
              <RosterTab />
            </div>
          </TabsContent>

          <TabsContent
            value="assignment"
            className="flex-1 flex flex-col min-h-0 p-1"
          >
            <div className="flex-1 overflow-auto">
              <AssignmentTab />
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
        <UtilityBar
          isDirty={isDirty}
          onSaved={markClean}
          onProfileLoadResult={handleProfileLoad}
        />

        {/* Output Console */}
        <OutputConsole
          className="shrink-0"
          style={{ minHeight: `${CONSOLE_MIN_HEIGHT}px` }}
        />
      </div>

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
      <EditAssignmentDialog />
      <DeleteAssignmentDialog />

      {/* Group Editor Sheet and Dialogs */}
      <GroupEditorSheet />
      <AddGroupDialog />
      <EditGroupDialog />
      <ImportGroupsDialog />
      <ImportGroupsFromFileDialog />
      <ReplaceGroupsConfirmationDialog />

      {/* Operation Tab Dialogs */}
      <ValidationDialog />
      <PreflightDialog />

      {/* Profile Dialogs */}
      <NewProfileDialog />

      {/* Roster Tab Dialogs and Sheets */}
      <StudentEditorSheet />
      <CoverageReportSheet />
      <ImportStudentsFromFileDialog />
      <ImportGitUsernamesDialog />
      <StudentRemovalConfirmationDialog />
      <LmsImportConflictDialog />
      <UsernameVerificationDialog />
      <ClearRosterDialog />

      {/* Global Sheets */}
      <SettingsSheet />
    </div>
  )
}

export default App
