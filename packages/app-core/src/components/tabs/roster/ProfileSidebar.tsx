/**
 * ProfileSidebar - Left sidebar showing all profiles with dropdown actions.
 * Similar to AssignmentSidebar but for profile management.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@repo-edu/ui"
import { Copy, Loader2, Pencil, Trash2 } from "@repo-edu/ui/components/icons"
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
import type { ProfileItem } from "../../../hooks/useProfiles"
import { SidebarNav, type SidebarNavItem } from "../../SidebarNav"

interface ProfileNavItem extends SidebarNavItem {
  name: string
  courseName: string
}

interface ProfileSidebarProps {
  profiles: ProfileItem[]
  activeProfile: string | null
  isDirty: boolean
  onSelect: (name: string) => void
  onNew: () => void
  onDuplicate: (
    sourceName: string,
    newName: string,
    courseId: string,
    courseName: string,
  ) => Promise<boolean>
  onRename: (oldName: string, newName: string) => Promise<boolean>
  onDelete: (name: string) => Promise<boolean>
}

export function ProfileSidebar({
  profiles,
  activeProfile,
  isDirty,
  onSelect,
  onNew,
  onDuplicate,
  onRename,
  onDelete,
}: ProfileSidebarProps) {
  // Unsaved changes dialog
  const [unsavedDialog, setUnsavedDialog] = useState<{
    open: boolean
    targetProfile: string
  }>({ open: false, targetProfile: "" })

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

  const items: ProfileNavItem[] = profiles.map((profile) => ({
    id: profile.name,
    label: profile.name,
    name: profile.name,
    courseName: profile.courseName,
  }))

  const handleProfileSelect = (id: string) => {
    if (id === activeProfile) return

    if (isDirty) {
      setUnsavedDialog({ open: true, targetProfile: id })
    } else {
      onSelect(id)
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

    const success = await onDuplicate(
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
    await onRename(profileName, newName)
    setRenameDialog({ open: false, profileName: "", newName: "" })
  }

  const handleDeleteClick = (name: string) => {
    setDeleteDialog({ open: true, profileName: name })
  }

  const handleDeleteConfirm = async () => {
    const { profileName } = deleteDialog
    await onDelete(profileName)
    setDeleteDialog({ open: false, profileName: "" })
  }

  const canDuplicate =
    duplicateDialog.newProfileName.trim() &&
    duplicateDialog.courseId.trim() &&
    duplicateDialog.courseName.trim()

  // Calculate what happens on delete for the dialog message
  const profileToDelete = deleteDialog.profileName
  const remainingProfiles = profiles.filter((p) => p.name !== profileToDelete)
  const willCreateDefault = remainingProfiles.length === 0
  const nextProfile = remainingProfiles[0]?.name

  return (
    <>
      <SidebarNav
        title="Profiles"
        items={items}
        selectedId={activeProfile}
        onSelect={handleProfileSelect}
        className="w-52"
        actionMode="dropdown"
        actions={[
          {
            icon: <Copy className="size-3" />,
            onClick: handleDuplicateClick,
            label: "Duplicate",
          },
          {
            icon: <Pencil className="size-3" />,
            onClick: handleRenameClick,
            label: "Rename",
          },
          {
            icon: <Trash2 className="size-3" />,
            onClick: handleDeleteClick,
            label: "Delete",
          },
        ]}
        addNew={{
          label: "New Profile",
          onClick: onNew,
        }}
      />

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
                onSelect(unsavedDialog.targetProfile)
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
              {willCreateDefault ? (
                <>
                  Delete "{profileToDelete}"? A new "Default" profile will be
                  created.
                </>
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
