/**
 * ProfileSwitcher - Dropdown-based profile selector in the status bar.
 * Shows all profiles with switch-on-click and per-item kebab menu for
 * Duplicate / Rename / Delete. Active profile highlighted with bg-selection.
 */

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@repo-edu/ui"
import {
  ChevronUp,
  Copy,
  EllipsisVertical,
  Loader2,
  Pencil,
  Plus,
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
import { useProfiles } from "../hooks/useProfiles"
import { useUiStore } from "../stores/uiStore"

interface ProfileSwitcherProps {
  isDirty: boolean
}

export function ProfileSwitcher({ isDirty }: ProfileSwitcherProps) {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const setNewProfileDialogOpen = useUiStore(
    (state) => state.setNewProfileDialogOpen,
  )
  const {
    profiles,
    switchProfile,
    duplicateProfile,
    renameProfile,
    deleteProfile,
  } = useProfiles()

  // --- Dialog state (moved from ProfileSidebar) ---

  const [unsavedDialog, setUnsavedDialog] = useState<{
    open: boolean
    targetProfile: string
  }>({ open: false, targetProfile: "" })

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

  const handleProfileSelect = (name: string) => {
    if (name === activeProfile) return

    if (isDirty) {
      setUnsavedDialog({ open: true, targetProfile: name })
    } else {
      switchProfile(name)
    }
  }

  const handleDuplicateClick = (name: string) => {
    setDuplicateDialog({
      open: true,
      sourceProfile: name,
      newProfileName: `${name} copy`,
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

  const handleRenameClick = (name: string) => {
    setRenameDialog({
      open: true,
      profileName: name,
      newName: name,
    })
  }

  const handleRenameConfirm = async () => {
    const { profileName, newName } = renameDialog
    await renameProfile(profileName, newName)
    setRenameDialog({ open: false, profileName: "", newName: "" })
  }

  const handleDeleteClick = (name: string) => {
    setDeleteDialog({ open: true, profileName: name })
  }

  const handleDeleteConfirm = async () => {
    const { profileName } = deleteDialog
    await deleteProfile(profileName)
    setDeleteDialog({ open: false, profileName: "" })
  }

  // --- Derived state for delete dialog ---

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
            className="max-w-full min-w-0 overflow-hidden"
          >
            <span className="truncate">
              <span className="text-muted-foreground">Profile:</span>{" "}
              {activeProfile ?? "None"}
            </span>
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="top">
          {profiles.map((profile) => {
            const isActive = profile.name === activeProfile
            return (
              <DropdownMenuSub key={profile.name}>
                <DropdownMenuSubTrigger
                  onClick={(e) => {
                    e.preventDefault()
                    handleProfileSelect(profile.name)
                  }}
                  className={cn(
                    "gap-2",
                    isActive && "bg-selection data-[state=open]:bg-selection",
                  )}
                >
                  <span className="flex-1 truncate">{profile.name}</span>
                  <EllipsisVertical className="size-3 shrink-0 text-muted-foreground" />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => handleDuplicateClick(profile.name)}
                  >
                    <Copy className="size-3 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRenameClick(profile.name)}
                  >
                    <Pencil className="size-3 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteClick(profile.name)}
                  >
                    <Trash2 className="size-3 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          })}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setNewProfileDialogOpen(true)}>
            <Plus className="size-3.5 mr-2" />
            New Profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
                switchProfile(unsavedDialog.targetProfile)
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
