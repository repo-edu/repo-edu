import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo-edu/ui/components/ui/alert-dialog"
import { listen } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import { useCallback, useEffect, useRef, useState } from "react"
import { toBackendFormat, toStoreFormat } from "./adapters/settingsAdapter"
import { ActionBar } from "./components/ActionBar"
import { GitConfigSection } from "./components/GitConfigSection"
import { LmsConfigSection } from "./components/LmsConfigSection"
import { LocalConfigSection } from "./components/LocalConfigSection"
import { OptionsSection } from "./components/OptionsSection"
import { OutputConfigSection } from "./components/OutputConfigSection"
import { OutputConsole } from "./components/OutputConsole"
import { RepoNamingSection } from "./components/RepoNamingSection"
import { SettingsSidebar } from "./components/SettingsSidebar"
import { TokenDialog } from "./components/TokenDialog"
import {
  CONSOLE_MIN_HEIGHT,
  DEFAULT_GUI_THEME,
  SETTINGS_MAX_HEIGHT_OFFSET,
  TAB_MIN_WIDTH,
} from "./constants"
import { useAppSettings } from "./hooks/useAppSettings"
import { useCloseGuard } from "./hooks/useCloseGuard"
import { useDirtyState } from "./hooks/useDirtyState"
import { useLmsActions } from "./hooks/useLmsActions"
import { useLoadSettings } from "./hooks/useLoadSettings"
import { useRepoActions } from "./hooks/useRepoActions"
import { useTheme } from "./hooks/useTheme"
import { useWindowState } from "./hooks/useWindowState"
import * as lmsService from "./services/lmsService"
import * as settingsService from "./services/settingsService"
import {
  useLmsFormStore,
  useOutputStore,
  useRepoFormStore,
  useUiStore,
} from "./stores"
import type { GuiSettings } from "./types/settings"
import { validateLmsGenerate, validateRepo } from "./validation/forms"
import "./App.css"

