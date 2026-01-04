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
import { OutputConsole } from "./components/OutputConsole"
import { RosterTab, AssignmentTab, OperationTab } from "./components/tabs"
import { useTheme } from "./hooks/useTheme"
import { useLoadProfile } from "./hooks/useLoadProfile"
import { useDirtyState } from "./hooks/useDirtyState"
import { useCloseGuard } from "./hooks/useCloseGuard"
import { useAppSettingsStore } from "./stores/appSettingsStore"
import { useProfileSettingsStore } from "./stores/profileSettingsStore"
import { useUiStore, type ActiveTab } from "./stores/uiStore"
import { useOutputStore } from "./stores/outputStore"
import * as settingsService from "./services/settingsService"
import { CONSOLE_MIN_HEIGHT, DEFAULT_GUI_THEME } from "./constants"
import "./App.css"

function App() {
  // Stores
  const ui = useUiStore()
  const output = useOutputStore()
  const theme = useAppSettingsStore((state) => state.theme)
  const appSettingsStatus = useAppSettingsStore((state) => state.status)
  const loadAppSettings = useAppSettingsStore((state) => state.load)
  const saveProfile = useProfileSettingsStore((state) => state.save)

  // Apply theme
  useTheme(theme || DEFAULT_GUI_THEME)

  // Load profile when active profile changes
  useLoadProfile(ui.activeProfile)

  // Dirty state tracking
  const { isDirty, markClean } = useDirtyState()

  // Initialize app on mount
  useEffect(() => {
    async function initializeApp() {
      // Load app settings
      await loadAppSettings()

      // Get active profile
      const result = await settingsService.getActiveProfile()
      if (result) {
        ui.setActiveProfile(result)
      }
    }
    initializeApp()
  }, [loadAppSettings, ui])

  // Save handler
  const saveCurrentProfile = useCallback(async () => {
    if (!ui.activeProfile) {
      output.appendText("No active profile selected.", "warning")
      return
    }
    try {
      await saveProfile(ui.activeProfile)
      // Also save roster if needed
      markClean()
      output.appendText(
        `Settings saved to profile: ${ui.activeProfile}`,
        "success",
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.appendText(`Failed to save settings: ${message}`, "error")
    }
  }, [ui.activeProfile, saveProfile, markClean, output])

  // Close guard
  const { handlePromptDiscard, handlePromptCancel } = useCloseGuard({
    isDirty,
    onShowPrompt: ui.showClosePrompt,
    onHidePrompt: ui.hideClosePrompt,
    onSave: saveCurrentProfile,
  })

  // Keyboard shortcut (Cmd/Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        saveCurrentProfile()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [saveCurrentProfile])

  // Loading state
  if (appSettingsStatus === "loading") {
    return (
      <div className="repobee-container flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
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
          size="compact"
        >
          <div className="flex items-center border-b">
            <TabsList size="compact">
              <TabsTrigger value="roster" size="compact">
                Roster
              </TabsTrigger>
              <TabsTrigger value="assignment" size="compact">
                Assignment
              </TabsTrigger>
              <TabsTrigger value="operation" size="compact">
                Operation
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto pr-2 flex items-center gap-2">
              {isDirty && (
                <span className="text-xs text-muted-foreground">
                  Unsaved changes
                </span>
              )}
              <Button
                size="xs"
                onClick={saveCurrentProfile}
                disabled={!isDirty || !ui.activeProfile}
              >
                Save
              </Button>
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
    </div>
  )
}

export default App
