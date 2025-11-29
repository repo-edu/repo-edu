import { useState, useEffect } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo-edu/ui/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo-edu/ui/components/ui/dialog";
import { Button } from "@repo-edu/ui/components/ui/button";
import { Input } from "@repo-edu/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui/components/ui/select";
import { Separator } from "@repo-edu/ui/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@repo-edu/ui/components/ui/tooltip";
import type { GuiSettings, Theme } from "../types/settings";
import * as settingsService from "../services/settingsService";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System (Auto)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface SettingsSidebarProps {
  onClose: () => void;
  currentSettings: GuiSettings;
  onSettingsLoaded: (settings: GuiSettings) => void;
  onMessage: (message: string) => void;
  isDirty: boolean;
  onSaved: () => void;
  onResetToDefaults: () => void;
}

export function SettingsSidebar({
  onClose,
  currentSettings,
  onSettingsLoaded,
  onMessage,
  isDirty,
  onSaved,
  onResetToDefaults,
}: SettingsSidebarProps) {
  const [settingsPath, setSettingsPath] = useState<string>("");
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Prompt dialog state (for New/Rename)
  const [promptDialog, setPromptDialog] = useState<{
    open: boolean;
    title: string;
    placeholder: string;
    value: string;
    onConfirm: (value: string) => void;
  }>({ open: false, title: "", placeholder: "", value: "", onConfirm: () => {} });

  const loadSettingsPath = async () => {
    try {
      const path = await settingsService.getSettingsPath();
      setSettingsPath(path);
    } catch (error) {
      console.error("Failed to get settings path:", error);
    }
  };

  const loadProfiles = async () => {
    try {
      const profileList = await settingsService.listProfiles();
      setProfiles(profileList);
      const active = await settingsService.getActiveProfile();
      setActiveProfile(active);
      // Select first profile if none selected
      if (!selectedProfile && profileList.length > 0) {
        setSelectedProfile(profileList[0]);
      }
    } catch (error) {
      console.error("Failed to load profiles:", error);
    }
  };

  useEffect(() => {
    loadSettingsPath();
    loadProfiles();
  }, []);

  const showSuccessFlash = () => {
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 500);
  };

  // Active Profile Actions
  const handleSaveActiveProfile = async () => {
    if (!activeProfile) {
      onMessage("✗ No active profile to save");
      return;
    }
    try {
      await settingsService.saveProfile(activeProfile, currentSettings);
      showSuccessFlash();
      onMessage(`✓ Saved profile: ${activeProfile}`);
      onSaved();
    } catch (error) {
      onMessage(`✗ Failed to save profile: ${error}`);
    }
  };

  const handleResetSettings = () => {
    onResetToDefaults();
    showSuccessFlash();
    onMessage("✓ Settings reset to defaults (not saved)");
  };

  const handleShowLocation = async () => {
    if (settingsPath) {
      try {
        await revealItemInDir(settingsPath);
      } catch (error) {
        onMessage(`✗ Failed to open file explorer: ${error}`);
      }
    }
  };

  // Profile List Actions
  const handleLoadProfile = async (name: string) => {
    if (!name) return;
    try {
      const settings = await settingsService.loadProfile(name);
      onSettingsLoaded(settings);
      setActiveProfile(name);
      showSuccessFlash();
      onMessage(`✓ Loaded profile: ${name}`);
    } catch (error) {
      onMessage(`✗ Failed to load profile: ${error}`);
    }
  };

  const handleActivateProfile = () => {
    if (!selectedProfile || selectedProfile === activeProfile) return;

    if (isDirty) {
      setConfirmDialog({
        open: true,
        title: "Unsaved Changes",
        description: "Warning: unsaved changes will be ignored.",
        onConfirm: () => handleLoadProfile(selectedProfile),
      });
    } else {
      handleLoadProfile(selectedProfile);
    }
  };

  const handleNewProfile = () => {
    setPromptDialog({
      open: true,
      title: "New Profile",
      placeholder: "Profile name",
      value: "",
      onConfirm: async (name) => {
        if (!name.trim()) {
          onMessage("✗ Please enter a profile name");
          return;
        }
        try {
          await settingsService.saveProfile(name, currentSettings);
          showSuccessFlash();
          onMessage(`✓ Created profile: ${name}`);
          await loadProfiles();
          setSelectedProfile(name);
        } catch (error) {
          onMessage(`✗ Failed to create profile: ${error}`);
        }
      },
    });
  };

  const handleRenameProfile = () => {
    if (!selectedProfile) {
      onMessage("✗ Select a profile to rename");
      return;
    }
    setPromptDialog({
      open: true,
      title: "Rename Profile",
      placeholder: "New name",
      value: selectedProfile,
      onConfirm: async (newName) => {
        if (!newName.trim()) {
          onMessage("✗ Please enter a profile name");
          return;
        }
        try {
          await settingsService.renameProfile(selectedProfile, newName);
          showSuccessFlash();
          onMessage(`✓ Renamed profile to: ${newName}`);
          await loadProfiles();
          setSelectedProfile(newName);
          if (activeProfile === selectedProfile) {
            setActiveProfile(newName);
          }
        } catch (error) {
          onMessage(`✗ Failed to rename profile: ${error}`);
        }
      },
    });
  };

  const handleDeleteProfile = () => {
    if (!selectedProfile) {
      onMessage("✗ Select a profile to delete");
      return;
    }
    setConfirmDialog({
      open: true,
      title: "Delete Profile",
      description: `Delete profile "${selectedProfile}"?`,
      onConfirm: async () => {
        try {
          await settingsService.deleteProfile(selectedProfile);
          showSuccessFlash();
          onMessage(`✓ Deleted profile: ${selectedProfile}`);
          if (activeProfile === selectedProfile) {
            setActiveProfile(null);
          }
          await loadProfiles();
          setSelectedProfile(profiles.find((p) => p !== selectedProfile) || null);
        } catch (error) {
          onMessage(`✗ Failed to delete profile: ${error}`);
        }
      },
    });
  };

  return (
    <>
      <div className="settings-sidebar">
        {/* Header */}
        <div className="settings-sidebar-header">
          <span className="text-sm font-semibold text-muted-foreground">General Settings</span>
          <Button variant="outline" size="xs" onClick={onClose} className="h-5 w-5 p-0">
            ×
          </Button>
        </div>

        {/* Content */}
        <div
          className={`settings-sidebar-content transition-colors duration-300 ${
            successFlash ? "bg-accent" : ""
          }`}
        >
          {/* Theme Selection */}
          <div className="flex items-center justify-between gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-medium border-b border-dashed border-muted-foreground cursor-help">
                  Theme
                </span>
              </TooltipTrigger>
              <TooltipContent>Color scheme (System follows OS)</TooltipContent>
            </Tooltip>
            <Select
              value={currentSettings.theme || "system"}
              onValueChange={async (value: Theme) => {
                const updated = { ...currentSettings, theme: value };
                onSettingsLoaded(updated);
                try {
                  // Save only app settings for theme change
                  await settingsService.saveAppSettings({
                    theme: value,
                    active_tab: currentSettings.active_tab,
                    config_locked: currentSettings.config_locked,
                    options_locked: currentSettings.options_locked,
                    window_width: currentSettings.window_width,
                    window_height: currentSettings.window_height,
                    window_x: currentSettings.window_x,
                    window_y: currentSettings.window_y,
                  });
                  showSuccessFlash();
                } catch (error) {
                  onMessage(`✗ Failed to save theme: ${error}`);
                }
              }}
            >
              <SelectTrigger size="xs" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} size="xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Active Profile */}
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-medium border-b border-dashed border-muted-foreground cursor-help">
                  Active Profile
                </span>
              </TooltipTrigger>
              <TooltipContent>Currently loaded configuration profile</TooltipContent>
            </Tooltip>
            <Input
              size="xs"
              value={activeProfile || "(none)"}
              readOnly
              className="bg-muted text-foreground"
            />
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="xs"
                      variant={isDirty ? "default" : "outline"}
                      onClick={handleSaveActiveProfile}
                      disabled={!activeProfile || !isDirty}
                    >
                      Save
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!isDirty ? "No unsaved changes" : "Save current settings to active profile"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" variant="outline" onClick={handleResetSettings}>
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset all settings to defaults</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" variant="outline" onClick={handleShowLocation}>
                    Location
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Show settings file in Finder</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Separator />

          {/* Profiles List */}
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-medium border-b border-dashed border-muted-foreground cursor-help">
                  Profiles
                </span>
              </TooltipTrigger>
              <TooltipContent>Manage configuration profiles</TooltipContent>
            </Tooltip>
            <Select
              value={selectedProfile || ""}
              onValueChange={(v) => setSelectedProfile(v)}
            >
              <SelectTrigger size="xs">
                <SelectValue placeholder="Select profile..." />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((name) => (
                  <SelectItem key={name} value={name} size="xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="xs"
                      onClick={handleActivateProfile}
                      disabled={!selectedProfile || selectedProfile === activeProfile}
                    >
                      Activate
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {selectedProfile === activeProfile
                    ? "Already active"
                    : "Load and activate selected profile"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" variant="outline" onClick={handleNewProfile}>
                    New
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create new profile from current settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="xs" variant="outline" onClick={handleRenameProfile} disabled={!selectedProfile}>
                    Rename
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rename selected profile</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={handleDeleteProfile}
                    disabled={!selectedProfile || selectedProfile === activeProfile}
                  >
                    Delete
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {selectedProfile === activeProfile
                    ? "Cannot delete active profile"
                    : "Delete selected profile"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog((prev) => ({ ...prev, open: false }));
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Prompt Dialog */}
      <Dialog
        open={promptDialog.open}
        onOpenChange={(open) => setPromptDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-[300px]">
          <DialogHeader>
            <DialogTitle>{promptDialog.title}</DialogTitle>
          </DialogHeader>
          <Input
            size="xs"
            placeholder={promptDialog.placeholder}
            value={promptDialog.value}
            onChange={(e) => setPromptDialog((prev) => ({ ...prev, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                promptDialog.onConfirm(promptDialog.value);
                setPromptDialog((prev) => ({ ...prev, open: false }));
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              size="xs"
              variant="outline"
              onClick={() => setPromptDialog((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => {
                promptDialog.onConfirm(promptDialog.value);
                setPromptDialog((prev) => ({ ...prev, open: false }));
              }}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
