/**
 * UtilityBar - Bottom bar between tab content and output console.
 * Contains: Issues row (when issues exist), Clear button, Profile indicator, Save button, Profile menu.
 */

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo-edu/ui"
import { AlertTriangle, FolderOpen, Menu } from "@repo-edu/ui/components/icons"
import { commands } from "../bindings/commands"
import { useDataOverview } from "../hooks/useDataOverview"
import { useOutputStore } from "../stores/outputStore"
import { useProfileStore } from "../stores/profileStore"
import { useUiStore } from "../stores/uiStore"
import { SaveButton } from "./SaveButton"

interface UtilityBarProps {
  isDirty: boolean
  onSaved: () => void
}

export function UtilityBar({ isDirty, onSaved }: UtilityBarProps) {
  const clearOutput = useOutputStore((state) => state.clear)

  return (
    <div className="group/utilitybar border-t bg-muted/30">
      <IssuesRow />
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Button variant="outline" size="sm" onClick={clearOutput}>
          Clear
        </Button>
        <div className="flex-1" />
        <ProfileIndicator />
        <SaveButton isDirty={isDirty} onSaved={onSaved} />
        <ProfileMenu />
      </div>
    </div>
  )
}

/**
 * IssuesRow - Shows validation issues summary with animated show/hide.
 */
function IssuesRow() {
  const { issueSummary } = useDataOverview()
  const setDataOverviewOpen = useUiStore((state) => state.setDataOverviewOpen)

  const hasIssues = issueSummary.length > 0
  const visibleIssues = issueSummary.slice(0, 3)
  const extraCount = issueSummary.length - visibleIssues.length
  const summaryText = visibleIssues
    .map((item) => `${item.count} ${item.label}`)
    .join(" · ")

  return (
    <div
      className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
        hasIssues ? "max-h-12 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 bg-warning-muted px-3 py-2 text-sm text-warning border-b"
        onClick={() => setDataOverviewOpen(true)}
        aria-live="polite"
      >
        <AlertTriangle className="size-4" />
        <span className="truncate">
          {summaryText}
          {extraCount > 0 ? ` · +${extraCount} more` : ""}
        </span>
        <span className="ml-auto text-muted-foreground">Details</span>
      </button>
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
      className="max-w-[200px]"
    >
      <span className="truncate">
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
  const appendOutput = useOutputStore((state) => state.appendText)

  const handleShowProfileLocation = async () => {
    try {
      const result = await commands.revealProfilesDirectory()
      if (result.status === "error") {
        appendOutput(
          `Failed to open profiles directory: ${result.error.message}`,
          "error",
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      appendOutput(`Failed to open profiles directory: ${message}`, "error")
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
