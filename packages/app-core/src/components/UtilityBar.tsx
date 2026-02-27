/**
 * UtilityBar - Bottom status bar.
 * Contains: Profile indicator, Save button, Profile menu.
 */

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { FolderOpen, Menu } from "@repo-edu/ui/components/icons"
import { commands } from "../bindings/commands"
import { useProfileStore } from "../stores/profileStore"
import { useToastStore } from "../stores/toastStore"
import { useUiStore } from "../stores/uiStore"
import { SaveButton } from "./SaveButton"

interface UtilityBarProps {
  isDirty: boolean
  onSaved: () => void
}

export function UtilityBar({ isDirty, onSaved }: UtilityBarProps) {
  return (
    <div className="group/utilitybar border-t bg-muted/30">
      <div className="flex items-center gap-2 px-2 py-1.5 min-w-0">
        <div className="flex-1 min-w-0">
          <ProfileIndicator />
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <SaveButton isDirty={isDirty} onSaved={onSaved} />
          <ProfileMenu />
        </div>
      </div>
    </div>
  )
}

/**
 * ProfileIndicator - Shows active profile name, click to navigate to Roster tab.
 */
function ProfileIndicator() {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const setActiveTab = useUiStore((state) => state.setActiveTab)
  const course = useProfileStore(
    (state) => state.document?.settings.course ?? null,
  )

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setActiveTab("roster")}
      title="Click to manage profiles in Roster tab"
      className="w-full justify-start min-w-0 overflow-hidden"
    >
      <span className="block truncate">
        <span className="text-muted-foreground">Profile:</span>{" "}
        {activeProfile ?? "None"}
        {course?.name && (
          <span className="text-muted-foreground ml-1">({course.name})</span>
        )}
      </span>
    </Button>
  )
}

/**
 * ProfileMenu - Dropdown with profile-related actions.
 */
function ProfileMenu() {
  const activeProfile = useUiStore((state) => state.activeProfile)
  const addToast = useToastStore((state) => state.addToast)

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
        <DropdownMenuItem onClick={handleShowProfileLocation}>
          <FolderOpen className="size-4 mr-2" />
          Show Profile Location
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
