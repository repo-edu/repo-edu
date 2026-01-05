/**
 * UtilityBar - Bottom bar between tab content and output console.
 * Contains: Connections button, App settings, Profile selector, Save button, Profile menu.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@repo-edu/ui"
import {
  Check,
  Copy,
  Loader2,
  Menu,
  Pencil,
  Settings,
  Trash2,
} from "@repo-edu/ui/components/icons"
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
import { useCallback, useEffect, useState } from "react"
import { commands } from "../bindings/commands"
import type { ProfileSettings } from "../bindings/types"
import { useAppSettingsStore } from "../stores/appSettingsStore"
import { useConnectionsStore } from "../stores/connectionsStore"
import { useOutputStore } from "../stores/outputStore"
import { useProfileSettingsStore } from "../stores/profileSettingsStore"
import { useUiStore } from "../stores/uiStore"
import {
  ActionDropdown,
  type ActionDropdownItem,
  type ItemAction,
} from "./ActionDropdown"
import { SaveButton } from "./SaveButton"

interface UtilityBarProps {
  isDirty: boolean
  onSaved: () => void
}

export function UtilityBar({ isDirty, onSaved }: UtilityBarProps) {
  return (
    <div className="group/utilitybar flex items-center gap-2 px-2 py-1.5 border-t bg-muted/30">
      <ConnectionsButton />
      <AppSettingsMenu />
      <div className="flex-1" />
      <ProfileSelector isDirty={isDirty} />
      <SaveButton isDirty={isDirty} onSaved={onSaved} />
      <ProfileMenu isDirty={isDirty} />
    </div>
  )
}

function ConnectionsButton() {
  const setConnectionsSheetOpen = useUiStore(
    (state) => state.setConnectionsSheetOpen,
  )
  const lmsStatus = useConnectionsStore((state) => state.lmsStatus)
  const gitStatuses = useConnectionsStore((state) => state.gitStatuses)

  const hasConnected =
    lmsStatus === "connected" ||
    Object.values(gitStatuses).some((s) => s === "connected")

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setConnectionsSheetOpen(true)}
      className="gap-1.5"
    >
      Connections
      {hasConnected && <span className="size-2 rounded-full bg-success" />}
    </Button>
  )
}

function AppSettingsMenu() {
  const theme = useAppSettingsStore((state) => state.theme)
  const setTheme = useAppSettingsStore((state) => state.setTheme)
  const saveAppSettings = useAppSettingsStore((state) => state.save)

  const handleThemeChange = async (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme)
    await saveAppSettings()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-foreground"
        >
          <Settings className="size-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => handleThemeChange("light")}
          className="gap-2"
        >
          {theme === "light" && <Check className="size-4" />}
          {theme !== "light" && <span className="w-4" />}
          Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleThemeChange("dark")}
          className="gap-2"
        >
          {theme === "dark" && <Check className="size-4" />}
          {theme !== "dark" && <span className="w-4" />}
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleThemeChange("system")}
          className="gap-2"
        >
          {theme === "system" && <Check className="size-4" />}
          {theme !== "system" && <span className="w-4" />}
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ProfileDropdownItem extends ActionDropdownItem {
  name: string
}

interface ProfileSelectorProps {
  isDirty: boolean
}

function ProfileSelector({ isDirty }: ProfileSelectorProps) {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const setActiveProfile = useUiStore((state) => state.setActiveProfile)
  const setNewProfileDialogOpen = useUiStore(
    (state) => state.setNewProfileDialogOpen,
  )
  const appendOutput = useOutputStore((state) => state.appendText)
  const loadProfile = useProfileSettingsStore((state) => state.load)

  const [profiles, setProfiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Rename dialog state
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    profileName: string
    newName: string
  }>({ open: false, profileName: "", newName: "" })

  // Duplicate dialog state
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean
    sourceProfile: string
    newProfileName: string
    courseId: string
    courseName: string
    isProcessing: boolean
  }>({
    open: false,
    sourceProfile: "",
    newProfileName: "",
    courseId: "",
    courseName: "",
    isProcessing: false,
  })

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    profileName: string
  }>({ open: false, profileName: "" })

  // Unsaved changes confirmation dialog state
  const [unsavedDialog, setUnsavedDialog] = useState<{
    open: boolean
    targetProfile: string
  }>({ open: false, targetProfile: "" })

  const refreshProfiles = useCallback(async () => {
    try {
      const result = await commands.listProfiles()
      if (result.status === "ok") {
        setProfiles(result.data)
      }
    } catch (error) {
      console.error("Failed to load profiles:", error)
    }
  }, [])

  useEffect(() => {
    refreshProfiles()
  }, [refreshProfiles, activeProfile])

  const switchToProfile = async (name: string) => {
    setLoading(true)
    try {
      const result = await commands.setActiveProfile(name)
      if (result.status === "ok") {
        setActiveProfile(name)
        // Note: useLoadProfile will reset course status and auto-verify
        await loadProfile(name)
        appendOutput(`Switched to profile: ${name}`, "info")
      } else {
        appendOutput(
          `Failed to switch profile: ${result.error.message}`,
          "error",
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to switch profile: ${message}`, "error")
    } finally {
      setLoading(false)
    }
  }

  const handleProfileSelect = (index: number) => {
    const name = profiles[index]
    if (!name || name === activeProfile) return

    if (isDirty) {
      setUnsavedDialog({ open: true, targetProfile: name })
    } else {
      switchToProfile(name)
    }
  }

  const handleNewProfile = () => {
    setNewProfileDialogOpen(true)
  }

  const handleDuplicateProfile = (profileName: string) => {
    setDuplicateDialog({
      open: true,
      sourceProfile: profileName,
      newProfileName: `${profileName} copy`,
      courseId: "",
      courseName: "",
      isProcessing: false,
    })
  }

  const handleDuplicateConfirm = async () => {
    const { sourceProfile, newProfileName, courseId, courseName } =
      duplicateDialog
    if (!newProfileName.trim() || !courseId.trim() || !courseName.trim()) {
      return
    }

    setDuplicateDialog((prev) => ({ ...prev, isProcessing: true }))

    try {
      // Load source profile settings
      const loadResult = await commands.loadProfile(sourceProfile)
      if (loadResult.status === "error") {
        appendOutput(
          `Failed to load source profile: ${loadResult.error.message}`,
          "error",
        )
        setDuplicateDialog((prev) => ({ ...prev, isProcessing: false }))
        return
      }

      // Create new profile settings with new course, keeping other settings
      const sourceSettings = loadResult.data.settings
      const newSettings: ProfileSettings = {
        course: { id: courseId.trim(), name: courseName.trim() },
        git_connection: sourceSettings.git_connection,
        operations: sourceSettings.operations,
        exports: sourceSettings.exports,
      }

      // Save as new profile (roster is not copied - new profile starts with empty roster)
      const saveResult = await commands.saveProfile(
        newProfileName.trim(),
        newSettings,
      )
      if (saveResult.status === "error") {
        appendOutput(
          `Failed to create profile: ${saveResult.error.message}`,
          "error",
        )
        setDuplicateDialog((prev) => ({ ...prev, isProcessing: false }))
        return
      }

      await refreshProfiles()
      appendOutput(
        `Duplicated "${sourceProfile}" to "${newProfileName.trim()}" with course ${courseId.trim()}`,
        "success",
      )
      setDuplicateDialog({
        open: false,
        sourceProfile: "",
        newProfileName: "",
        courseId: "",
        courseName: "",
        isProcessing: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to duplicate profile: ${message}`, "error")
      setDuplicateDialog((prev) => ({ ...prev, isProcessing: false }))
    }
  }

  const handleRenameProfile = (profileName: string) => {
    setRenameDialog({
      open: true,
      profileName,
      newName: profileName,
    })
  }

  const handleRenameConfirm = async () => {
    const { profileName, newName } = renameDialog
    if (!newName.trim() || newName === profileName) {
      setRenameDialog({ open: false, profileName: "", newName: "" })
      return
    }

    try {
      const result = await commands.renameProfile(profileName, newName.trim())
      if (result.status === "ok") {
        appendOutput(
          `Renamed profile: ${profileName} → ${newName.trim()}`,
          "success",
        )
        // If we renamed the active profile, update it
        if (profileName === activeProfile) {
          setActiveProfile(newName.trim())
        }
        await refreshProfiles()
      } else {
        appendOutput(
          `Failed to rename profile: ${result.error.message}`,
          "error",
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to rename profile: ${message}`, "error")
    } finally {
      setRenameDialog({ open: false, profileName: "", newName: "" })
    }
  }

  const handleDeleteProfile = (profileName: string) => {
    setDeleteDialog({ open: true, profileName })
  }

  const handleDeleteConfirm = async () => {
    const { profileName } = deleteDialog
    const isActive = profileName === activeProfile
    const otherProfiles = profiles.filter((p) => p !== profileName)
    const willCreateDefault = otherProfiles.length === 0

    try {
      const result = await commands.deleteProfile(profileName)
      if (result.status === "ok") {
        appendOutput(`Deleted profile: ${profileName}`, "success")

        if (isActive) {
          // Note: useLoadProfile will reset course status and auto-verify
          if (willCreateDefault) {
            // Create and switch to Default profile
            const createResult = await commands.createProfile("Default", {
              id: "",
              name: "Default Course",
            })
            if (createResult.status === "ok") {
              await commands.setActiveProfile("Default")
              setActiveProfile("Default")
              await loadProfile("Default")
            }
          } else {
            // Switch to another existing profile
            const nextProfile = otherProfiles[0]
            await commands.setActiveProfile(nextProfile)
            setActiveProfile(nextProfile)
            await loadProfile(nextProfile)
          }
        }
        await refreshProfiles()
      } else {
        appendOutput(
          `Failed to delete profile: ${result.error.message}`,
          "error",
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to delete profile: ${message}`, "error")
    } finally {
      setDeleteDialog({ open: false, profileName: "" })
    }
  }

  // Transform profiles to ActionDropdownItem format
  const profileItems: ProfileDropdownItem[] = profiles.map((name) => ({
    id: name,
    label: name,
    name,
  }))

  const activeProfileIndex = profiles.indexOf(activeProfile ?? "")

  // Define actions for each profile item
  const profileItemActions: ItemAction<ProfileDropdownItem>[] = [
    {
      icon: <Copy className="size-3" />,
      onClick: (item) => handleDuplicateProfile(item.name),
      title: "Duplicate",
    },
    {
      icon: <Pencil className="size-3" />,
      onClick: (item) => handleRenameProfile(item.name),
      title: "Rename",
    },
    {
      icon: <Trash2 className="size-3" />,
      onClick: (item) => handleDeleteProfile(item.name),
      title: "Delete",
    },
  ]

  const canDuplicate =
    duplicateDialog.newProfileName.trim() &&
    duplicateDialog.courseId.trim() &&
    duplicateDialog.courseName.trim()

  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">Profile:</span>
        {loading ? (
          <Button variant="outline" size="sm" disabled className="w-44">
            <Loader2 className="size-4 animate-spin" />
          </Button>
        ) : (
          <ActionDropdown
            items={profileItems}
            activeIndex={activeProfileIndex >= 0 ? activeProfileIndex : 0}
            onSelect={handleProfileSelect}
            itemActions={profileItemActions}
            onAdd={handleNewProfile}
            addLabel="New Profile"
            placeholder="Select profile..."
            minWidth="140px"
            maxWidth="200px"
            contentMinWidth="260px"
          />
        )}
      </div>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog
        open={unsavedDialog.open}
        onOpenChange={(open) => setUnsavedDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              Loading a different profile will discard your unsaved changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                switchToProfile(unsavedDialog.targetProfile)
                setUnsavedDialog({ open: false, targetProfile: "" })
              }}
            >
              Discard & Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Dialog */}
      <Dialog
        open={duplicateDialog.open}
        onOpenChange={(open) => {
          if (!duplicateDialog.isProcessing) {
            setDuplicateDialog((prev) => ({ ...prev, open }))
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate Profile</DialogTitle>
            <DialogDescription>
              Create a copy of "{duplicateDialog.sourceProfile}" for a different
              course. Settings will be copied but the roster will start empty.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="dup-profile-name">Profile Name</Label>
              <Input
                id="dup-profile-name"
                placeholder="New profile name"
                value={duplicateDialog.newProfileName}
                onChange={(e) =>
                  setDuplicateDialog((prev) => ({
                    ...prev,
                    newProfileName: e.target.value,
                  }))
                }
                disabled={duplicateDialog.isProcessing}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dup-course-id">Course ID</Label>
              <Input
                id="dup-course-id"
                placeholder="e.g., 4TC00"
                value={duplicateDialog.courseId}
                onChange={(e) =>
                  setDuplicateDialog((prev) => ({
                    ...prev,
                    courseId: e.target.value,
                  }))
                }
                disabled={duplicateDialog.isProcessing}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dup-course-name">Course Name</Label>
              <Input
                id="dup-course-name"
                placeholder="e.g., Model-based Systems Engineering"
                value={duplicateDialog.courseName}
                onChange={(e) =>
                  setDuplicateDialog((prev) => ({
                    ...prev,
                    courseName: e.target.value,
                  }))
                }
                disabled={duplicateDialog.isProcessing}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDuplicateDialog((prev) => ({ ...prev, open: false }))
              }
              disabled={duplicateDialog.isProcessing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canDuplicate || duplicateDialog.isProcessing}
              onClick={handleDuplicateConfirm}
            >
              {duplicateDialog.isProcessing ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                "Duplicate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={renameDialog.open}
        onOpenChange={(open) => setRenameDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename Profile</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="New name"
            value={renameDialog.newName}
            onChange={(e) =>
              setRenameDialog((prev) => ({ ...prev, newName: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameDialog.newName.trim()) {
                handleRenameConfirm()
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRenameDialog({ open: false, profileName: "", newName: "" })
              }
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!renameDialog.newName.trim()}
              onClick={handleRenameConfirm}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              {profiles.filter((p) => p !== deleteDialog.profileName).length ===
              0 ? (
                <>
                  Delete "{deleteDialog.profileName}"? A new "Default" profile
                  will be created.
                </>
              ) : deleteDialog.profileName === activeProfile ? (
                <>
                  Delete "{deleteDialog.profileName}"? You will be switched to "
                  {profiles.find((p) => p !== deleteDialog.profileName)}".
                </>
              ) : (
                <>Delete "{deleteDialog.profileName}"?</>
              )}
              <br />
              <br />
              This will also delete the roster data associated with this
              profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface ProfileMenuProps {
  isDirty: boolean
}

function ProfileMenu({ isDirty }: ProfileMenuProps) {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const appendOutput = useOutputStore((state) => state.appendText)
  const loadProfile = useProfileSettingsStore((state) => state.load)
  const lmsConnection = useAppSettingsStore((state) => state.lmsConnection)
  const setCourseStatus = useConnectionsStore((state) => state.setCourseStatus)
  const resetCourseStatus = useConnectionsStore(
    (state) => state.resetCourseStatus,
  )
  const setCourse = useProfileSettingsStore((state) => state.setCourse)

  const handleRevert = async () => {
    if (!activeProfile) return

    try {
      resetCourseStatus()
      await loadProfile(activeProfile)
      appendOutput(`Reverted to saved state: ${activeProfile}`, "success")

      // Auto-verify course if LMS is connected
      if (lmsConnection) {
        const course = useProfileSettingsStore.getState().course
        if (course.id.trim()) {
          setCourseStatus("verifying")
          try {
            const result = await commands.verifyProfileCourse(activeProfile)
            if (result.status === "error") {
              setCourseStatus("failed", result.error.message)
              return
            }
            const { success, message, updated_name } = result.data
            if (!success) {
              setCourseStatus("failed", message)
              return
            }
            if (updated_name && updated_name !== course.name) {
              setCourse({ id: course.id, name: updated_name })
              appendOutput(`Course name updated: ${updated_name}`, "info")
            }
            setCourseStatus("verified")
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            setCourseStatus("failed", msg)
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to revert: ${message}`, "error")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={!activeProfile}
        >
          <Menu className="size-4" />
          <span className="sr-only">Profile menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleRevert} disabled={!isDirty}>
          Revert to Saved
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
