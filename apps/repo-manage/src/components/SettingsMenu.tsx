import { useState, useEffect } from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo-edu/ui/components/ui/dialog";
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

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: GuiSettings;
  onSettingsLoaded: (settings: GuiSettings) => void;
  onMessage: (message: string) => void;
}

export function SettingsMenu({
  isOpen,
  onClose,
  currentSettings,
  onSettingsLoaded,
  onMessage,
}: SettingsMenuProps) {
  const [settingsPath, setSettingsPath] = useState<string>("");
  const [profiles, setProfiles] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState<string>("");
  const [successFlash, setSuccessFlash] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Load current settings path when menu opens
  const loadSettingsPath = async () => {
    try {
      const path = await settingsService.getSettingsPath();
      setSettingsPath(path);
    } catch (error) {
      console.error("Failed to get settings path:", error);
    }
  };

  // Load profiles and active profile
  const loadProfiles = async () => {
    try {
      const profileList = await settingsService.listProfiles();
      setProfiles(profileList);
      const active = await settingsService.getActiveProfile();
      setActiveProfile(active);
    } catch (error) {
      console.error("Failed to load profiles:", error);
    }
  };

  // Load settings path and profiles when menu opens
  useEffect(() => {
    if (isOpen) {
      loadSettingsPath();
      loadProfiles();
    }
  }, [isOpen]);

  // Show success flash animation
  const showSuccessFlash = () => {
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 500);
  };

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

  const handleSaveAsProfile = async () => {
    if (!newProfileName.trim()) {
      onMessage("✗ Please enter a profile name");
      return;
    }
    try {
      await settingsService.saveProfile(newProfileName, currentSettings);
      showSuccessFlash();
      onMessage(`✓ Saved profile: ${newProfileName}`);
      setNewProfileName("");
      await loadProfiles();
    } catch (error) {
      onMessage(`✗ Failed to save profile: ${error}`);
    }
  };

  const handleDeleteProfile = (name: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Profile",
      description: `Delete profile "${name}"?`,
      onConfirm: async () => {
        try {
          await settingsService.deleteProfile(name);
          showSuccessFlash();
          onMessage(`✓ Deleted profile: ${name}`);
          await loadProfiles();
        } catch (error) {
          onMessage(`✗ Failed to delete profile: ${error}`);
        }
      },
    });
  };

  const handleImport = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (filePath && typeof filePath === "string") {
        const settings = await settingsService.importSettings(filePath);
        onSettingsLoaded(settings);
        showSuccessFlash();
        onMessage(`✓ Settings imported from: ${filePath}`);
        await loadSettingsPath();
        onClose();
      }
    } catch (error) {
      onMessage(`✗ Failed to import settings: ${error}`);
    }
  };

  const handleExport = async () => {
    try {
      const filePath = await save({
        filters: [
          { name: "JSON Files", extensions: ["json"] },
          { name: "All Files", extensions: ["*"] },
        ],
        defaultPath: "repobee-settings.json",
      });

      if (filePath) {
        await settingsService.exportSettings(currentSettings, filePath);
        showSuccessFlash();
        onMessage(`✓ Settings exported to: ${filePath}`);
      }
    } catch (error) {
      onMessage(`✗ Failed to export settings: ${error}`);
    }
  };

  const handleReset = () => {
    setConfirmDialog({
      open: true,
      title: "Reset Settings",
      description: "Are you sure you want to reset all settings to defaults? This cannot be undone.",
      onConfirm: async () => {
        try {
          const settings = await settingsService.resetSettings();
          onSettingsLoaded(settings);
          showSuccessFlash();
          onMessage("✓ Settings reset to defaults");
          await loadSettingsPath();
          onClose();
        } catch (error) {
          onMessage(`✗ Failed to reset settings: ${error}`);
        }
      },
    });
  };

  const handleShowInExplorer = async () => {
    if (settingsPath) {
      try {
        await revealItemInDir(settingsPath);
      } catch (error) {
        onMessage(`✗ Failed to open file explorer: ${error}`);
      }
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          <div
            className={`space-y-3 transition-colors duration-300 ${
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
                    await settingsService.saveSettings(updated);
                    showSuccessFlash();
                  } catch (error) {
                    onMessage(`✗ Failed to save theme: ${error}`);
                  }
                }}
              >
                <SelectTrigger size="xs" className="w-36">
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

            {/* Configuration Profiles */}
            <div className="space-y-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm font-medium border-b border-dashed border-muted-foreground cursor-help">
                    Profiles
                  </span>
                </TooltipTrigger>
                <TooltipContent>Save/load configurations for different courses</TooltipContent>
              </Tooltip>
              {profiles.length > 0 && (
                <div className="flex gap-1">
                  <Select value={activeProfile || ""} onValueChange={handleLoadProfile}>
                    <SelectTrigger size="xs" className="flex-1">
                      <SelectValue placeholder="Select profile..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeProfile && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteProfile(activeProfile)}
                          size="xs"
                        >
                          Delete
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete selected profile</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
              <div className="flex gap-1">
                <Input
                  placeholder="New profile name"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  size="xs"
                  className="flex-1"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleSaveAsProfile} size="xs">
                      Save As
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save current settings as new profile</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm font-medium border-b border-dashed border-muted-foreground cursor-help">
                    Actions
                  </span>
                </TooltipTrigger>
                <TooltipContent>Import, export, or reset settings</TooltipContent>
              </Tooltip>
              <div className="flex flex-wrap gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleImport} size="xs" variant="outline">
                      Import...
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Load settings from a JSON file</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleExport} size="xs" variant="outline">
                      Export...
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save settings to a JSON file</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleShowInExplorer} size="xs" variant="outline">
                      Show File
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reveal settings file in Finder</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="destructive" onClick={handleReset} size="xs">
                      Reset
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset all settings to defaults</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={onClose} size="xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