function App() {
  // Zustand stores
  const lmsForm = useLmsFormStore()
  const repoForm = useRepoFormStore()
  const ui = useUiStore()
  const output = useOutputStore()

  // Action hooks
  const { handleGenerateFiles } = useLmsActions()
  const { handleVerifyConfig, handleCreateRepos } = useRepoActions()

  // Keyboard shortcuts dialog
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)

  const getUiState = useCallback(
    () => ({
      activeTab: ui.activeTab,
      collapsedSections: ui.getCollapsedSectionsArray(),
      settingsMenuOpen: ui.settingsMenuOpen ?? false,
    }),
    [ui],
  )
  const getLogging = useCallback(
    () => repoForm.getState().logLevels,
    [repoForm],
  )

  const {
    currentGuiSettings,
    setCurrentGuiSettings,
    windowConfig,
    saveAppSettings,
  } = useAppSettings({ getUiState, getLogging })

  // Apply theme from settings
  useTheme(currentGuiSettings?.theme || DEFAULT_GUI_THEME)

  // Dirty state tracking
  const getLmsState = useCallback(() => lmsForm.getState(), [lmsForm])
  const getRepoState = useCallback(() => repoForm.getState(), [repoForm])
  const { isDirty, markClean, forceDirty } = useDirtyState({
    getLmsState,
    getRepoState,
  })

  const lmsGenerateValidation = validateLmsGenerate(lmsForm.getState())
  const repoValidation = validateRepo(repoForm.getState())

  // Max height for settings panel - content auto-fits up to this, then scrolls
  // Console gets remaining space with min-height set via CONSOLE_MIN_HEIGHT
  const settingsMaxHeight = `calc(100vh - ${SETTINGS_MAX_HEIGHT_OFFSET}px)`

  // Apply settings into stores/UI, optionally updating baseline
  const applySettings = (settings: GuiSettings, updateBaseline = true) => {
    setCurrentGuiSettings(settings)

    const storeFormats = toStoreFormat(settings)
    lmsForm.loadFromSettings(storeFormats.lms)
    repoForm.loadFromSettings(storeFormats.repo)

    // UI state - only apply on normal loads, not error recovery
    if (updateBaseline) {
      ui.setActiveTab(storeFormats.ui.activeTab)
      ui.setSettingsMenuOpen(storeFormats.ui.sidebarOpen)
      ui.setCollapsedSections(storeFormats.ui.collapsedSections)
    }

    if (updateBaseline) {
      markClean()
    }
  }

  // Load settings once on mount
  useLoadSettings({
    onLoaded: (settings) => applySettings(settings, true),
    onForceDirty: forceDirty,
    log: (msg) => output.appendWithNewline(msg),
  })

  const { saveWindowState } = useWindowState({
    config: windowConfig,
    onSave: () => saveAppSettings(),
  })

  // Save when active tab or collapsed sections change
  const uiInitializedRef = useRef(false)
  useEffect(() => {
    if (!uiInitializedRef.current) {
      uiInitializedRef.current = true
      return // Skip initial render
    }
    saveWindowState()
  }, [ui.activeTab, ui.collapsedSections, saveWindowState])

  // Close guard handling
  const { handlePromptDiscard, handlePromptCancel } = useCloseGuard({
    isDirty,
    onShowPrompt: ui.showClosePrompt,
    onHidePrompt: ui.hideClosePrompt,
    onSave: async () => {
      await saveSettingsToDisk()
    },
    onBeforeClose: saveWindowState,
  })

  // --- Settings load/save helpers ---
  const buildCurrentSettings = () => {
    return toBackendFormat(lmsForm.getState(), repoForm.getState(), {
      activeTab: ui.activeTab,
      collapsedSections: ui.getCollapsedSectionsArray(),
      sidebarOpen: ui.settingsMenuOpen ?? false,
      theme: currentGuiSettings?.theme || DEFAULT_GUI_THEME,
      windowWidth: currentGuiSettings?.window_width ?? 0,
      windowHeight: currentGuiSettings?.window_height ?? 0,
    })
  }

  const saveSettingsToDisk = useCallback(async () => {
    try {
      const settings = buildCurrentSettings()

      await settingsService.saveSettings(settings)
      markClean()

      const activeProfile = await settingsService.getActiveProfile()
      output.appendWithNewline(
        `✓ Settings saved to profile: ${activeProfile || "Default"}`,
      )
    } catch (error) {
      console.error("Failed to save settings:", error)
      output.appendWithNewline(`⚠ Failed to save settings: ${error}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markClean])

  // Keyboard shortcut (Cmd/Ctrl+S) and menu events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        saveSettingsToDisk()
      }
    }
    window.addEventListener("keydown", handleKeyDown)

    // Listen for menu events from Tauri
    const unlistenSave = listen("menu-save", () => {
      saveSettingsToDisk()
    })
    const unlistenShortcuts = listen("menu-keyboard-shortcuts", () => {
      setShortcutsDialogOpen(true)
    })

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      unlistenSave.then((unlisten) => unlisten())
      unlistenShortcuts.then((unlisten) => unlisten())
    }
  }, [saveSettingsToDisk])

  const handleBrowseFolder = async (setter: (path: string) => void) => {
    const selected = await open({ directory: true })
    if (selected) {
      setter(selected as string)
    }
  }

  const handleBrowseFile = async (setter: (path: string) => void) => {
    const selected = await open({ directory: false })
    if (selected) {
      setter(selected as string)
    }
  }

  const handleSettingsLoaded = (
    settings: GuiSettings,
    updateBaseline = true,
  ) => {
    applySettings(settings, updateBaseline)
    // Force dirty state by invalidating baselines
    if (!updateBaseline) {
      forceDirty()
    }
  }

  const handleToggleSettingsSidebar = async () => {
    const newState = !ui.settingsMenuOpen
    ui.setSettingsMenuOpen(newState)

    // Save to app.json
    await saveAppSettings({ sidebar_open: newState })
  }

  return (
    <div className="repobee-container">
      <div className="flex flex-1 min-h-0">
        <Tabs
          value={ui.activeTab}
          onValueChange={(v) => ui.setActiveTab(v as "lms" | "repo")}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
          style={{ minWidth: TAB_MIN_WIDTH }}
          size="compact"
        >
          <div className="flex items-center">
            <TabsList size="compact">
              <TabsTrigger value="lms" size="compact">
                LMS Import
              </TabsTrigger>
              <TabsTrigger value="repo" size="compact">
                Repository Setup
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto pr-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    onClick={handleToggleSettingsSidebar}
                  >
                    <span className="text-lg text-foreground">⚙</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle settings panel</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* LMS Import Tab */}
          <TabsContent value="lms" className="flex-1 flex flex-col min-h-0 p-1">
            <div className="flex-1 flex flex-col min-h-0 gap-1">
              {/* Settings - auto-fits content up to max, then scrolls */}
              <div
                className="overflow-auto space-y-1 shrink-0"
                style={{ maxHeight: settingsMaxHeight }}
              >
                <LmsConfigSection />
                <OutputConfigSection onBrowseFolder={handleBrowseFolder} />
                <RepoNamingSection />
              </div>

              <ActionBar
                right={
                  !lmsGenerateValidation.valid ? (
                    <span className="text-[11px] text-destructive">
                      {lmsGenerateValidation.errors[0]}
                      {lmsGenerateValidation.errors.length > 1
                        ? " (+ more)"
                        : ""}
                    </span>
                  ) : isDirty ? (
                    <span className="text-[11px] text-muted-foreground">
                      • Unsaved changes
                    </span>
                  ) : null
                }
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      onClick={handleGenerateFiles}
                      disabled={!lmsGenerateValidation.valid}
                    >
                      Generate Files
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Generate YAML/CSV/XLSX files from LMS data
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => output.clear()}
                    >
                      Clear History
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear console output</TooltipContent>
                </Tooltip>
              </ActionBar>

              {/* Console takes remaining space */}
              <OutputConsole
                className="flex-1"
                style={{ minHeight: `${CONSOLE_MIN_HEIGHT}px` }}
              />
            </div>
          </TabsContent>

          {/* Repository Setup Tab */}
          <TabsContent
            value="repo"
            className="flex-1 flex flex-col min-h-0 p-1"
          >
            <div className="flex-1 flex flex-col min-h-0 gap-1">
              {/* Settings - auto-fits content up to max, then scrolls */}
              <div
                className="overflow-auto space-y-1 shrink-0"
                style={{ maxHeight: settingsMaxHeight }}
              >
                <GitConfigSection />
                <LocalConfigSection
                  onBrowseFile={handleBrowseFile}
                  onBrowseFolder={handleBrowseFolder}
                />
                <OptionsSection />
              </div>

              <ActionBar
                right={
                  !repoValidation.valid ? (
                    <span className="text-[11px] text-destructive">
                      {repoValidation.errors[0]}
                      {repoValidation.errors.length > 1 ? " (+ more)" : ""}
                    </span>
                  ) : isDirty ? (
                    <span className="text-[11px] text-muted-foreground">
                      • Unsaved changes
                    </span>
                  ) : null
                }
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      disabled={!repoValidation.valid}
                      onClick={handleVerifyConfig}
                    >
                      Verify Config
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Verify Git platform configuration
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!repoValidation.valid}
                      onClick={handleCreateRepos}
                    >
                      Create Student Repos
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Create repositories for students
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!repoValidation.valid}
                    >
                      Clone
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clone student repositories</TooltipContent>
                </Tooltip>
              </ActionBar>

              {/* Console takes remaining space */}
              <OutputConsole
                className="flex-1"
                style={{ minHeight: `${CONSOLE_MIN_HEIGHT}px` }}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Settings Sidebar */}
        {ui.settingsMenuOpen && currentGuiSettings && (
          <SettingsSidebar
            onClose={handleToggleSettingsSidebar}
            currentSettings={currentGuiSettings}
            getSettings={buildCurrentSettings}
            onSettingsLoaded={handleSettingsLoaded}
            onMessage={(msg) => output.appendWithNewline(msg)}
            isDirty={isDirty}
            onSaved={markClean}
          />
        )}
      </div>

      {/* LMS Token Dialog */}
      <TokenDialog
        open={ui.lmsTokenDialogOpen}
        title="LMS Access Token"
        value={ui.lmsTokenDialogValue}
        onChange={(v) => ui.setLmsTokenDialogValue(v)}
        onClose={() => ui.closeLmsTokenDialog()}
        onSave={() => {
          lmsForm.setField("accessToken", ui.lmsTokenDialogValue)
          ui.closeLmsTokenDialog()
        }}
        instructions={
          <>
            <p>1. Log in to your Canvas instance</p>
            <p>2. Go to Account → Settings</p>
            <p>3. Scroll to "Approved Integrations"</p>
            <p>4. Click "+ New Access Token"</p>
          </>
        }
        actions={
          <Button
            size="xs"
            variant="outline"
            onClick={async () => {
              try {
                const lms = lmsForm.getState()
                const baseUrl =
                  lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl
                await lmsService.openTokenUrl(baseUrl, lms.lmsType)
                output.appendWithNewline("Opening LMS token page...")
              } catch (error) {
                output.appendWithNewline(
                  `✗ Failed to open token page: ${error}`,
                )
              }
            }}
          >
            Open token page
          </Button>
        }
      />

      <TokenDialog
        open={ui.tokenDialogOpen}
        title="Git Access Token"
        value={ui.tokenDialogValue}
        onChange={(v) => ui.setTokenDialogValue(v)}
        onClose={() => ui.closeTokenDialog()}
        onSave={() => {
          repoForm.setField("accessToken", ui.tokenDialogValue)
          ui.closeTokenDialog()
        }}
      />

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

      {/* Keyboard Shortcuts Dialog */}
      <AlertDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keyboard Shortcuts</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Save settings</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘S</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Close window</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘W</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Quit application</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">⌘Q</kbd>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button size="xs" onClick={() => setShortcutsDialogOpen(false)}>
              Close
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default App
