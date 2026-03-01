/**
 * ProfileSwitcher - Dropdown-based profile selector in the status bar.
 * Shows all profiles with click-to-switch and a "New Profile" action.
 * Active profile highlighted with bg-selection.
 * Management actions (Duplicate/Rename/Delete) live in the adjacent ProfileMenu.
 */

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { ChevronUp, Plus } from "@repo-edu/ui/components/icons"
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
  const { profiles, switchProfile } = useProfiles()

  const [unsavedDialog, setUnsavedDialog] = useState<{
    open: boolean
    targetProfile: string
  }>({ open: false, targetProfile: "" })

  const handleProfileSelect = (name: string) => {
    if (name === activeProfile) return

    if (isDirty) {
      setUnsavedDialog({ open: true, targetProfile: name })
    } else {
      switchProfile(name)
    }
  }

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
              <DropdownMenuItem
                key={profile.name}
                onClick={() => handleProfileSelect(profile.name)}
                className={cn(isActive && "bg-selection")}
              >
                {profile.name}
              </DropdownMenuItem>
            )
          })}

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
    </>
  )
}
