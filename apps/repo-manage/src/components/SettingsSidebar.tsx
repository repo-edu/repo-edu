import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo-edu/ui/components/ui/alert-dialog"
import { Button } from "@repo-edu/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo-edu/ui/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui/components/ui/dropdown-menu"
import { Input } from "@repo-edu/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo-edu/ui/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui/components/ui/tooltip"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { useEffect, useState } from "react"
import * as settingsService from "../services/settingsService"
import { getErrorMessage } from "../types/error"
import type { GuiSettings, Theme } from "../types/settings"

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System (Auto)" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

interface SettingsSidebarProps {
  onClose: () => void
  currentSettings: GuiSettings
  getSettings: () => GuiSettings
  onSettingsLoaded: (settings: GuiSettings, updateBaseline?: boolean) => void
  onMessage: (message: string) => void
  isDirty: boolean
  onSaved: () => void
}

export function SettingsSidebar({
  onClose,
  currentSettings,
  getSettings,
  onSettingsLoaded,
  onMessage,
  isDirty,
  onSaved,
}: SettingsSidebarProps) {
  // Helper to ensure settings have required fields for save operations
  const ensureComplete = (settings: GuiSettings) => ({
    ...settings,
    collapsed_sections: settings.collapsed_sections ?? [],
  })

  const [settingsPath, setSettingsPath] = useState<string>("")
  const [profiles, setProfiles] = useState<string[]>([])
  const [activeProfile, setActiveProfile] = useState<string | null>(null)
  const [successFlash, setSuccessFlash] = useState(false)

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: "", description: "", onConfirm: () => {} })

  // Prompt dialog state (for New/Rename)
  const [promptDialog, setPromptDialog] = useState<{
    open: boolean
    title: string
    placeholder: string
    value: string
    showCopyChoice?: boolean
    copyFromCurrent: boolean
    onConfirm: (value: string, copyFromCurrent: boolean) => void
  }>({
    open: false,
    title: "",
    placeholder: "",
    value: "",
    copyFromCurrent: true,
    onConfirm: () => {},
  })

  const loadSettingsPath = async () => {
    try {
      const path = await settingsService.getSettingsPath()
      setSettingsPath(path)
    } catch (error) {
      console.error("Failed to get settings path:", error)
    }
  }

  const loadProfiles = async () => {
    try {
      const profileList = await settingsService.listProfiles()
      setProfiles(profileList)
      const active = await settingsService.getActiveProfile()
      setActiveProfile(active)
    } catch (error) {
      console.error("Failed to load profiles:", error)
    }
  }

  useEffect(() => {
    loadSettingsPath()
    loadProfiles()
  }, [])

  const showSuccessFlash = () => {
    setSuccessFlash(true)
    setTimeout(() => setSuccessFlash(false), 500)
  }

  // Active Profile Actions
  const handleSaveActiveProfile = async () => {
    if (!activeProfile) {
      onMessage("✗ No active profile to save")
      return
    }
    try {
      await settingsService.saveProfile(activeProfile, ensureComplete(getSettings()))
      showSuccessFlash()
      onMessage(`✓ Saved profile: ${activeProfile}`)
      onSaved()
    } catch (error) {
      onMessage(`✗ Failed to save profile: ${getErrorMessage(error)}`)
    }
  }

  const handleRevertProfile = async () => {
    if (!activeProfile) return
    try {
      const settings = await settingsService.loadProfile(activeProfile)
      onSettingsLoaded(settings, true) // true = update baseline
      showSuccessFlash()
      onMessage(`✓ Reverted to saved: ${activeProfile}`)
    } catch (error) {
      onMessage(`✗ Failed to revert profile: ${getErrorMessage(error)}`)
    }
  }

  const handleShowLocation = async () => {
    if (settingsPath) {
      try {
        await revealItemInDir(settingsPath)
      } catch (error) {
        onMessage(`✗ Failed to open file explorer: ${getErrorMessage(error)}`)
      }
    }
  }

  // Profile List Actions
  const handleLoadProfile = async (name: string) => {
    if (!name) return
    try {
      const settings = await settingsService.loadProfile(name)
      await settingsService.setActiveProfile(name)
      onSettingsLoaded(settings, true) // true = update baseline (clear dirty state)
      setActiveProfile(name)
      showSuccessFlash()
      onMessage(`✓ Loaded profile: ${name}`)
    } catch (error) {
      // Load defaults so the app remains functional, but don't update baseline
      // so settings show as dirty and can be saved to fix the profile
      try {
        await settingsService.setActiveProfile(name)
      } catch {
        // Ignore - profile might not exist on disk yet
      }
      const defaultSettings = await settingsService.getDefaultSettings()
      onSettingsLoaded(defaultSettings, false)
      setActiveProfile(name)
      onMessage(
        `⚠ Failed to load profile '${name}':\n${getErrorMessage(error)}\n→ Using default settings for profile '${name}'.`,
      )
    }
  }

  const handleProfileSelect = (name: string) => {
    if (!name || name === activeProfile) return

    if (isDirty) {
      setConfirmDialog({
        open: true,
        title: "Unsaved Changes",
        description:
          "Loading a different profile will discard your unsaved changes.",
        onConfirm: () => handleLoadProfile(name),
      })
    } else {
      handleLoadProfile(name)
    }
  }

  const handleNewProfile = () => {
    setPromptDialog({
      open: true,
      title: "New Profile",
      placeholder: "Profile name",
      value: "",
      showCopyChoice: true,
      copyFromCurrent: true,
      onConfirm: async (name, copyFromCurrent) => {
        if (!name.trim()) {
          onMessage("✗ Please enter a profile name")
          return
        }
        try {
          const settings = ensureComplete(
            copyFromCurrent
              ? getSettings()
              : await settingsService.getDefaultSettings(),
          )
          await settingsService.saveProfile(name, settings)
          await settingsService.setActiveProfile(name)
          onSettingsLoaded(settings, true)
          setActiveProfile(name)
          await loadProfiles()
          showSuccessFlash()
          onMessage(`✓ Created and activated profile: ${name}`)
        } catch (error) {
          onMessage(`✗ Failed to create profile: ${getErrorMessage(error)}`)
        }
      },
    })
  }

  const handleRenameProfile = () => {
    if (!activeProfile) {
      onMessage("✗ No active profile to rename")
      return
    }
    setPromptDialog({
      open: true,
      title: "Rename Profile",
      placeholder: "New name",
      value: activeProfile,
      showCopyChoice: false,
      copyFromCurrent: true,
      onConfirm: async (newName) => {
        if (!newName.trim()) {
          onMessage("✗ Please enter a profile name")
          return
        }
        try {
          await settingsService.renameProfile(activeProfile, newName)
          showSuccessFlash()
          onMessage(`✓ Renamed profile to: ${newName}`)
          await loadProfiles()
          setActiveProfile(newName)
        } catch (error) {
          onMessage(`✗ Failed to rename profile: ${getErrorMessage(error)}`)
        }
      },
    })
  }

  const handleDeleteProfile = () => {
    if (!activeProfile) {
      onMessage("✗ No active profile to delete")
      return
    }
    const otherProfile = profiles.find((p) => p !== activeProfile) || "Default"
    const willCreateDefault = !profiles.some((p) => p !== activeProfile)

    setConfirmDialog({
      open: true,
      title: "Delete Profile",
      description: willCreateDefault
        ? `Delete "${activeProfile}"? A new "Default" profile will be created.`
        : `Delete "${activeProfile}"? You will be switched to "${otherProfile}".`,
      onConfirm: async () => {
        try {
          await settingsService.deleteProfile(activeProfile)
          onMessage(`✓ Deleted profile: ${activeProfile}`)

          if (willCreateDefault) {
            // Create and switch to Default profile
            await settingsService.saveProfile("Default", ensureComplete(getSettings()))
            await settingsService.setActiveProfile("Default")
            setActiveProfile("Default")
            onMessage(`✓ Created new profile: Default`)
          } else {
            // Switch to another existing profile
            await handleLoadProfile(otherProfile)
          }

          await loadProfiles()
          showSuccessFlash()
        } catch (error) {
          onMessage(`✗ Failed to delete profile: ${getErrorMessage(error)}`)
        }
      },
    })
  }

  return (
    <>
      <div className="settings-sidebar">
        {/* Header */}
        <div className="settings-sidebar-header">
          <span className="text-sm font-semibold text-muted-foreground">
            Settings
          </span>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="xs"
                  variant="outline"
                  className="h-5 px-1.5 text-[10px]"
                >
                  {currentSettings.theme === "light"
                    ? "☀"
                    : currentSettings.theme === "dark"
                      ? "☾"
                      : "◐"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {THEME_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={async () => {
                      const updated = {
                        ...currentSettings,
                        theme: opt.value,
                        sidebar_open: true,
                      }
                      onSettingsLoaded(updated, false)
                      try {
                        await settingsService.saveAppSettings({
                          theme: opt.value,
                          active_tab: currentSettings.active_tab,
                          collapsed_sections:
                            currentSettings.collapsed_sections ?? [],
                          sidebar_open: true,
                          window_width: currentSettings.window_width,
                          window_height: currentSettings.window_height,
                          logging: currentSettings.logging,
                        })
                        showSuccessFlash()
                      } catch (error) {
                        onMessage(
                          `✗ Failed to save theme: ${getErrorMessage(error)}`,
                        )
                      }
                    }}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="xs"
              onClick={onClose}
              className="h-5 w-5 p-0"
            >
              ×
            </Button>
          </div>
        </div>

        {/* Content */}
        <div
          className={`settings-sidebar-content transition-colors duration-300 ${
            successFlash ? "bg-accent" : ""
          }`}
        >
          {/* Profile Section */}
          <section className="settings-section">
            <div className="flex items-center justify-between">
              <h3 className="settings-section-title">Profile</h3>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-5 w-5 p-0 text-foreground"
                  >
                    ⋯
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleNewProfile}>
                    New
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleRenameProfile}
                    disabled={!activeProfile}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDeleteProfile}
                    disabled={!activeProfile}
                  >
                    Delete
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShowLocation}>
                    Show in Finder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Select
              value={activeProfile || ""}
              onValueChange={handleProfileSelect}
            >
              <SelectTrigger
                size="xs"
                className="!ring-0 !ring-offset-0 !outline-none focus:!border-border"
              >
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
            <div className="flex gap-1 items-center">
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
                  {!isDirty
                    ? "No unsaved changes"
                    : "Save current settings to active profile"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={handleRevertProfile}
                      disabled={!activeProfile || !isDirty}
                    >
                      Revert
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!isDirty
                    ? "No changes to revert"
                    : "Revert to last saved state"}
                </TooltipContent>
              </Tooltip>
              {isDirty && (
                <span className="text-[10px] text-warning ml-1">
                  Unsaved changes
                </span>
              )}
            </div>
          </section>
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
            <AlertDialogDescription>
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmDialog.onConfirm()
                setConfirmDialog((prev) => ({ ...prev, open: false }))
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
            onChange={(e) =>
              setPromptDialog((prev) => ({ ...prev, value: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && promptDialog.value.trim()) {
                promptDialog.onConfirm(
                  promptDialog.value,
                  promptDialog.copyFromCurrent,
                )
                setPromptDialog((prev) => ({ ...prev, open: false }))
              }
            }}
            autoFocus
          />
          {promptDialog.showCopyChoice && (
            <div className="flex gap-1">
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  setPromptDialog((prev) => ({
                    ...prev,
                    copyFromCurrent: true,
                  }))
                }
                className={
                  promptDialog.copyFromCurrent ? "bg-muted" : "opacity-50"
                }
              >
                Copy current
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  setPromptDialog((prev) => ({
                    ...prev,
                    copyFromCurrent: false,
                  }))
                }
                className={
                  !promptDialog.copyFromCurrent ? "bg-muted" : "opacity-50"
                }
              >
                Start empty
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                setPromptDialog((prev) => ({ ...prev, open: false }))
              }
            >
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={!promptDialog.value.trim()}
              onClick={() => {
                promptDialog.onConfirm(
                  promptDialog.value,
                  promptDialog.copyFromCurrent,
                )
                setPromptDialog((prev) => ({ ...prev, open: false }))
              }}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
