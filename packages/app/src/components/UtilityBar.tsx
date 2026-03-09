/**
 * UtilityBar — Bottom control bar.
 * Left: Profile switcher + utility menu (context). Right: Save button (action).
 */

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { FolderOpen, Menu } from "@repo-edu/ui/components/icons"
import { useToastStore } from "../stores/toast-store.js"
import { getErrorMessage } from "../utils/error-message.js"
import { ProfileSwitcher } from "./ProfileSwitcher.js"
import { SaveButton } from "./SaveButton.js"

type UtilityBarProps = {
  isDirty: boolean
  onSaved: () => void
}

export function UtilityBar({ isDirty, onSaved }: UtilityBarProps) {
  return (
    <div className="group/utilitybar border-t bg-muted/30">
      <div className="flex items-center gap-2 pl-2 pr-4 py-1.5 min-w-0">
        <div className="flex items-center min-w-0">
          <ProfileSwitcher isDirty={isDirty} />
          <UtilityMenu />
        </div>
        <div className="flex-1" />
        <SaveButton isDirty={isDirty} onSaved={onSaved} />
      </div>
    </div>
  )
}

/**
 * UtilityMenu — Generic overflow menu for profile-adjacent utility actions.
 */
type DesktopBridge = {
  revealProfilesDirectory?: () => Promise<void>
}

function getDesktopBridge(): DesktopBridge | undefined {
  return (window as unknown as Record<string, unknown>).repoEduDesktopHost as
    | DesktopBridge
    | undefined
}

function UtilityMenu() {
  const addToast = useToastStore((s) => s.addToast)
  const bridge = getDesktopBridge()

  const handleShowProfileLocation = async () => {
    try {
      await bridge?.revealProfilesDirectory?.()
    } catch (error) {
      const message = getErrorMessage(error)
      addToast(`Failed to open profiles directory: ${message}`, {
        tone: "error",
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Menu className="size-4" />
          <span className="sr-only">Utility menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top">
        <DropdownMenuItem onClick={() => void handleShowProfileLocation()}>
          <FolderOpen className="size-4 mr-2" />
          Show Profile Location
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
