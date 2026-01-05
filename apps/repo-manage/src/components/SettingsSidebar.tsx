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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo-edu/ui/components/ui/tooltip"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { useState } from "react"
import { SUCCESS_FLASH_MS, THEME_OPTIONS } from "../constants"
import { useProfileActions } from "../hooks/useProfileActions"
import * as settingsService from "../services/settingsService"
import { getErrorMessage } from "../types/error"
import type { GuiSettings, ProfileSettings } from "../types/settings"
import {
  ActionDropdown,
  type ActionDropdownItem,
  type ItemAction,
} from "./ActionDropdown"
import { MdiClose } from "./icons/MdiClose"
import { MdiContentCopy } from "./icons/MdiContentCopy"
import { MdiPencil } from "./icons/MdiPencil"
import { MdiWeatherSunny } from "./icons/MdiWeatherSunny"

interface SettingsSidebarProps {
  onClose: () => void
  currentSettings: GuiSettings
  getProfileSettings: () => ProfileSettings
  onSettingsLoaded: (settings: GuiSettings, updateBaseline?: boolean) => void
  onMessage: (message: string) => void
  isDirty: boolean
  onSaved: () => void
}

interface ProfileDropdownItem extends ActionDropdownItem {
  name: string
}

export function SettingsSidebar({
  onClose,
  currentSettings,
  getProfileSettings,
  onSettingsLoaded,
  onMessage,
  isDirty,
  onSaved,
}: SettingsSidebarProps) {
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
    onConfirm: (value: string) => void
  }>({
    open: false,
    title: "",
    placeholder: "",
    value: "",
    onConfirm: () => {},
  })

  const showSuccessFlash = () => {
    setSuccessFlash(true)
    setTimeout(() => setSuccessFlash(false), SUCCESS_FLASH_MS)
  }

  const profileActions = useProfileActions({
    getProfileSettings,
    onSettingsLoaded: (settings, updateBaseline) =>
      onSettingsLoaded(settings, updateBaseline),
    onMessage,
    onSaved,
    onSuccess: showSuccessFlash,
  })

  const handleShowLocation = async () => {
    if (profileActions.settingsPath) {
      try {
        await revealItemInDir(profileActions.settingsPath)
      } catch (error) {
        onMessage(`✗ Failed to open file explorer: ${getErrorMessage(error)}`)
      }
    }
  }

  const handleSaveWindowState = async () => {
    showSuccessFlash()
    onMessage("✓ Window state is managed automatically.")
  }

  // Transform profiles to ActionDropdownItem format
  const profileItems: ProfileDropdownItem[] = profileActions.profiles.map(
    (name) => ({
      id: name,
      label: name,
      name,
    }),
  )

  const activeProfileIndex = profileActions.profiles.indexOf(
    profileActions.activeProfile ?? "",
  )

  const handleProfileSelect = (index: number) => {
    const name = profileActions.profiles[index]
    if (!name || name === profileActions.activeProfile) return

    if (isDirty) {
      setConfirmDialog({
        open: true,
        title: "Unsaved Changes",
        description:
          "Loading a different profile will discard your unsaved changes.",
        onConfirm: () => profileActions.loadProfile(name),
      })
    } else {
      profileActions.loadProfile(name)
    }
  }

  const handleNewEmptyProfile = () => {
    setPromptDialog({
      open: true,
      title: "New Empty Profile",
      placeholder: "Profile name",
      value: "",
      onConfirm: (name) => {
        profileActions.createProfile(name, false)
      },
    })
  }

  const handleDuplicateProfile = (profileName: string) => {
    setPromptDialog({
      open: true,
      title: "Duplicate Profile",
      placeholder: "Profile name",
      value: `${profileName} copy`,
      onConfirm: async (newName) => {
        // Load the source profile settings, then save as new profile
        try {
          const result = await settingsService.loadProfile(profileName)
          const profileSettings: ProfileSettings = {
            git: result.settings.git,
            lms: result.settings.lms,
            repo: result.settings.repo,
          }
          await settingsService.saveProfile(newName, profileSettings)
          await profileActions.refreshProfiles()
          showSuccessFlash()
          onMessage(`✓ Duplicated "${profileName}" to "${newName}"`)
        } catch (error) {
          onMessage(`✗ Failed to duplicate profile: ${getErrorMessage(error)}`)
        }
      },
    })
  }

  const handleRenameProfile = (profileName: string) => {
    setPromptDialog({
      open: true,
      title: "Rename Profile",
      placeholder: "New name",
      value: profileName,
      onConfirm: async (newName) => {
        try {
          await settingsService.renameProfile(profileName, newName)
          await profileActions.refreshProfiles()
          showSuccessFlash()
          onMessage(`✓ Renamed profile to: ${newName}`)
        } catch (error) {
          onMessage(`✗ Failed to rename profile: ${getErrorMessage(error)}`)
        }
      },
    })
  }

  const handleDeleteProfile = (profileName: string) => {
    const otherProfile =
      profileActions.profiles.find((p) => p !== profileName) || "Default"
    const willCreateDefault = !profileActions.profiles.some(
      (p) => p !== profileName,
    )
    const isActive = profileName === profileActions.activeProfile

    setConfirmDialog({
      open: true,
      title: "Delete Profile",
      description: willCreateDefault
        ? `Delete "${profileName}"? A new "Default" profile will be created.`
        : `Delete "${profileName}"?${isActive ? ` You will be switched to "${otherProfile}".` : ""}`,
      onConfirm: async () => {
        try {
          await settingsService.deleteProfile(profileName)
          onMessage(`✓ Deleted profile: ${profileName}`)

          if (isActive) {
            if (willCreateDefault) {
              // Create and switch to Default profile
              await profileActions.createProfile("Default", false)
            } else {
              // Switch to another existing profile
              await profileActions.loadProfile(otherProfile)
            }
          }

          await profileActions.refreshProfiles()
          showSuccessFlash()
        } catch (error) {
          onMessage(`✗ Failed to delete profile: ${getErrorMessage(error)}`)
        }
      },
    })
  }

  // Define actions for each profile item
  const profileItemActions: ItemAction<ProfileDropdownItem>[] = [
    {
      icon: <MdiContentCopy className="size-3" />,
      onClick: (item) => handleDuplicateProfile(item.name),
      title: "Duplicate",
    },
    {
      icon: <MdiPencil className="size-3" />,
      onClick: (item) => handleRenameProfile(item.name),
      title: "Rename",
    },
    {
      icon: <MdiClose className="size-3" />,
      onClick: (item) => handleDeleteProfile(item.name),
      title: "Delete",
    },
  ]

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
                <Button size="xs" variant="outline" className="h-7 w-7 p-0">
                  {currentSettings.theme === "light" ? (
                    <MdiWeatherSunny className="size-4" />
                  ) : currentSettings.theme === "dark" ? (
                    "☾"
                  ) : (
                    "◐"
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {THEME_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    className={
                      currentSettings.theme === opt.value ? "bg-accent" : ""
                    }
                    onClick={async () => {
                      const updated = {
                        ...currentSettings,
                        theme: opt.value,
                        sidebar_open: true,
                      }
                      onSettingsLoaded(updated, true)
                      try {
                        const existing = (await settingsService
                          .loadAppSettings()
                          .catch(() => null)) ?? {
                          theme: opt.value,
                          logging: currentSettings.logging,
                          lms_connection: null,
                          git_connections: {},
                        }
                        const lmsConnection = existing.lms_connection ?? null
                        const gitConnections = existing.git_connections ?? {}

                        await settingsService.saveAppSettings({
                          ...existing,
                          theme: opt.value,
                          logging: currentSettings.logging,
                          lms_connection: lmsConnection,
                          git_connections: gitConnections,
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
              className="size-5 p-0"
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
            <h3 className="settings-section-title">Profile</h3>
            <ActionDropdown
              items={profileItems}
              activeIndex={activeProfileIndex >= 0 ? activeProfileIndex : 0}
              onSelect={handleProfileSelect}
              itemActions={profileItemActions}
              onAdd={handleNewEmptyProfile}
              addLabel="Add profile"
              placeholder="Select profile..."
              minWidth="120px"
              maxWidth="180px"
              contentMinWidth="200px"
            />
            <div className="flex gap-1 items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="xs"
                      variant={isDirty ? "default" : "outline"}
                      onClick={profileActions.saveProfile}
                      disabled={!profileActions.activeProfile || !isDirty}
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
                      onClick={profileActions.revertProfile}
                      disabled={!profileActions.activeProfile || !isDirty}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-7 w-7 p-0 text-foreground shrink-0"
                  >
                    ⋯
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleShowLocation}>
                    Open profile folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <span
              className={`text-xs ${isDirty ? "text-warning" : "invisible"}`}
            >
              Unsaved changes
            </span>
          </section>

          {/* Window Section */}
          <section className="settings-section">
            <h3 className="settings-section-title">Window</h3>
            <div className="flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={handleSaveWindowState}
                  >
                    Save State
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Save window size, active tab, and collapsed sections
                </TooltipContent>
              </Tooltip>
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
        <DialogContent className="max-w-xs">
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
                promptDialog.onConfirm(promptDialog.value)
                setPromptDialog((prev) => ({ ...prev, open: false }))
              }
            }}
            autoFocus
          />
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
                promptDialog.onConfirm(promptDialog.value)
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
