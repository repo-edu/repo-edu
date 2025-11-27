import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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
import { AlertCircle } from "@repo-edu/ui/components/icons";
import type { GuiSettings } from "../types/settings";

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
      const path = await invoke<string>("get_settings_path");
      setSettingsPath(path);
    } catch (error) {
      console.error("Failed to get settings path:", error);
    }
  };

  // Load profiles and active profile
  const loadProfiles = async () => {
    try {
      const profileList = await invoke<string[]>("list_profiles");
      setProfiles(profileList);
      const active = await invoke<string | null>("get_active_profile");
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
      const settings = await invoke<GuiSettings>("load_profile", { name });
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
      await invoke("save_profile", { name: newProfileName, settings: currentSettings });
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
          await invoke("delete_profile", { name });
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
        const settings = await invoke<GuiSettings>("import_settings", {
          path: filePath,
        });
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
        await invoke("export_settings", {
          settings: currentSettings,
          path: filePath,
        });
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
          const settings = await invoke<GuiSettings>("reset_settings");
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
        <DialogContent className="max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Settings Management</DialogTitle>
          </DialogHeader>

          <div
            className={`space-y-4 transition-colors duration-300 ${
              successFlash ? "bg-green-50" : ""
            }`}
          >
            {/* Help text banner */}
            <div className="flex items-center gap-2 p-2 text-xs bg-blue-50 border border-blue-200 rounded text-blue-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              All operations in this menu take effect immediately
            </div>

            {/* Configuration Profiles */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Configuration Profiles</h4>
              {profiles.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-muted-foreground mb-1">
                    Active Profile: <strong>{activeProfile || "None"}</strong>
                  </p>
                  <Select value={activeProfile || ""} onValueChange={handleLoadProfile}>
                    <SelectTrigger size="xs">
                      <SelectValue placeholder="-- Select Profile --" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-1 mb-2">
                <Input
                  placeholder="New profile name"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  size="xs"
                  className="flex-1"
                />
                <Button onClick={handleSaveAsProfile} size="xs">
                  Save As
                </Button>
              </div>
              {activeProfile && (
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteProfile(activeProfile)}
                  size="xs"
                  className="w-full mb-2"
                >
                  Delete Current Profile
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Save different configurations for different courses or semesters.
              </p>
            </div>

            <Separator />

            {/* Current Settings File */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Current Settings File</h4>
              <Button onClick={handleShowInExplorer} size="xs" className="mb-2">
                Show in File Explorer
              </Button>
              <p className="text-xs text-muted-foreground">
                Open the settings file location in your system's file explorer.
              </p>
            </div>

            <Separator />

            {/* Import/Export */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Import / Export</h4>
              <div className="flex gap-2 mb-2">
                <Button onClick={handleImport} size="xs">
                  Import Settings...
                </Button>
                <Button onClick={handleExport} size="xs">
                  Export Settings...
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Import settings from a JSON file or export current settings to share or backup.
              </p>
            </div>

            <Separator />

            {/* Reset */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Reset</h4>
              <Button variant="destructive" onClick={handleReset} size="xs" className="mb-2">
                Reset to Defaults
              </Button>
              <p className="text-xs text-muted-foreground">
                Reset and save all settings to default values.
              </p>
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
