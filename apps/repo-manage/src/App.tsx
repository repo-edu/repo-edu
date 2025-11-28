import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@repo-edu/ui";
import {
  useLmsFormStore,
  useRepoFormStore,
  useUiStore,
  useOutputStore,
} from "./stores";
import type { GuiSettings } from "./types/settings";
import { SettingsMenu } from "./components/SettingsMenu";
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
import * as repoService from "./services/repoService";
import { hashSnapshot } from "./utils/snapshot";
import { useCloseGuard } from "./hooks/useCloseGuard";
import { useLoadSettings } from "./hooks/useLoadSettings";
import { useProgressChannel, handleProgressMessage } from "./hooks/useProgressChannel";
import { validateLms, validateRepo } from "./validation/forms";
import "./App.css";

function App() {
  // Zustand stores
  const lmsForm = useLmsFormStore();
  const repoForm = useRepoFormStore();
  const ui = useUiStore();
  const output = useOutputStore();

  // Track last saved state for dirty checking (hashed snapshots)
  const [lastSavedHashes, setLastSavedHashes] = useState(() => ({
    lms: hashSnapshot(lmsForm.getState()),
    repo: hashSnapshot(repoForm.getState()),
  }));

  // Current GUI settings (for SettingsMenu)
  const [currentGuiSettings, setCurrentGuiSettings] = useState<GuiSettings | null>(null);

  // Compute dirty state
  const isDirty =
    hashSnapshot(lmsForm.getState()) !== lastSavedHashes.lms ||
    hashSnapshot(repoForm.getState()) !== lastSavedHashes.repo;

  const lmsValidation = validateLms(lmsForm.getState());
  const repoValidation = validateRepo(repoForm.getState());

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

  // Close guard handling
  const { handlePromptSave, handlePromptDiscard, handlePromptCancel } = useCloseGuard({
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
      };

      await settingsService.saveSettings(settings);

      setLastSavedHashes({
        lms: hashSnapshot(lms),
        repo: hashSnapshot(repo),
      });

      output.appendWithNewline("✓ Settings saved to file");
    } catch (error) {
      console.error("Failed to save settings:", error);
      output.appendWithNewline(`⚠ Failed to save settings: ${error}`);
    }
  };

  const verifyLmsCourse = async () => {
    if (!lmsValidation.valid) {
      output.appendWithNewline("⚠ Cannot verify: fix LMS form errors first");
      return;
    }
    const lms = lmsForm.getState();
    const lmsLabel = lms.lmsType || "LMS";
    output.appendWithNewline(`Verifying ${lmsLabel} course...`);

    try {
      const result = await lmsService.verifyLmsCourse({
        base_url: lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl,
        access_token: lms.accessToken,
        course_id: lms.courseId,
        lms_type: lms.lmsType,
      });

      output.appendWithNewline(result.message);
      if (result.details) {
        output.appendWithNewline(result.details);
      }

      // Extract course name from details and update form
      if (result.details) {
        const match = result.details.match(/Course Name: (.+)/);
        if (match) {
          lmsForm.setField("courseName", match[1]);
        }
      }
    } catch (error) {
      output.appendWithNewline(`✗ Error: ${error}`);
    }
  };

  const handleGenerateFiles = async () => {
    output.appendWithNewline("Generating student info files...");

    try {
      const lms = lmsForm.getState();
      const progress = useProgressChannel({
        onProgress: (line) =>
          handleProgressMessage(line, output.appendWithNewline, output.updateLastLine),
      });

      const result = await lmsService.generateLmsFiles(
        {
          base_url: lms.urlOption === "CUSTOM" ? lms.customUrl : lms.baseUrl,
          access_token: lms.accessToken,
          course_id: lms.courseId,
          lms_type: lms.lmsType,
          yaml_file: lms.yamlFile,
          info_file_folder: lms.infoFileFolder,
          csv_file: lms.csvFile,
          xlsx_file: lms.xlsxFile,
          member_option: lms.memberOption,
          include_group: lms.includeGroup,
          include_member: lms.includeMember,
          include_initials: lms.includeInitials,
          full_groups: lms.fullGroups,
          csv: lms.csv,
          xlsx: lms.xlsx,
          yaml: lms.yaml,
        },
        progress
      );

      output.appendWithNewline(result.message);
      if (result.details) {
        output.appendWithNewline(result.details);
      }
    } catch (error) {
      output.appendWithNewline(`⚠ Error: ${error}`);
    }
  };

  const handleVerifyConfig = async () => {
    if (!repoValidation.valid) {
      output.appendWithNewline("⚠ Cannot verify: fix repo form errors first");
      return;
    }
    const repo = repoForm.getState();
    output.appendWithNewline("Verifying configuration...");
    try {
      const result = await repoService.verifyConfig({
        access_token: repo.accessToken,
        user: repo.user,
        base_url: repo.baseUrl,
        student_repos_group: repo.studentReposGroup,
        template_group: repo.templateGroup,
      });
      output.appendWithNewline(result.message);
      if (result.details) {
        output.appendWithNewline(result.details);
      }
    } catch (error) {
      output.appendWithNewline(`✗ Error: ${error}`);
    }
  };

  const handleCreateRepos = async () => {
    if (!repoValidation.valid) {
      output.appendWithNewline("⚠ Cannot create repos: fix repo form errors first");
      return;
    }
    const repo = repoForm.getState();
    output.appendWithNewline("Creating student repositories...");
    output.appendWithNewline(`Teams: ${repo.yamlFile}`);
    output.appendWithNewline(`Assignments: ${repo.assignments}`);
    output.appendWithNewline("");
    try {
      const result = await repoService.setupRepos({
        config: {
          access_token: repo.accessToken,
          user: repo.user,
          base_url: repo.baseUrl,
          student_repos_group: repo.studentReposGroup,
          template_group: repo.templateGroup,
        },
        yaml_file: repo.yamlFile,
        assignments: repo.assignments,
      });
      if (result.message) output.appendWithNewline(result.message);
      if (result.details) output.appendWithNewline(result.details);
    } catch (error) {
      output.appendWithNewline(`✗ Error: ${error}`);
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

  return (
    <div className="repobee-container">
      <Tabs
        value={ui.activeTab}
        onValueChange={(v) => ui.setActiveTab(v as "lms" | "repo")}
        className="flex-1 flex flex-col min-h-0"
        size="compact"
      >
        <TabsList size="compact">
          <TabsTrigger value="lms" size="compact">
            LMS Import
          </TabsTrigger>
          <TabsTrigger value="repo" size="compact">
            Repository Setup
          </TabsTrigger>
        </TabsList>

        {/* LMS Import Tab */}
        <TabsContent value="lms" className="flex-1 flex flex-col gap-1 overflow-auto p-1">
          <LmsConfigSection onVerify={verifyLmsCourse} />
          <OutputConfigSection onBrowseFolder={handleBrowseFolder} />
          <RepoNamingSection />

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
            <Button size="xs" onClick={handleGenerateFiles} disabled={!lmsValidation.valid}>
              Generate Files
            </Button>
            <Button size="xs" variant="outline" onClick={() => ui.openSettingsMenu()}>
              Settings...
            </Button>
            <Button size="xs" variant="outline" onClick={saveSettingsToDisk}>
              Save Settings
            </Button>
            <Button size="xs" variant="outline" onClick={() => output.clear()}>
              Clear History
            </Button>
          </ActionBar>

          <OutputConsole />
        </TabsContent>

        {/* Repository Setup Tab */}
        <TabsContent value="repo" className="flex-1 flex flex-col gap-1 overflow-auto p-1">
          <GitConfigSection />
          <LocalConfigSection onBrowseFile={handleBrowseFile} onBrowseFolder={handleBrowseFolder} />
          <OptionsSection />

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
            <Button size="xs" disabled={!repoValidation.valid} onClick={handleVerifyConfig}>
              Verify Config
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!repoValidation.valid}
              onClick={handleCreateRepos}
            >
              Create Student Repos
            </Button>
            <Button size="xs" variant="outline" disabled={!repoValidation.valid}>
              Clone
            </Button>
            <Button size="xs" variant="outline" onClick={() => ui.openSettingsMenu()}>
              Settings...
            </Button>
            <Button size="xs" variant="outline" onClick={saveSettingsToDisk}>
              Save Settings
            </Button>
          </ActionBar>

          <OutputConsole />
        </TabsContent>
      </Tabs>

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
      <TokenDialog
        open={ui.closePromptVisible}
        title="Unsaved Changes"
        value=""
        onChange={() => {}}
        onClose={handlePromptCancel}
        onSave={handlePromptSave}
        instructions={
          <div className="text-sm text-muted-foreground space-y-2">
            <p>You have unsaved changes. Do you want to save before closing?</p>
            <div className="flex gap-2">
              <Button size="xs" variant="destructive" onClick={handlePromptDiscard}>
                Discard
              </Button>
              <Button size="xs" onClick={handlePromptSave}>
                Save & Close
              </Button>
              <Button size="xs" variant="outline" onClick={handlePromptCancel}>
                Cancel
              </Button>
            </div>
          </div>
        }
      />

      {/* Settings Menu */}
      {currentGuiSettings && (
        <SettingsMenu
          isOpen={ui.settingsMenuOpen}
          onClose={ui.closeSettingsMenu}
          currentSettings={currentGuiSettings}
          onSettingsLoaded={handleSettingsLoaded}
          onMessage={(msg) => output.appendWithNewline(msg)}
        />
      )}
    </div>
  );
}

export default App;
