/**
 * ProfileSwitcher - Dropdown-based profile selector in the status bar.
 * Shows all profiles with click-to-switch, per-profile management actions,
 * and a "New Profile" action.
 * Active profile highlighted with bg-selection.
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@repo-edu/ui"
import {
  ChevronUp,
  Copy,
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
import { type KeyboardEvent, type MouseEvent, useState } from "react"
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
  const [open, setOpen] = useState(false)

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

  const handleProfileSelect = (name: string) => {
    if (name === activeProfile) return

    setOpen(false)

    if (isDirty) {
      setUnsavedDialog({ open: true, targetProfile: name })
    } else {
      switchProfile(name)
    }
  }

  const handleProfileKeyDown = (
    name: string,
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget) {
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleProfileSelect(name)
    }
  }

  const handleActionClick = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation()
    action()
  }

  const handleDuplicateClick = (profileName: string) => {
    setOpen(false)
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

  const handleRenameClick = (profileName: string) => {
    setOpen(false)
    setRenameDialog({
      open: true,
      profileName,
      newName: profileName,
    })
  }

  const handleRenameConfirm = async () => {
    const { profileName, newName } = renameDialog
    await renameProfile(profileName, newName)
    setRenameDialog({ open: false, profileName: "", newName: "" })
  }

  const handleDeleteClick = (profileName: string) => {
    setOpen(false)
    setDeleteDialog({ open: true, profileName })
  }

  const handleDeleteConfirm = async () => {
    const { profileName } = deleteDialog
    await deleteProfile(profileName)
    setDeleteDialog({ open: false, profileName: "" })
  }

  const handleNewProfile = () => {
    setOpen(false)
    setNewProfileDialogOpen(true)
  }

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
      <DropdownMenu open={open} onOpenChange={setOpen}>
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

        <DropdownMenuContent align="start" side="top" className="min-w-0 w-fit">
          {profiles.map((profile) => {
            const isActive = profile.name === activeProfile
            return (
              <div
                key={profile.name}
                role="option"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => handleProfileSelect(profile.name)}
                onKeyDown={(event) => handleProfileKeyDown(profile.name, event)}
                className={cn(
                  "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
                  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                  isActive && "bg-selection",
                )}
              >
                <span className="truncate">{profile.name}</span>
                <div className="flex shrink-0 items-center gap-0">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-4"
                    aria-label={`Duplicate ${profile.name}`}
                    title="Duplicate"
                    onClick={(event) =>
                      handleActionClick(event, () =>
                        handleDuplicateClick(profile.name),
                      )
                    }
                  >
                    <Copy className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-4"
                    aria-label={`Rename ${profile.name}`}
                    title="Rename"
                    onClick={(event) =>
                      handleActionClick(event, () =>
                        handleRenameClick(profile.name),
                      )
                    }
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-4"
                    aria-label={`Delete ${profile.name}`}
                    title="Delete"
                    onClick={(event) =>
                      handleActionClick(event, () =>
                        handleDeleteClick(profile.name),
                      )
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            )
          })}

          <DropdownMenuSeparator className="my-0.5" />

          <div
            role="option"
            tabIndex={0}
            aria-selected={false}
            onClick={handleNewProfile}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                handleNewProfile()
              }
            }}
            className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
          >
            <Plus className="size-3" />
            New Profile
          </div>
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
        onOpenChange={(nextOpen) => {
          if (!duplicateDialog.isProcessing) {
            setDuplicateDialog((prev) => ({ ...prev, open: nextOpen }))
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
                onChange={(event) =>
                  setDuplicateDialog((prev) => ({
                    ...prev,
                    newProfileName: event.target.value,
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
                onChange={(event) =>
                  setDuplicateDialog((prev) => ({
                    ...prev,
                    courseId: event.target.value,
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
                onChange={(event) =>
                  setDuplicateDialog((prev) => ({
                    ...prev,
                    courseName: event.target.value,
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
        onOpenChange={(nextOpen) =>
          setRenameDialog((prev) => ({ ...prev, open: nextOpen }))
        }
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename Profile</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="New name"
            value={renameDialog.newName}
            onChange={(event) =>
              setRenameDialog((prev) => ({
                ...prev,
                newName: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameDialog.newName.trim()) {
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
        onOpenChange={(nextOpen) =>
          setDeleteDialog((prev) => ({ ...prev, open: nextOpen }))
        }
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
