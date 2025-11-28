import { useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Label,
  RadioGroup,
  RadioGroupItem,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  cn,
} from "@repo-edu/ui";
import { Lock, LockOpen } from "@repo-edu/ui/components/icons";
import {
  useLmsFormStore,
  useRepoFormStore,
  useUiStore,
  useOutputStore,
} from "./stores";
import type { GuiSettings } from "./types/settings";
import { SettingsMenu } from "./components/SettingsMenu";
import * as settingsService from "./services/settingsService";
import * as lmsService from "./services/lmsService";
import { hashSnapshot } from "./utils/snapshot";
import { useCloseGuard } from "./hooks/useCloseGuard";
import { useLoadSettings } from "./hooks/useLoadSettings";
import "./App.css";

// Form field component for consistent styling
function FormField({
  label,
  tooltip,
  children,
  className,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Label size="xs" className="w-28 shrink-0">
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="border-b border-dashed border-muted-foreground cursor-help">
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          label
        )}
      </Label>
      {children}
    </div>
  );
}

// Input + Browse button combo
function FilePathInput({
  value,
  onChange,
  placeholder,
  onBrowse,
  browseLabel = "Browse",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onBrowse: () => void;
  browseLabel?: string;
}) {
  return (
    <div className="flex gap-1 flex-1">
      <Input
        size="xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button size="xs" variant="outline" onClick={onBrowse}>
        {browseLabel}
      </Button>
    </div>
  );
}

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
      const progress = new Channel<string>();

      progress.onmessage = (msg: string) => {
        if (msg.startsWith("[PROGRESS]")) {
          output.updateLastLine(msg);
        } else {
          output.appendWithNewline(msg);
        }
      };

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
          <Card size="compact">
            <CardHeader size="compact">
              <CardTitle size="compact">LMS Configuration</CardTitle>
            </CardHeader>
            <CardContent size="compact" className="space-y-1.5">
              <FormField label="LMS Type" tooltip="Learning Management System type">
                <Select value={lmsForm.lmsType} onValueChange={(v) => lmsForm.setLmsType(v as "Canvas" | "Moodle")}>
                  <SelectTrigger size="xs" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Canvas" size="xs">Canvas</SelectItem>
                    <SelectItem value="Moodle" size="xs">Moodle</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              {lmsForm.lmsType === "Canvas" && (
                <FormField label="Base URL" tooltip="Canvas instance URL">
                  <Select value={lmsForm.urlOption} onValueChange={(v) => lmsForm.setField("urlOption", v as "TUE" | "CUSTOM")}>
                    <SelectTrigger size="xs" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TUE" size="xs">TU/e (canvas.tue.nl)</SelectItem>
                      <SelectItem value="CUSTOM" size="xs">Custom URL</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              {(lmsForm.urlOption === "CUSTOM" || lmsForm.lmsType !== "Canvas") && (
                <FormField label="Custom URL">
                  <Input
                    size="xs"
                    value={lmsForm.customUrl}
                    onChange={(e) => lmsForm.setField("customUrl", e.target.value)}
                    placeholder="https://..."
                    className="flex-1"
                  />
                </FormField>
              )}

              <FormField label="Access Token" tooltip="API access token from your LMS">
                <div className="flex gap-1 flex-1">
                  <Input
                    size="xs"
                    type={lmsForm.accessToken ? "password" : "text"}
                    value={lmsForm.accessToken}
                    onChange={(e) => lmsForm.setField("accessToken", e.target.value)}
                    placeholder={lmsForm.accessToken ? "••••••••" : "Not set"}
                    className={cn("flex-1 password-input", !lmsForm.accessToken && "token-empty")}
                  />
                  <Button size="xs" variant="outline" onClick={() => ui.openLmsTokenDialog(lmsForm.accessToken)}>
                    Edit
                  </Button>
                </div>
              </FormField>

              <FormField label="Course ID" tooltip="The numeric course ID from your LMS. Click 'Verify' to check if the course exists and load its name.">
                <div className="flex gap-1 flex-1">
                  <Input
                    size="xs"
                    value={lmsForm.courseId}
                    onChange={(e) => lmsForm.setField("courseId", e.target.value)}
                    placeholder="12345"
                    className="flex-1"
                  />
                  <Button size="xs" onClick={verifyLmsCourse}>
                    Verify
                  </Button>
                </div>
              </FormField>
            </CardContent>
          </Card>

          <Card size="compact">
            <CardHeader size="compact">
              <CardTitle size="compact">Output Configuration</CardTitle>
            </CardHeader>
            <CardContent size="compact" className="space-y-1.5">
              <FormField label="Info File Folder">
                <FilePathInput
                  value={lmsForm.infoFileFolder}
                  onChange={(v) => lmsForm.setField("infoFileFolder", v)}
                  placeholder="Output folder for generated files"
                  onBrowse={() => handleBrowseFolder((p) => lmsForm.setField("infoFileFolder", p))}
                />
              </FormField>

              <FormField label="YAML File">
                <Input
                  size="xs"
                  value={lmsForm.yamlFile}
                  onChange={(e) => lmsForm.setField("yamlFile", e.target.value)}
                  placeholder="students.yaml"
                  className="flex-1"
                />
              </FormField>

              <div className="flex items-center gap-4 ml-28">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="output-yaml"
                    checked={lmsForm.yaml}
                    onCheckedChange={(c) => lmsForm.setField("yaml", c === true)}
                    size="xs"
                  />
                  <Label htmlFor="output-yaml" size="xs">YAML</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="output-csv"
                    checked={lmsForm.csv}
                    onCheckedChange={(c) => lmsForm.setField("csv", c === true)}
                    size="xs"
                  />
                  <Label htmlFor="output-csv" size="xs">CSV</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="output-xlsx"
                    checked={lmsForm.xlsx}
                    onCheckedChange={(c) => lmsForm.setField("xlsx", c === true)}
                    size="xs"
                  />
                  <Label htmlFor="output-xlsx" size="xs">XLSX</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card size="compact">
            <CardHeader size="compact">
              <CardTitle size="compact">Repository Naming</CardTitle>
            </CardHeader>
            <CardContent size="compact" className="space-y-1.5">
              <div className="flex items-center gap-4 ml-28">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="include-group"
                    checked={lmsForm.includeGroup}
                    onCheckedChange={(c) => lmsForm.setField("includeGroup", c === true)}
                    size="xs"
                  />
                  <Label htmlFor="include-group" size="xs">Group name</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="include-member"
                    checked={lmsForm.includeMember}
                    onCheckedChange={(c) => lmsForm.setField("includeMember", c === true)}
                    size="xs"
                  />
                  <Label htmlFor="include-member" size="xs">Member names</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="include-initials"
                    checked={lmsForm.includeInitials}
                    onCheckedChange={(c) => lmsForm.setField("includeInitials", c === true)}
                    size="xs"
                  />
                  <Label htmlFor="include-initials" size="xs">Initials</Label>
                </div>
              </div>

              <FormField label="Member Format">
                <Select value={lmsForm.memberOption} onValueChange={(v) => lmsForm.setField("memberOption", v as "(email, gitid)" | "email" | "git_id")}>
                  <SelectTrigger size="xs" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="(email, gitid)" size="xs">(email, gitid)</SelectItem>
                    <SelectItem value="email" size="xs">email</SelectItem>
                    <SelectItem value="git_id" size="xs">git_id</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex gap-2 mt-1">
            <Button size="xs" onClick={handleGenerateFiles}>
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
          </div>

          {/* Output console */}
          <div className="flex-1 min-h-32">
            <Textarea
              size="xs"
              value={output.text}
              readOnly
              className="h-full font-mono resize-none console-output"
              placeholder="Output will appear here..."
            />
          </div>
        </TabsContent>

        {/* Repository Setup Tab */}
        <TabsContent value="repo" className="flex-1 flex flex-col gap-1 overflow-auto p-1">
          <Card size="compact">
            <CardHeader size="compact">
              <CardTitle size="compact">Git Server Configuration</CardTitle>
            </CardHeader>
            <CardContent size="compact" className="space-y-1.5">
              <FormField label="Access Token" tooltip="GitLab/GitHub personal access token">
                <div className="flex gap-1 flex-1">
                  <Input
                    size="xs"
                    type={repoForm.accessToken ? "password" : "text"}
                    value={repoForm.accessToken}
                    onChange={(e) => repoForm.setField("accessToken", e.target.value)}
                    placeholder={repoForm.accessToken ? "••••••••" : "Not set"}
                    className={cn("flex-1 password-input", !repoForm.accessToken && "token-empty")}
                    disabled={ui.configLocked}
                  />
                  <Button size="xs" variant="outline" onClick={() => ui.openTokenDialog(repoForm.accessToken)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => ui.toggleConfigLock()}>
                    {ui.configLocked ? (
                      <Lock className="h-4 w-4" aria-hidden />
                    ) : (
                      <LockOpen className="h-4 w-4 text-sky-500" aria-hidden />
                    )}
                    <span className="sr-only">{ui.configLocked ? "Lock settings" : "Unlock settings"}</span>
                  </Button>
                </div>
              </FormField>

              <FormField label="User" tooltip="Your Git username">
                <Input
                  size="xs"
                  value={repoForm.user}
                  onChange={(e) => repoForm.setField("user", e.target.value)}
                  placeholder="username"
                  className="flex-1"
                  disabled={ui.configLocked}
                />
              </FormField>

              <FormField label="Base URL" tooltip="Git server base URL">
                <Input
                  size="xs"
                  value={repoForm.baseUrl}
                  onChange={(e) => repoForm.setField("baseUrl", e.target.value)}
                  placeholder="https://gitlab.tue.nl"
                  className="flex-1"
                  disabled={ui.configLocked}
                />
              </FormField>

              <FormField label="Student Repos Group" tooltip="Group path for student repositories">
                <Input
                  size="xs"
                  value={repoForm.studentReposGroup}
                  onChange={(e) => repoForm.setField("studentReposGroup", e.target.value)}
                  placeholder="course/student-repos"
                  className="flex-1"
                  disabled={ui.configLocked}
                />
              </FormField>

              <FormField label="Template Group" tooltip="Group path containing template repositories">
                <Input
                  size="xs"
                  value={repoForm.templateGroup}
                  onChange={(e) => repoForm.setField("templateGroup", e.target.value)}
                  placeholder="course/templates"
                  className="flex-1"
                  disabled={ui.configLocked}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card size="compact">
            <CardHeader size="compact">
              <CardTitle size="compact">Local Configuration</CardTitle>
            </CardHeader>
            <CardContent size="compact" className="space-y-1.5">
              <FormField label="YAML File" tooltip="Path to students YAML file">
                <FilePathInput
                  value={repoForm.yamlFile}
                  onChange={(v) => repoForm.setField("yamlFile", v)}
                  placeholder="students.yaml"
                  onBrowse={() => handleBrowseFile((p) => repoForm.setField("yamlFile", p))}
                />
              </FormField>

              <FormField label="Target Folder" tooltip="Folder for cloned repositories">
                <FilePathInput
                  value={repoForm.targetFolder}
                  onChange={(v) => repoForm.setField("targetFolder", v)}
                  placeholder="/path/to/repos"
                  onBrowse={() => handleBrowseFolder((p) => repoForm.setField("targetFolder", p))}
                />
              </FormField>

              <FormField label="Assignments" tooltip="Comma-separated list of assignments">
                <Input
                  size="xs"
                  value={repoForm.assignments}
                  onChange={(e) => repoForm.setField("assignments", e.target.value)}
                  placeholder="assignment1, assignment2"
                  className="flex-1"
                />
              </FormField>
            </CardContent>
          </Card>

          <Card size="compact">
            <CardHeader size="compact">
              <CardTitle size="compact">Options</CardTitle>
            </CardHeader>
            <CardContent size="compact" className="space-y-1.5">
              <FormField label="Directory Layout">
                <RadioGroup
                  value={repoForm.directoryLayout}
                  onValueChange={(v) => repoForm.setField("directoryLayout", v as "by-team" | "flat" | "by-task")}
                  className="flex gap-4"
                  size="xs"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="flat" id="layout-flat" size="xs" disabled={ui.optionsLocked} />
                    <Label htmlFor="layout-flat" size="xs">Flat</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="by-team" id="layout-team" size="xs" disabled={ui.optionsLocked} />
                    <Label htmlFor="layout-team" size="xs">By Team</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="by-task" id="layout-task" size="xs" disabled={ui.optionsLocked} />
                    <Label htmlFor="layout-task" size="xs">By Task</Label>
                  </div>
                </RadioGroup>
                <Button size="xs" variant="outline" onClick={() => ui.toggleOptionsLock()}>
                  {ui.optionsLocked ? (
                    <Lock className="h-4 w-4" aria-hidden />
                  ) : (
                    <LockOpen className="h-4 w-4 text-sky-500" aria-hidden />
                  )}
                  <span className="sr-only">{ui.optionsLocked ? "Lock options" : "Unlock options"}</span>
                </Button>
              </FormField>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex gap-2 mt-1">
            <Button size="xs">Verify Config</Button>
            <Button size="xs" variant="outline">Create Student Repos</Button>
            <Button size="xs" variant="outline">Clone</Button>
            <Button size="xs" variant="outline" onClick={() => ui.openSettingsMenu()}>
              Settings...
            </Button>
            <Button size="xs" variant="outline" onClick={saveSettingsToDisk}>
              Save Settings
            </Button>
          </div>

          {/* Output console */}
          <div className="flex-1 min-h-32">
            <Textarea
              size="xs"
              value={output.text}
              readOnly
              className="h-full font-mono resize-none console-output"
              placeholder="Output will appear here..."
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* LMS Token Dialog */}
      <Dialog open={ui.lmsTokenDialogOpen} onOpenChange={(open) => !open && ui.closeLmsTokenDialog()}>
        <DialogContent size="compact" className="max-w-md">
          <DialogHeader size="compact">
            <DialogTitle size="compact">LMS Access Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              size="xs"
              value={ui.lmsTokenDialogValue}
              onChange={(e) => ui.setLmsTokenDialogValue(e.target.value)}
              placeholder="Paste your access token"
            />
            <Collapsible>
              <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">
                ▶ How to get a token
              </CollapsibleTrigger>
              <CollapsibleContent className="text-xs text-muted-foreground mt-2 pl-4">
                <p>1. Log in to your Canvas instance</p>
                <p>2. Go to Account → Settings</p>
                <p>3. Scroll to "Approved Integrations"</p>
                <p>4. Click "+ New Access Token"</p>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter>
            <Button size="xs" variant="outline" onClick={() => ui.closeLmsTokenDialog()}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => {
                lmsForm.setField("accessToken", ui.lmsTokenDialogValue);
                ui.closeLmsTokenDialog();
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Git Token Dialog */}
      <Dialog open={ui.tokenDialogOpen} onOpenChange={(open) => !open && ui.closeTokenDialog()}>
        <DialogContent size="compact" className="max-w-md">
          <DialogHeader size="compact">
            <DialogTitle size="compact">Git Access Token</DialogTitle>
          </DialogHeader>
          <Input
            size="xs"
            value={ui.tokenDialogValue}
            onChange={(e) => ui.setTokenDialogValue(e.target.value)}
            placeholder="Paste your access token"
          />
          <DialogFooter>
            <Button size="xs" variant="outline" onClick={() => ui.closeTokenDialog()}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => {
                repoForm.setField("accessToken", ui.tokenDialogValue);
                ui.closeTokenDialog();
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Confirmation Dialog */}
      <Dialog open={ui.closePromptVisible} onOpenChange={(open) => !open && handlePromptCancel()}>
        <DialogContent size="compact" showCloseButton={false}>
          <DialogHeader size="compact">
            <DialogTitle size="compact">Unsaved Changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have unsaved changes. Do you want to save before closing?
          </p>
          <DialogFooter>
            <Button size="xs" variant="outline" onClick={handlePromptCancel}>
              Cancel
            </Button>
            <Button size="xs" variant="destructive" onClick={handlePromptDiscard}>
              Discard
            </Button>
            <Button size="xs" onClick={handlePromptSave}>
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
