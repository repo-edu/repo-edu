import { useEffect, useState, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@repo-edu/ui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@repo-edu/ui/components/ui/alert-dialog";
import {
  useLmsFormStore,
  useRepoFormStore,
  useUiStore,
  useOutputStore,
} from "./stores";
import { type GuiSettings, DEFAULT_GUI_SETTINGS } from "./types/settings";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { ActionBar } from "./components/ActionBar";
import { TokenDialog } from "./components/TokenDialog";
import { LmsConfigSection } from "./components/LmsConfigSection";
import { OutputConfigSection } from "./components/OutputConfigSection";
import { RepoNamingSection } from "./components/RepoNamingSection";
import { GitConfigSection } from "./components/GitConfigSection";
import { LocalConfigSection } from "./components/LocalConfigSection";
import { OptionsSection } from "./components/OptionsSection";
import { OutputConsole } from "./components/OutputConsole";
import * as settingsService from "./services/settingsService";
import * as lmsService from "./services/lmsService";
import { hashSnapshot } from "./utils/snapshot";
import { useCloseGuard } from "./hooks/useCloseGuard";
import { useLoadSettings } from "./hooks/useLoadSettings";
import { useTheme } from "./hooks/useTheme";
import { useLmsActions } from "./hooks/useLmsActions";
import { useRepoActions } from "./hooks/useRepoActions";
import { validateLms, validateRepo } from "./validation/forms";
import "./App.css";

function App() {
  // Zustand stores
  const lmsForm = useLmsFormStore();
  const repoForm = useRepoFormStore();
  const ui = useUiStore();
  const output = useOutputStore();

  // Action hooks
  const { verifyLmsCourse, handleGenerateFiles } = useLmsActions();
  const { handleVerifyConfig, handleCreateRepos } = useRepoActions();

  // Track last saved state for dirty checking (hashed snapshots)
  const [lastSavedHashes, setLastSavedHashes] = useState(() => ({
    lms: hashSnapshot(lmsForm.getState()),
    repo: hashSnapshot(repoForm.getState()),
  }));

  // Current GUI settings (for SettingsMenu)
  const [currentGuiSettings, setCurrentGuiSettings] = useState<GuiSettings | null>(null);

  // Apply theme from settings
  useTheme(currentGuiSettings?.theme || "system");

  // Compute dirty state
  const isDirty =
    hashSnapshot(lmsForm.getState()) !== lastSavedHashes.lms ||
    hashSnapshot(repoForm.getState()) !== lastSavedHashes.repo;

  const lmsValidation = validateLms(lmsForm.getState());
  const repoValidation = validateRepo(repoForm.getState());

  // Settings panel height (pixels) - console takes remaining space via flex
  const [settingsHeight, setSettingsHeight] = useState(400);
  const dragRef = useRef<{ startY: number; startH: number; maxH: number } | null>(null);
  const lmsScrollRef = useRef<HTMLDivElement | null>(null);
  const repoScrollRef = useRef<HTMLDivElement | null>(null);

  const getActiveScrollRef = () =>
    ui.activeTab === "lms" ? lmsScrollRef.current : repoScrollRef.current;

  const measureContentHeight = (el: HTMLDivElement | null) => {
    if (!el) return 0;
    const prev = el.style.height;
    el.style.height = "auto";
    const h = el.scrollHeight;
    el.style.height = prev;
    return h;
  };

  // Clamp settings height when switching tabs to avoid empty space
  useEffect(() => {
    // Delay to allow new tab content to render and measure correctly
    const timer = requestAnimationFrame(() => {
      const el = getActiveScrollRef();
      const maxH = measureContentHeight(el);
      if (maxH > 0) {
        setSettingsHeight((prev) => Math.min(prev, maxH));
      }
    });
    return () => cancelAnimationFrame(timer);
  }, [ui.activeTab]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientY - dragRef.current.startY;
      // Dragging down = increase settings height, up = decrease
      // Cap at content height (maxH) to prevent empty space
      const next = Math.min(
        Math.max(dragRef.current.startH + delta, 100),
        dragRef.current.maxH
      );
      setSettingsHeight(next);
    };
    const handleUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const beginDrag = (e: React.MouseEvent) => {
    const el = getActiveScrollRef();
    const maxH = measureContentHeight(el) || 800;
    dragRef.current = {
      startY: e.clientY,
      startH: settingsHeight,
      maxH,
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  // Apply settings into stores/UI, optionally updating baseline
  const applySettings = (settings: GuiSettings, updateBaseline = true) => {
    setCurrentGuiSettings(settings);

    // Load LMS form
    lmsForm.loadFromSettings({
      lmsType: (settings.lms_type || "Canvas") as "Canvas" | "Moodle",
      baseUrl: settings.lms_base_url || "https://canvas.tue.nl",
      customUrl: settings.lms_custom_url || "",
      urlOption:
        settings.lms_type !== "Canvas"
          ? "CUSTOM"
          : ((settings.lms_url_option || "TUE") as "TUE" | "CUSTOM"),
      accessToken: settings.lms_access_token || "",
      courseId: settings.lms_course_id || "",
      courseName: settings.lms_course_name || "",
      yamlFile: settings.lms_yaml_file || "students.yaml",
      infoFileFolder: settings.lms_info_folder || "",
      csvFile: settings.lms_csv_file || "student-info.csv",
      xlsxFile: settings.lms_xlsx_file || "student-info.xlsx",
      memberOption: (settings.lms_member_option || "(email, gitid)") as
        | "(email, gitid)"
        | "email"
        | "git_id",
      includeGroup: settings.lms_include_group ?? true,
      includeMember: settings.lms_include_member ?? true,
      includeInitials: settings.lms_include_initials ?? false,
      fullGroups: settings.lms_full_groups ?? true,
      csv: settings.lms_output_csv ?? false,
      xlsx: settings.lms_output_xlsx ?? false,
      yaml: settings.lms_output_yaml ?? true,
    });

    // Load Repo form
    repoForm.loadFromSettings({
      accessToken: settings.git_access_token || "",
      user: settings.git_user || "",
      baseUrl: settings.git_base_url || "https://gitlab.tue.nl",
      studentReposGroup: settings.git_student_repos_group || "",
      templateGroup: settings.git_template_group || "",
      yamlFile: settings.yaml_file || "",
      targetFolder: settings.target_folder || "",
      assignments: settings.assignments || "",
      directoryLayout: (settings.directory_layout || "flat") as "by-team" | "flat" | "by-task",
      logLevels: {
        info: settings.log_info ?? true,
        debug: settings.log_debug ?? false,
        warning: settings.log_warning ?? true,
        error: settings.log_error ?? true,
      },
    });

    // UI state
    ui.setActiveTab(settings.active_tab === "repo" ? "repo" : "lms");
    ui.setConfigLocked(settings.config_locked ?? true);
    ui.setOptionsLocked(settings.options_locked ?? true);
    ui.setSettingsMenuOpen(settings.sidebar_open ?? false);

    if (updateBaseline) {
      setLastSavedHashes({
        lms: hashSnapshot(lmsForm.getState()),
        repo: hashSnapshot(repoForm.getState()),
      });
    }
  };

  // Load settings once on mount
  useLoadSettings({
    onLoaded: (settings) => applySettings(settings, true),
    setBaselines: setLastSavedHashes,
    lmsState: () => lmsForm.getState(),
    repoState: () => repoForm.getState(),
    log: (msg) => output.appendWithNewline(msg),
  });

  // Restore window size from settings, then show window
  const windowRestoredRef = useRef(false);
  useEffect(() => {
    if (!currentGuiSettings || windowRestoredRef.current) return;
    windowRestoredRef.current = true;

    const win = getCurrentWindow();
    const { window_width, window_height } = currentGuiSettings;

    const restoreAndShow = async () => {
      if (window_width > 100 && window_height > 100) {
        await win.setSize(new PhysicalSize(window_width, window_height));
        await win.center();
      }
      await win.show();
    };

    restoreAndShow().catch((e) => console.error("Failed to restore window", e));
  }, [currentGuiSettings]);

  const saveWindowState = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      const size = await win.innerSize();
      await settingsService.saveAppSettings({
        theme: currentGuiSettings?.theme ?? "system",
        active_tab: ui.activeTab === "repo" ? "repo" : "lms",
        config_locked: ui.configLocked,
        options_locked: ui.optionsLocked,
        sidebar_open: ui.settingsMenuOpen ?? false,
        window_width: size.width,
        window_height: size.height,
      });
    } catch (error) {
      console.error("Failed to save window state:", error);
    }
  }, [currentGuiSettings?.theme, ui.activeTab, ui.configLocked, ui.optionsLocked, ui.settingsMenuOpen]);

  // Save window size on close and on resize (debounced)
  useEffect(() => {
    const win = getCurrentWindow();

    const unlistenClose = win.onCloseRequested(async (event) => {
      event.preventDefault();
      await saveWindowState();
      await win.destroy();
    });

    let debounce: number | undefined;
    const scheduleSave = () => {
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = window.setTimeout(() => {
        saveWindowState();
      }, 300);
    };

    const unlistenResize = win.onResized(scheduleSave);

    return () => {
      unlistenClose.then((fn) => fn());
      unlistenResize.then((fn) => fn());
      if (debounce) clearTimeout(debounce);
    };
  }, [saveWindowState]);

  // Close guard handling
  const { handlePromptDiscard, handlePromptCancel } = useCloseGuard({
    isDirty,
    onShowPrompt: ui.showClosePrompt,
    onHidePrompt: ui.hideClosePrompt,
    onSave: async () => {
      await saveSettingsToDisk();
    },
  });

  // --- Settings load/save helpers ---
  const saveSettingsToDisk = async () => {
    try {
      const lms = lmsForm.getState();
      const repo = repoForm.getState();

      const settings = {
        lms_type: lms.lmsType,
        lms_base_url: lms.baseUrl,
        lms_custom_url: lms.customUrl,
        lms_url_option: lms.urlOption,
        lms_access_token: lms.accessToken,
        lms_course_id: lms.courseId,
        lms_course_name: lms.courseName,
        lms_yaml_file: lms.yamlFile,
        lms_info_folder: lms.infoFileFolder,
        lms_csv_file: lms.csvFile,
        lms_xlsx_file: lms.xlsxFile,
        lms_member_option: lms.memberOption,
        lms_include_group: lms.includeGroup,
        lms_include_member: lms.includeMember,
        lms_include_initials: lms.includeInitials,
        lms_full_groups: lms.fullGroups,
        lms_output_csv: lms.csv,
        lms_output_xlsx: lms.xlsx,
        lms_output_yaml: lms.yaml,
        git_base_url: repo.baseUrl,
        git_access_token: repo.accessToken,
        git_user: repo.user,
        git_student_repos_group: repo.studentReposGroup,
        git_template_group: repo.templateGroup,
        yaml_file: repo.yamlFile,
        target_folder: repo.targetFolder,
        assignments: repo.assignments,
        directory_layout: repo.directoryLayout,
        log_info: repo.logLevels.info,
        log_debug: repo.logLevels.debug,
        log_warning: repo.logLevels.warning,
        log_error: repo.logLevels.error,
        active_tab: ui.activeTab,
        config_locked: ui.configLocked,
        options_locked: ui.optionsLocked,
        theme: currentGuiSettings?.theme || "system",
      };

      await settingsService.saveSettings(settings);

      setLastSavedHashes({
        lms: hashSnapshot(lms),
        repo: hashSnapshot(repo),
      });

      const activeProfile = await settingsService.getActiveProfile();
      output.appendWithNewline(`✓ Settings saved to profile: ${activeProfile || "Default"}`);
    } catch (error) {
      console.error("Failed to save settings:", error);
      output.appendWithNewline(`⚠ Failed to save settings: ${error}`);
    }
  };

  const handleBrowseFolder = async (setter: (path: string) => void) => {
    const selected = await open({ directory: true });
    if (selected) {
      setter(selected as string);
    }
  };

  const handleBrowseFile = async (setter: (path: string) => void) => {
    const selected = await open({ directory: false });
    if (selected) {
      setter(selected as string);
    }
  };

  const handleSettingsLoaded = (settings: GuiSettings) => {
    applySettings(settings, true);
  };

  const handleToggleSettingsSidebar = async () => {
    const newState = !ui.settingsMenuOpen;
    ui.setSettingsMenuOpen(newState);

    // Save to app.json
    if (currentGuiSettings) {
      try {
        await settingsService.saveAppSettings({
          theme: currentGuiSettings.theme,
          active_tab: currentGuiSettings.active_tab,
          config_locked: currentGuiSettings.config_locked,
          options_locked: currentGuiSettings.options_locked,
          sidebar_open: newState,
          window_width: currentGuiSettings.window_width,
          window_height: currentGuiSettings.window_height,
        });
      } catch (error) {
        console.error("Failed to save sidebar state:", error);
      }
    }
  };

  return (
    <div className="repobee-container">
      <div className="flex flex-1 min-h-0">
        <Tabs
          value={ui.activeTab}
          onValueChange={(v) => ui.setActiveTab(v as "lms" | "repo")}
          className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden"
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
            <div
              ref={lmsScrollRef}
              className="overflow-auto space-y-1 shrink-0"
              style={{ height: settingsHeight }}
            >
              <LmsConfigSection onVerify={verifyLmsCourse} />
              <OutputConfigSection onBrowseFolder={handleBrowseFolder} />
              <RepoNamingSection />
            </div>

            <ActionBar
              right={
                !lmsValidation.valid ? (
                  <span className="text-[11px] text-destructive">
                    {lmsValidation.errors[0]}
                    {lmsValidation.errors.length > 1 ? " (+ more)" : ""}
                  </span>
                ) : null
              }
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" onClick={handleGenerateFiles} disabled={!lmsValidation.valid}>
                    Generate Files
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Generate YAML/CSV/XLSX files from LMS data</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="xs"
                      variant={isDirty ? "default" : "outline"}
                      onClick={saveSettingsToDisk}
                      disabled={!isDirty}
                    >
                      Save
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{isDirty ? "Save settings to disk" : "No unsaved changes"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" variant="outline" onClick={() => output.clear()}>
                    Clear History
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear console output</TooltipContent>
              </Tooltip>
            </ActionBar>

            <div
              className="splitter-handle shrink-0"
              onMouseDown={beginDrag}
              title="Drag to resize"
            />
            <OutputConsole />
          </div>
        </TabsContent>

        {/* Repository Setup Tab */}
        <TabsContent value="repo" className="flex-1 flex flex-col min-h-0 p-1">
          <div className="flex-1 flex flex-col min-h-0 gap-1">
            <div
              ref={repoScrollRef}
              className="overflow-auto space-y-1 shrink-0"
              style={{ height: settingsHeight }}
            >
              <GitConfigSection />
              <LocalConfigSection onBrowseFile={handleBrowseFile} onBrowseFolder={handleBrowseFolder} />
              <OptionsSection />
            </div>

            <ActionBar
              right={
                !repoValidation.valid ? (
                  <span className="text-[11px] text-destructive">
                    {repoValidation.errors[0]}
                    {repoValidation.errors.length > 1 ? " (+ more)" : ""}
                  </span>
                ) : null
              }
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" disabled={!repoValidation.valid} onClick={handleVerifyConfig}>
                    Verify Config
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Verify Git platform configuration</TooltipContent>
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
                <TooltipContent>Create repositories for students</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" variant="outline" disabled={!repoValidation.valid}>
                    Clone
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clone student repositories</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="xs"
                      variant={isDirty ? "default" : "outline"}
                      onClick={saveSettingsToDisk}
                      disabled={!isDirty}
                    >
                      Save
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{isDirty ? "Save settings to disk" : "No unsaved changes"}</TooltipContent>
              </Tooltip>
            </ActionBar>

            <div
              className="splitter-handle shrink-0"
              onMouseDown={beginDrag}
              title="Drag to resize"
            />
            <OutputConsole />
          </div>
        </TabsContent>
        </Tabs>

        {/* Settings Sidebar */}
        {ui.settingsMenuOpen && currentGuiSettings && (
          <SettingsSidebar
            onClose={handleToggleSettingsSidebar}
            currentSettings={currentGuiSettings}
            onSettingsLoaded={handleSettingsLoaded}
            onMessage={(msg) => output.appendWithNewline(msg)}
            isDirty={isDirty}
            onSaved={() => {
              setLastSavedHashes({
                lms: hashSnapshot(lmsForm.getState()),
                repo: hashSnapshot(repoForm.getState()),
              });
            }}
            onResetToDefaults={() => {
              // Reset to defaults without updating baseline (keeps dirty state)
              applySettings(DEFAULT_GUI_SETTINGS, false);
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
          lmsForm.setField("accessToken", ui.lmsTokenDialogValue);
          ui.closeLmsTokenDialog();
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
                const lms = lmsForm.getState();
                const baseUrl = lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl;
                await lmsService.openTokenUrl(baseUrl, lms.lmsType);
                output.appendWithNewline("Opening LMS token page...");
              } catch (error) {
                output.appendWithNewline(`✗ Failed to open token page: ${error}`);
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
          repoForm.setField("accessToken", ui.tokenDialogValue);
          ui.closeTokenDialog();
        }}
      />

      {/* Close Confirmation Dialog */}
      <AlertDialog open={ui.closePromptVisible} onOpenChange={(open: boolean) => !open && handlePromptCancel()}>
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
  );
}

export default App;
