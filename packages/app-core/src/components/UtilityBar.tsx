/**
 * UtilityBar - Bottom status bar.
 * Contains: Profile switcher + menu (left), Save button (right).
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@repo-edu/ui"
import {
  Copy,
  FolderOpen,
  Loader2,
  Menu,
  Pencil,
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
import { useState } from "react"
import { commands } from "../bindings/commands"
import { useProfiles } from "../hooks/useProfiles"
import { useToastStore } from "../stores/toastStore"
import { useUiStore } from "../stores/uiStore"
import { ProfileSwitcher } from "./ProfileSwitcher"
import { SaveButton } from "./SaveButton"

interface UtilityBarProps {
  isDirty: boolean
  onSaved: () => void
}

export function UtilityBar({ isDirty, onSaved }: UtilityBarProps) {
  return (
    <div className="group/utilitybar border-t bg-muted/30">
      <div className="flex items-center gap-2 px-2 py-1.5 min-w-0">
        <div className="flex items-center min-w-0">
          <ProfileSwitcher isDirty={isDirty} />
          <ProfileMenu />
        </div>
        <div className="flex-1" />
        <div className="shrink-0">
          <SaveButton isDirty={isDirty} onSaved={onSaved} />
        </div>
      </div>
    </div>
  )
}

/**
 * ProfileMenu - Dropdown with profile management actions for the active profile.
 * Duplicate, Rename, Delete, and Show Profile Location.
 */
function ProfileMenu() {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const addToast = useToastStore((state) => state.addToast)
  const { profiles, duplicateProfile, renameProfile, deleteProfile } =
    useProfiles()

  // --- Dialog state ---

  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    profileName: string
    newName: string
  }>({ open: false, profileName: "", newName: "" })

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

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    profileName: string
  }>({ open: false, profileName: "" })

  // --- Handlers ---

  const handleShowProfileLocation = async () => {
    try {
      const result = await commands.revealProfilesDirectory()
      if (result.status === "error") {
        addToast(`Failed to open profiles directory: ${result.error.message}`, {
          tone: "error",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addToast(`Failed to open profiles directory: ${message}`, {
        tone: "error",
      })
    }
  }

  const handleDuplicateClick = () => {
    if (!activeProfile) return
    setDuplicateDialog({
      open: true,
      sourceProfile: activeProfile,
      newProfileName: `${activeProfile} copy`,
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

    const success = await duplicateProfile(
      sourceProfile,
      newProfileName.trim(),
      courseId.trim(),
      courseName.trim(),
    )

    if (success) {
      setDuplicateDialog({
        open: false,
        sourceProfile: "",
        newProfileName: "",
        courseId: "",
        courseName: "",
        isProcessing: false,
      })
    } else {
      setDuplicateDialog((prev) => ({ ...prev, isProcessing: false }))
    }
  }

  const handleRenameClick = () => {
    if (!activeProfile) return
    setRenameDialog({
      open: true,
      profileName: activeProfile,
      newName: activeProfile,
    })
  }

  const handleRenameConfirm = async () => {
    const { profileName, newName } = renameDialog
    await renameProfile(profileName, newName)
    setRenameDialog({ open: false, profileName: "", newName: "" })
  }

  const handleDeleteClick = () => {
    if (!activeProfile) return
    setDeleteDialog({ open: true, profileName: activeProfile })
  }

  const handleDeleteConfirm = async () => {
    const { profileName } = deleteDialog
    await deleteProfile(profileName)
    setDeleteDialog({ open: false, profileName: "" })
  }

  // --- Derived state for dialogs ---

  const canDuplicate =
    duplicateDialog.newProfileName.trim() &&
    duplicateDialog.courseId.trim() &&
    duplicateDialog.courseName.trim()

  const profileToDelete = deleteDialog.profileName
  const remainingProfiles = profiles.filter((p) => p.name !== profileToDelete)
  const isLastProfile = remainingProfiles.length === 0
  const nextProfile = remainingProfiles[0]?.name

  return (
    <>
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
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuLabel className="text-foreground">
            {activeProfile}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={handleDuplicateClick}>
            <Copy className="size-4 mr-2" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRenameClick}>
            <Pencil className="size-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDeleteClick}>
            <Trash2 className="size-4 mr-2" />
            Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleShowProfileLocation}>
            <FolderOpen className="size-4 mr-2" />
            Show Profile Location
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
              {isLastProfile ? (
                <>Delete "{profileToDelete}"? This is your last profile.</>
              ) : profileToDelete === activeProfile ? (
                <>
                  Delete "{profileToDelete}"? You will be switched to "
                  {nextProfile}".
                </>
              ) : (
                <>Delete "{profileToDelete}"?</>
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
