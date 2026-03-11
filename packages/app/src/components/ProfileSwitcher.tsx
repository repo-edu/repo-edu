/**
 * ProfileSwitcher — Dropdown-based profile selector in the utility bar.
 * Shows all profiles with per-profile management actions (duplicate, rename,
 * delete) and a "New Profile" action.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  Dialog,
  DialogContent,
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
import { type KeyboardEvent, type MouseEvent, useEffect, useState } from "react"
import { useProfiles } from "../hooks/use-profiles.js"
import { useUiStore } from "../stores/ui-store.js"

export function ProfileSwitcher() {
  const activeProfileId = useUiStore((s) => s.activeProfileId)
  const setNewProfileDialogOpen = useUiStore((s) => s.setNewProfileDialogOpen)
  const {
    profiles,
    loading,
    refresh,
    switchProfile,
    duplicateProfile,
    renameProfile,
    deleteProfile,
  } = useProfiles()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeDisplayName =
    profiles.find((p) => p.id === activeProfileId)?.displayName ?? null

  // --- Rename dialog ---
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean
    profileId: string
    currentName: string
    newName: string
  }>({ open: false, profileId: "", currentName: "", newName: "" })

  // --- Duplicate dialog ---
  const [duplicateDialog, setDuplicateDialog] = useState<{
    open: boolean
    sourceProfileId: string
    sourceName: string
    newProfileName: string
    isProcessing: boolean
  }>({
    open: false,
    sourceProfileId: "",
    sourceName: "",
    newProfileName: "",
    isProcessing: false,
  })

  // --- Delete dialog ---
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    profileId: string
    profileName: string
  }>({ open: false, profileId: "", profileName: "" })

  const handleProfileSelect = (id: string) => {
    if (id === activeProfileId) return
    setOpen(false)
    void switchProfile(id)
  }

  const handleProfileKeyDown = (
    id: string,
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleProfileSelect(id)
    }
  }

  const handleActionClick = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation()
    action()
  }

  // --- Duplicate ---
  const handleDuplicateClick = (profileId: string, profileName: string) => {
    setOpen(false)
    setDuplicateDialog({
      open: true,
      sourceProfileId: profileId,
      sourceName: profileName,
      newProfileName: `${profileName} copy`,
      isProcessing: false,
    })
  }

  const handleDuplicateConfirm = async () => {
    const { sourceProfileId, newProfileName } = duplicateDialog
    if (!newProfileName.trim()) return

    setDuplicateDialog((prev) => ({ ...prev, isProcessing: true }))
    const success = await duplicateProfile(
      sourceProfileId,
      newProfileName.trim(),
    )

    if (success) {
      setDuplicateDialog({
        open: false,
        sourceProfileId: "",
        sourceName: "",
        newProfileName: "",
        isProcessing: false,
      })
    } else {
      setDuplicateDialog((prev) => ({ ...prev, isProcessing: false }))
    }
  }

  // --- Rename ---
  const handleRenameClick = (profileId: string, profileName: string) => {
    setOpen(false)
    setRenameDialog({
      open: true,
      profileId,
      currentName: profileName,
      newName: profileName,
    })
  }

  const handleRenameConfirm = async () => {
    const { profileId, newName } = renameDialog
    await renameProfile(profileId, newName)
    setRenameDialog({
      open: false,
      profileId: "",
      currentName: "",
      newName: "",
    })
  }

  // --- Delete ---
  const handleDeleteClick = (profileId: string, profileName: string) => {
    setOpen(false)
    setDeleteDialog({ open: true, profileId, profileName })
  }

  const handleDeleteConfirm = async () => {
    await deleteProfile(deleteDialog.profileId)
    setDeleteDialog({ open: false, profileId: "", profileName: "" })
  }

  // --- New profile ---
  const handleNewProfile = () => {
    setOpen(false)
    setNewProfileDialogOpen(true)
  }

  const canDuplicate = duplicateDialog.newProfileName.trim().length > 0

  const profileToDelete = deleteDialog.profileId
  const remainingProfiles = profiles.filter((p) => p.id !== profileToDelete)
  const isLastProfile = remainingProfiles.length === 0
  const nextProfile = remainingProfiles[0]?.displayName

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
              {loading ? "Loading..." : (activeDisplayName ?? "None")}
            </span>
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="top">
          {profiles.map((profile) => {
            const isActive = profile.id === activeProfileId
            return (
              <div
                key={profile.id}
                role="option"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => handleProfileSelect(profile.id)}
                onKeyDown={(event) => handleProfileKeyDown(profile.id, event)}
                className={cn(
                  "flex items-center justify-start gap-1 rounded-sm px-2 py-1.5 text-xs cursor-pointer",
                  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                  isActive && "bg-selection",
                )}
              >
                <span className="truncate">{profile.displayName}</span>
                <div className="flex shrink-0 items-center gap-0">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-4"
                    aria-label={`Duplicate ${profile.displayName}`}
                    title="Duplicate"
                    onClick={(event) =>
                      handleActionClick(event, () =>
                        handleDuplicateClick(profile.id, profile.displayName),
                      )
                    }
                  >
                    <Copy className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-4"
                    aria-label={`Rename ${profile.displayName}`}
                    title="Rename"
                    onClick={(event) =>
                      handleActionClick(event, () =>
                        handleRenameClick(profile.id, profile.displayName),
                      )
                    }
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-4"
                    aria-label={`Delete ${profile.displayName}`}
                    title="Delete"
                    onClick={(event) =>
                      handleActionClick(event, () =>
                        handleDeleteClick(profile.id, profile.displayName),
                      )
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            )
          })}

          {profiles.length > 0 && <DropdownMenuSeparator className="my-0.5" />}

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
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canDuplicate) {
                    void handleDuplicateConfirm()
                  }
                }}
                disabled={duplicateDialog.isProcessing}
                autoFocus
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
              onClick={() => void handleDuplicateConfirm()}
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
                void handleRenameConfirm()
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRenameDialog({
                  open: false,
                  profileId: "",
                  currentName: "",
                  newName: "",
                })
              }
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!renameDialog.newName.trim()}
              onClick={() => void handleRenameConfirm()}
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
                <>
                  Delete &quot;{deleteDialog.profileName}&quot;? This is your
                  last profile.
                </>
              ) : deleteDialog.profileId === activeProfileId ? (
                <>
                  Delete &quot;{deleteDialog.profileName}&quot;? You will be
                  switched to &quot;
                  {nextProfile}&quot;.
                </>
              ) : (
                <>Delete &quot;{deleteDialog.profileName}&quot;?</>
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
              onClick={() => void handleDeleteConfirm()}
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
