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
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window"
import { open } from "@tauri-apps/plugin-dialog"
import { useCallback, useEffect, useRef, useState } from "react"
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
import { useCloseGuard } from "./hooks/useCloseGuard"
import { useLmsActions } from "./hooks/useLmsActions"
import { useLoadSettings } from "./hooks/useLoadSettings"
import { useRepoActions } from "./hooks/useRepoActions"
import { useTheme } from "./hooks/useTheme"
import * as lmsService from "./services/lmsService"
import * as settingsService from "./services/settingsService"
import {
  useLmsFormStore,
  useOutputStore,
  useRepoFormStore,
  useUiStore,
} from "./stores"
import type { GuiSettings } from "./types/settings"
import { hashSnapshot } from "./utils/snapshot"
import {
  validateLmsGenerate,
  validateLmsVerify,
  validateRepo,
} from "./validation/forms"
import "./App.css"

function App() {
  // Zustand stores
  const lmsForm = useLmsFormStore()
  const repoForm = useRepoFormStore()
  const ui = useUiStore()
  const output = useOutputStore()

  // Action hooks
  const { verifyLmsCourse, handleGenerateFiles } = useLmsActions()
  const { handleVerifyConfig, handleCreateRepos } = useRepoActions()

  // Keyboard shortcuts dialog
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)

  // Track last saved state for dirty checking (hashed snapshots)
  const [lastSavedHashes, setLastSavedHashes] = useState(() => ({
    lms: hashSnapshot(lmsForm.getState()),
    repo: hashSnapshot(repoForm.getState()),
  }))

  // Current GUI settings (for SettingsMenu)
  const [currentGuiSettings, setCurrentGuiSettings] =
    useState<GuiSettings | null>(null)

  // Apply theme from settings
  useTheme(currentGuiSettings?.theme || "system")

  // Compute dirty state
  const isDirty =
    hashSnapshot(lmsForm.getState()) !== lastSavedHashes.lms ||
    hashSnapshot(repoForm.getState()) !== lastSavedHashes.repo

  const lmsVerifyValidation = validateLmsVerify(lmsForm.getState())
  const lmsGenerateValidation = validateLmsGenerate(lmsForm.getState())
  const repoValidation = validateRepo(repoForm.getState())

  // Max height for settings panel - content auto-fits up to this, then scrolls
  // Console gets remaining space with min-height of 120px
  const settingsMaxHeight = "calc(100vh - 200px)"

  // Apply settings into stores/UI, optionally updating baseline
  const applySettings = (settings: GuiSettings, updateBaseline = true) => {
    setCurrentGuiSettings(settings)

    // Load LMS form from nested lms settings
    const lms = settings.lms
    lmsForm.loadFromSettings({
      lmsType: (lms.type || "Canvas") as "Canvas" | "Moodle",
      baseUrl: lms.base_url || "https://canvas.tue.nl",
      customUrl: lms.custom_url || "",
      urlOption:
        lms.type !== "Canvas"
          ? "CUSTOM"
          : ((lms.url_option || "TUE") as "TUE" | "CUSTOM"),
      accessToken: lms.access_token || "",
      courseId: lms.course_id || "",
      courseName: lms.course_name || "",
      yamlFile: lms.yaml_file || "students.yaml",
      outputFolder: lms.output_folder || "",
      csvFile: lms.csv_file || "student-info.csv",
      xlsxFile: lms.xlsx_file || "student-info.xlsx",
      memberOption: (lms.member_option || "(email, gitid)") as
        | "(email, gitid)"
        | "email"
        | "git_id",
      includeGroup: lms.include_group ?? true,
      includeMember: lms.include_member ?? true,
      includeInitials: lms.include_initials ?? false,
      fullGroups: lms.full_groups ?? true,
      csv: lms.output_csv ?? false,
      xlsx: lms.output_xlsx ?? false,
      yaml: lms.output_yaml ?? true,
    })

    // Load Repo form from nested common + repo settings
    const common = settings.common
    const repo = settings.repo
    const logging = settings.logging
    repoForm.loadFromSettings({
      accessToken: common.git_access_token || "",
      user: common.git_user || "",
      baseUrl: common.git_base_url || "https://gitlab.tue.nl",
      studentReposGroup: repo.student_repos_group || "",
      templateGroup: repo.template_group || "",
      yamlFile: repo.yaml_file || "",
      targetFolder: repo.target_folder || "",
      assignments: repo.assignments || "",
      directoryLayout: (repo.directory_layout || "flat") as
        | "by-team"
        | "flat"
        | "by-task",
      logLevels: {
        info: logging?.info ?? true,
        debug: logging?.debug ?? false,
        warning: logging?.warning ?? true,
        error: logging?.error ?? true,
      },
    })

    // UI state - only apply on normal loads, not error recovery
    if (updateBaseline) {
      ui.setActiveTab(settings.active_tab === "repo" ? "repo" : "lms")
      ui.setSettingsMenuOpen(settings.sidebar_open ?? false)
    }

    if (updateBaseline) {
      setLastSavedHashes({
        lms: hashSnapshot(lmsForm.getState()),
        repo: hashSnapshot(repoForm.getState()),
      })
    }
  }

  // Load settings once on mount
  useLoadSettings({
    onLoaded: (settings) => applySettings(settings, true),
    setBaselines: setLastSavedHashes,
    lmsState: () => lmsForm.getState(),
    repoState: () => repoForm.getState(),
    log: (msg) => output.appendWithNewline(msg),
  })

  // Restore window size from settings, then show window
  const windowRestoredRef = useRef(false)
  useEffect(() => {
    if (!currentGuiSettings || windowRestoredRef.current) return
    windowRestoredRef.current = true

    const win = getCurrentWindow()
    const { window_width, window_height } = currentGuiSettings

    const restoreAndShow = async () => {
      if (window_width > 100 && window_height > 100) {
        await win.setSize(new PhysicalSize(window_width, window_height))
        await win.center()
      }
      await win.show()
    }

    restoreAndShow().catch((e) => console.error("Failed to restore window", e))
  }, [currentGuiSettings])

  const saveWindowState = useCallback(async () => {
    // Don't save until settings are loaded
    if (!currentGuiSettings) return

    const win = getCurrentWindow()
    try {
      const size = await win.innerSize()
      await settingsService.saveAppSettings({
        theme: currentGuiSettings?.theme ?? "system",
        active_tab: ui.activeTab === "repo" ? "repo" : "lms",
        sidebar_open: ui.settingsMenuOpen ?? false,
        window_width: size.width,
        window_height: size.height,
        logging: currentGuiSettings?.logging ?? {
          info: true,
          debug: false,
          warning: true,
          error: true,
        },
      })
    } catch (error) {
      console.error("Failed to save window state:", error)
    }
  }, [currentGuiSettings, ui.activeTab, ui.settingsMenuOpen])

  // Save window size on resize (debounced)
  useEffect(() => {
    const win = getCurrentWindow()

    let debounce: number | undefined
    const scheduleSave = () => {
      if (debounce) {
        clearTimeout(debounce)
      }
      debounce = window.setTimeout(() => {
        saveWindowState()
      }, 300)
    }

    const unlistenResize = win.onResized(scheduleSave)

    return () => {
      unlistenResize.then((fn) => fn())
      if (debounce) clearTimeout(debounce)
    }
  }, [saveWindowState])

  // Save when active tab changes
  const tabInitializedRef = useRef(false)
  useEffect(() => {
    if (!tabInitializedRef.current) {
      tabInitializedRef.current = true
      return // Skip initial render
    }
    saveWindowState()
  }, [ui.activeTab, saveWindowState])

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
  const buildCurrentSettings = (): GuiSettings => {
    const lmsState = lmsForm.getState()
    const repoState = repoForm.getState()
    return {
      // Common settings (shared git credentials)
      common: {
        git_base_url: repoState.baseUrl,
        git_access_token: repoState.accessToken,
        git_user: repoState.user,
      },
      // LMS settings
      lms: {
        type: lmsState.lmsType as "Canvas" | "Moodle",
        base_url: lmsState.baseUrl,
        custom_url: lmsState.customUrl,
        url_option: lmsState.urlOption as "TUE" | "CUSTOM",
        access_token: lmsState.accessToken,
        course_id: lmsState.courseId,
        course_name: lmsState.courseName,
        yaml_file: lmsState.yamlFile,
        output_folder: lmsState.outputFolder,
        csv_file: lmsState.csvFile,
        xlsx_file: lmsState.xlsxFile,
        member_option: lmsState.memberOption as
          | "(email, gitid)"
          | "email"
          | "git_id",
        include_group: lmsState.includeGroup,
        include_member: lmsState.includeMember,
        include_initials: lmsState.includeInitials,
        full_groups: lmsState.fullGroups,
        output_csv: lmsState.csv,
        output_xlsx: lmsState.xlsx,
        output_yaml: lmsState.yaml,
      },
      // Repo settings
      repo: {
        student_repos_group: repoState.studentReposGroup,
        template_group: repoState.templateGroup,
        yaml_file: repoState.yamlFile,
        target_folder: repoState.targetFolder,
        assignments: repoState.assignments,
        directory_layout: repoState.directoryLayout as
          | "flat"
          | "by-team"
          | "by-task",
      },
      // App settings
      active_tab: ui.activeTab,
      theme: currentGuiSettings?.theme || "system",
      sidebar_open: ui.settingsMenuOpen ?? false,
      window_width: currentGuiSettings?.window_width ?? 0,
      window_height: currentGuiSettings?.window_height ?? 0,
      logging: {
        info: repoState.logLevels.info,
        debug: repoState.logLevels.debug,
        warning: repoState.logLevels.warning,
        error: repoState.logLevels.error,
      },
    }
  }

  const saveSettingsToDisk = useCallback(async () => {
    try {
      const settings = buildCurrentSettings()

      await settingsService.saveSettings(settings)

      setLastSavedHashes({
        lms: hashSnapshot(lmsForm.getState()),
        repo: hashSnapshot(repoForm.getState()),
      })

      const activeProfile = await settingsService.getActiveProfile()
      output.appendWithNewline(
        `✓ Settings saved to profile: ${activeProfile || "Default"}`,
      )
    } catch (error) {
      console.error("Failed to save settings:", error)
      output.appendWithNewline(`⚠ Failed to save settings: ${error}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setLastSavedHashes({ lms: 0, repo: 0 })
    }
  }

  const handleToggleSettingsSidebar = async () => {
    const newState = !ui.settingsMenuOpen
    ui.setSettingsMenuOpen(newState)

    // Save to app.json
    if (currentGuiSettings) {
      try {
        await settingsService.saveAppSettings({
          theme: currentGuiSettings.theme,
          active_tab: currentGuiSettings.active_tab,
          sidebar_open: newState,
          window_width: currentGuiSettings.window_width,
          window_height: currentGuiSettings.window_height,
          logging: currentGuiSettings.logging,
        })
      } catch (error) {
        console.error("Failed to save sidebar state:", error)
      }
    }
  }

  return (
    <div className="repobee-container">
      <div className="flex flex-1 min-h-0">
        <Tabs
          value={ui.activeTab}
          onValueChange={(v) => ui.setActiveTab(v as "lms" | "repo")}
          className="flex-1 flex flex-col min-h-0 min-w-[400px] overflow-hidden"
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
                <LmsConfigSection
                  onVerify={verifyLmsCourse}
                  verifyDisabled={!lmsVerifyValidation.valid}
                />
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
              <OutputConsole className="flex-1 min-h-[120px]" />
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
              <OutputConsole className="flex-1 min-h-[120px]" />
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
            onSaved={() => {
              setLastSavedHashes({
                lms: hashSnapshot(lmsForm.getState()),
                repo: hashSnapshot(repoForm.getState()),
              })
            }}
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
